import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FastifyInstance } from "fastify"
import { compare, hash } from "bcryptjs"
import type { ResultSetHeader } from "mysql2"
import {
  clampWallpaperValue,
  parseAppearanceTheme,
  pool,
  toPublicUser,
  USER_COLUMNS,
  type UserRow,
} from "../db.js"
import {
  extractWallpaperColor,
  isOptimizableImage,
  optimizeAvatarFull,
  optimizeAvatarThumb,
  optimizeWallpaper,
} from "../imageOptimize.js"
import {
  avatarPublicPath,
  removePath,
  removeStoredAvatar,
  removeStoredWallpaper,
  userAvatarDiskDir,
  userAvatarFolder,
  userWallpaperDiskDir,
  userWallpaperFolder,
  wallpaperDiskPathFromUrl,
  wallpaperPublicPath,
} from "../uploads.js"

type LoginBody = {
  email: string
  password: string
}

type CreateAccountBody = {
  name: string
  email: string
  password: string
}

type ProfileBody = {
  name?: string
  email?: string
  currentPassword?: string
  newPassword?: string
  theme?: string
  wallpaperX?: number
  wallpaperY?: number
  wallpaperZoom?: number
}

const AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
])

const fillWallpaperColor = async (user: UserRow): Promise<UserRow> => {
  if (user.wallpaper_color || !user.wallpaper_url) {
    return user
  }
  const absolute = wallpaperDiskPathFromUrl(user.wallpaper_url)
  if (!absolute) {
    return user
  }
  try {
    const buffer = await readFile(absolute)
    const wallpaperColor = await extractWallpaperColor(buffer)
    await pool.query("UPDATE users SET wallpaper_color = :wallpaperColor WHERE id = :id", {
      wallpaperColor,
      id: user.id,
    })
    return { ...user, wallpaper_color: wallpaperColor }
  } catch {
    return user
  }
}

const findUserById = async (id: number) => {
  const [rows] = await pool.query<UserRow[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = :id LIMIT 1`,
    { id },
  )
  const user = rows[0] ?? null
  return user ? fillWallpaperColor(user) : null
}

export const registerAuthRoutes = async (app: FastifyInstance) => {
  app.post<{ Body: LoginBody }>(
    "/auth/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", minLength: 1 },
            password: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase()
      const { password } = request.body

      const [rows] = await pool.query<UserRow[]>(
        `SELECT ${USER_COLUMNS} FROM users WHERE email = :email LIMIT 1`,
        { email },
      )

      const user = rows[0]
      if (!user) {
        return reply.code(401).send({ message: "Credenciales inválidas" })
      }

      const valid = await compare(password, user.password_hash)
      if (!valid) {
        return reply.code(401).send({ message: "Credenciales inválidas" })
      }

      const token = await reply.jwtSign({ sub: user.id, email: user.email })
      const withColor = await fillWallpaperColor(user)

      return { token, user: toPublicUser(withColor) }
    },
  )

  app.post<{ Body: CreateAccountBody }>(
    "/auth/users",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            email: { type: "string", minLength: 3, maxLength: 255 },
            password: { type: "string", minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const name = request.body.name.trim()
      const email = request.body.email.trim().toLowerCase()
      const { password } = request.body

      if (!name) {
        return reply.code(400).send({ message: "El nombre es obligatorio" })
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.code(400).send({ message: "El correo no es válido" })
      }

      const [existing] = await pool.query<UserRow[]>(
        "SELECT id FROM users WHERE email = :email LIMIT 1",
        { email },
      )
      if (existing[0]) {
        return reply.code(409).send({ message: "Ese correo ya está en uso" })
      }

      const passwordHash = await hash(password, 10)
      const [result] = await pool.query<ResultSetHeader>(
        "INSERT INTO users (email, password_hash, name) VALUES (:email, :passwordHash, :name)",
        { email, passwordHash, name },
      )

      const created = await findUserById(result.insertId)
      if (!created) {
        return reply.code(500).send({ message: "No se pudo crear la cuenta" })
      }

      return reply.code(201).send({ user: toPublicUser(created) })
    },
  )

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await findUserById(request.user.sub)
    if (!user) {
      return reply.code(401).send({ message: "No autorizado" })
    }

    return { user: toPublicUser(user) }
  })

  app.patch<{ Body: ProfileBody }>(
    "/auth/me",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            email: { type: "string", minLength: 3, maxLength: 255 },
            currentPassword: { type: "string", minLength: 1 },
            newPassword: { type: "string", minLength: 8, maxLength: 200 },
            theme: { type: "string", enum: ["light", "dark", "wallpaper"] },
            wallpaperX: { type: "number" },
            wallpaperY: { type: "number" },
            wallpaperZoom: { type: "number" },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await findUserById(request.user.sub)
      if (!user) {
        return reply.code(401).send({ message: "No autorizado" })
      }

      const nextName = request.body.name?.trim() || user.name
      const nextEmail = request.body.email?.trim().toLowerCase() || user.email
      const nextTheme = request.body.theme
        ? parseAppearanceTheme(request.body.theme)
        : parseAppearanceTheme(user.theme)
      const nextWallpaperX = clampWallpaperValue(
        request.body.wallpaperX ?? user.wallpaper_x,
        50,
        0,
        100,
      )
      const nextWallpaperY = clampWallpaperValue(
        request.body.wallpaperY ?? user.wallpaper_y,
        50,
        0,
        100,
      )
      const nextWallpaperZoom = clampWallpaperValue(
        request.body.wallpaperZoom ?? user.wallpaper_zoom,
        1,
        1,
        2.4,
      )
      const emailChanged = nextEmail !== user.email
      const passwordChanged = Boolean(request.body.newPassword)

      if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        return reply.code(400).send({ message: "El correo no es válido" })
      }

      if (emailChanged) {
        const [existing] = await pool.query<UserRow[]>(
          "SELECT id FROM users WHERE email = :email AND id <> :id LIMIT 1",
          { email: nextEmail, id: user.id },
        )
        if (existing[0]) {
          return reply.code(409).send({ message: "Ese correo ya está en uso" })
        }
      }

      const passwordHash = passwordChanged
        ? await hash(request.body.newPassword ?? "", 10)
        : user.password_hash

      await pool.query(
        `UPDATE users
         SET name = :name, email = :email, password_hash = :passwordHash, theme = :theme,
             wallpaper_x = :wallpaperX, wallpaper_y = :wallpaperY, wallpaper_zoom = :wallpaperZoom
         WHERE id = :id`,
        {
          name: nextName,
          email: nextEmail,
          passwordHash,
          theme: nextTheme,
          wallpaperX: nextWallpaperX,
          wallpaperY: nextWallpaperY,
          wallpaperZoom: nextWallpaperZoom,
          id: user.id,
        },
      )

      const updated = await findUserById(user.id)
      if (!updated) {
        return reply.code(500).send({ message: "No se pudo actualizar el perfil" })
      }

      const publicUser = toPublicUser(updated)
      if (!emailChanged) {
        return { user: publicUser }
      }

      const token = await reply.jwtSign({ sub: updated.id, email: updated.email })
      return { token, user: publicUser }
    },
  )

  app.post(
    "/auth/me/avatar",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const user = await findUserById(request.user.sub)
      if (!user) {
        return reply.code(401).send({ message: "No autorizado" })
      }

      let file: Awaited<ReturnType<typeof request.file>>
      try {
        file = await request.file()
      } catch (error) {
        if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
          return reply.code(413).send({ message: "La imagen es demasiado grande (máx. 12 MB)" })
        }
        throw error
      }

      if (!file) {
        return reply.code(400).send({ message: "Selecciona una foto de perfil" })
      }

      if (!AVATAR_TYPES.has(file.mimetype) || !isOptimizableImage(file.mimetype)) {
        await file.toBuffer().catch(() => undefined)
        return reply.code(400).send({ message: "Usa una imagen JPG, PNG, WEBP, HEIC o GIF" })
      }

      let buffer: Buffer
      try {
        buffer = await file.toBuffer()
      } catch (error) {
        if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
          return reply.code(413).send({ message: "La imagen es demasiado grande (máx. 12 MB)" })
        }
        throw error
      }

      const assetId = randomUUID()
      const folder = userAvatarFolder(user.id, assetId)
      const diskDir = userAvatarDiskDir(user.id, assetId)
      await mkdir(diskDir, { recursive: true })

      try {
        const [full, thumb] = await Promise.all([
          optimizeAvatarFull(buffer),
          optimizeAvatarThumb(buffer),
        ])
        await writeFile(path.join(diskDir, "full.webp"), full)
        await writeFile(path.join(diskDir, "thumb.webp"), thumb)
      } catch {
        await removePath(diskDir)
        return reply.code(400).send({ message: "No se pudo optimizar la foto de perfil" })
      }

      const avatarUrl = avatarPublicPath(`${folder}/full.webp`)

      await pool.query("UPDATE users SET avatar_url = :avatarUrl WHERE id = :id", {
        avatarUrl,
        id: user.id,
      })
      await removeStoredAvatar(user.avatar_url)

      const updated = await findUserById(user.id)
      if (!updated) {
        return reply.code(500).send({ message: "No se pudo guardar la foto" })
      }

      return { user: toPublicUser(updated) }
    },
  )

  app.post(
    "/auth/me/wallpaper",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const user = await findUserById(request.user.sub)
      if (!user) {
        return reply.code(401).send({ message: "No autorizado" })
      }

      let file: Awaited<ReturnType<typeof request.file>>
      try {
        file = await request.file()
      } catch (error) {
        if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
          return reply.code(413).send({ message: "La imagen es demasiado grande (máx. 12 MB)" })
        }
        throw error
      }

      if (!file) {
        return reply.code(400).send({ message: "Selecciona una imagen de fondo" })
      }

      if (!AVATAR_TYPES.has(file.mimetype) || !isOptimizableImage(file.mimetype)) {
        await file.toBuffer().catch(() => undefined)
        return reply.code(400).send({ message: "Usa una imagen JPG, PNG, WEBP, HEIC o GIF" })
      }

      let buffer: Buffer
      try {
        buffer = await file.toBuffer()
      } catch (error) {
        if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
          return reply.code(413).send({ message: "La imagen es demasiado grande (máx. 12 MB)" })
        }
        throw error
      }

      const assetId = randomUUID()
      const folder = userWallpaperFolder(user.id, assetId)
      const diskDir = userWallpaperDiskDir(user.id, assetId)
      await mkdir(diskDir, { recursive: true })

      let wallpaperColor = "#1a1a1a"
      try {
        const [image, color] = await Promise.all([optimizeWallpaper(buffer), extractWallpaperColor(buffer)])
        wallpaperColor = color
        await writeFile(path.join(diskDir, "full.webp"), image)
      } catch {
        await removePath(diskDir)
        return reply.code(400).send({ message: "No se pudo guardar el fondo" })
      }

      const wallpaperUrl = wallpaperPublicPath(`${folder}/full.webp`)
      const fields = file.fields as Record<string, { value?: string } | { value?: string }[] | undefined>
      const fieldValue = (key: string) => {
        const field = fields?.[key]
        const item = Array.isArray(field) ? field[0] : field
        return item?.value
      }
      const wallpaperX = clampWallpaperValue(fieldValue("x"), 50, 0, 100)
      const wallpaperY = clampWallpaperValue(fieldValue("y"), 50, 0, 100)
      const wallpaperZoom = clampWallpaperValue(fieldValue("zoom"), 1, 1, 2.4)
      await pool.query(
        `UPDATE users
         SET wallpaper_url = :wallpaperUrl, theme = 'wallpaper',
             wallpaper_x = :wallpaperX, wallpaper_y = :wallpaperY, wallpaper_zoom = :wallpaperZoom,
             wallpaper_color = :wallpaperColor
         WHERE id = :id`,
        { wallpaperUrl, wallpaperX, wallpaperY, wallpaperZoom, wallpaperColor, id: user.id },
      )
      await removeStoredWallpaper(user.wallpaper_url)

      const updated = await findUserById(user.id)
      if (!updated) {
        return reply.code(500).send({ message: "No se pudo guardar el fondo" })
      }

      return { user: toPublicUser(updated) }
    },
  )
}
