import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FastifyInstance } from "fastify"
import type { ResultSetHeader } from "mysql2"
import {
  parseTaskStatus,
  pool,
  toPublicAttachment,
  toPublicTask,
  type AttachmentRow,
  type PublicAttachment,
  type TaskRow,
  type TaskStatus,
} from "../db.js"
import { toNaiveDateTime } from "../naiveDateTime.js"
import { publishTaskEvent } from "../taskHub.js"
import { isOptimizableImage, optimizeFullImage, optimizeThumbImage } from "../imageOptimize.js"
import {
  removePath,
  removeStoredAttachment,
  removeTaskAttachments,
  taskAttachmentDiskDir,
  taskAttachmentFolder,
} from "../uploads.js"

type TaskCreateBody = {
  title: string
  description?: string
  dueAt?: string | null
  status?: string
}

type TaskPatchBody = {
  title?: string
  description?: string
  dueAt?: string | null
  status?: string
}

type TaskParams = {
  id: string
}

const TASK_COLUMNS = "id, user_id, title, description, due_at, status, created_at"

const parseTaskId = (raw: string): number | null => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    return null
  }
  return id
}

const parseDueAt = (value?: string | null): string | null => toNaiveDateTime(value)

const findOwnTask = async (taskId: number, userId: number) => {
  const [rows] = await pool.query<TaskRow[]>(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = :id AND user_id = :userId LIMIT 1`,
    { id: taskId, userId },
  )
  return rows[0] ?? null
}

const MAX_ATTACHMENTS = 10

const ATTACHMENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}

const attachmentsForTasks = async (taskIds: number[], userId: number) => {
  const grouped = new Map<number, PublicAttachment[]>()
  if (taskIds.length === 0) {
    return grouped
  }
  const [rows] = await pool.query<AttachmentRow[]>(
    `SELECT id, task_id, user_id, filename, thumb_filename, original_name, mime_type, size, created_at
     FROM task_attachments
     WHERE user_id = :userId AND task_id IN (${taskIds.join(",")})
     ORDER BY id DESC`,
    { userId },
  )
  for (const row of rows) {
    const list = grouped.get(row.task_id) ?? []
    list.push(toPublicAttachment(row))
    grouped.set(row.task_id, list)
  }
  return grouped
}

const toPublicOwnTask = async (task: TaskRow, userId: number) => {
  const grouped = await attachmentsForTasks([task.id], userId)
  return toPublicTask(task, grouped.get(task.id) ?? [])
}

type TaskQuery = {
  date?: string
}

const isDateOnly = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)

export const registerTaskRoutes = async (app: FastifyInstance) => {
  app.get<{ Querystring: TaskQuery }>("/tasks", { onRequest: [app.authenticate] }, async (request) => {
    const date = request.query.date?.trim()
    const filterByDate = date && isDateOnly(date) ? date : null

    const [rows] = await pool.query<TaskRow[]>(
      filterByDate
        ? `SELECT ${TASK_COLUMNS}
           FROM tasks
           WHERE user_id = :userId AND due_at LIKE :datePrefix
           ORDER BY FIELD(status, 'pending', 'completed', 'cancelled', 'archived'), due_at ASC, id DESC`
        : `SELECT ${TASK_COLUMNS}
           FROM tasks
           WHERE user_id = :userId
           ORDER BY FIELD(status, 'pending', 'completed', 'cancelled', 'archived'), due_at IS NULL, due_at ASC, id DESC`,
      filterByDate
        ? { userId: request.user.sub, datePrefix: `${filterByDate}%` }
        : { userId: request.user.sub },
    )

    const grouped = await attachmentsForTasks(
      rows.map((row) => row.id),
      request.user.sub,
    )
    return {
      tasks: rows.map((row) => toPublicTask(row, grouped.get(row.id) ?? [])),
    }
  })

  app.post<{ Body: TaskCreateBody }>(
    "/tasks",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            description: { type: "string" },
            dueAt: { type: ["string", "null"] },
            status: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const title = request.body.title.trim()
      const description = (request.body.description ?? "").trim()
      const dueAt = parseDueAt(request.body.dueAt)
      const status = request.body.status ? parseTaskStatus(request.body.status) : "pending"

      if (!title) {
        return reply.code(400).send({ message: "El título es obligatorio" })
      }
      if (request.body.dueAt && !dueAt) {
        return reply.code(400).send({ message: "La fecha y hora no son válidas" })
      }
      if (request.body.status && !status) {
        return reply.code(400).send({ message: "El estado no es válido" })
      }

      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO tasks (user_id, title, description, due_at, status)
         VALUES (:userId, :title, :description, :dueAt, :status)`,
        { userId: request.user.sub, title, description, dueAt, status },
      )

      const task = await findOwnTask(result.insertId, request.user.sub)
      if (!task) {
        return reply.code(500).send({ message: "No se pudo crear la tarea" })
      }

      const publicTask = await toPublicOwnTask(task, request.user.sub)
      publishTaskEvent(request.user.sub, { type: "task.created", task: publicTask })
      return reply.code(201).send({ task: publicTask })
    },
  )

  app.patch<{ Params: TaskParams; Body: TaskPatchBody }>(
    "/tasks/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            description: { type: "string" },
            dueAt: { type: ["string", "null"] },
            status: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const taskId = parseTaskId(request.params.id)
      if (!taskId) {
        return reply.code(400).send({ message: "Tarea no válida" })
      }

      const existing = await findOwnTask(taskId, request.user.sub)
      if (!existing) {
        return reply.code(404).send({ message: "Tarea no encontrada" })
      }

      const body = request.body
      const title = body.title !== undefined ? body.title.trim() : existing.title
      const description =
        body.description !== undefined ? body.description.trim() : existing.description
      let dueAt = existing.due_at
      if (body.dueAt !== undefined) {
        dueAt = parseDueAt(body.dueAt)
        if (body.dueAt && !dueAt) {
          return reply.code(400).send({ message: "La fecha y hora no son válidas" })
        }
      }

      let status: TaskStatus = existing.status
      if (body.status !== undefined) {
        const parsed = parseTaskStatus(body.status)
        if (!parsed) {
          return reply.code(400).send({ message: "El estado no es válido" })
        }
        status = parsed
      }

      if (!title) {
        return reply.code(400).send({ message: "El título es obligatorio" })
      }

      await pool.query(
        `UPDATE tasks
         SET title = :title, description = :description, due_at = :dueAt, status = :status
         WHERE id = :id AND user_id = :userId`,
        { id: taskId, userId: request.user.sub, title, description, dueAt, status },
      )

      const task = await findOwnTask(taskId, request.user.sub)
      if (!task) {
        return reply.code(404).send({ message: "Tarea no encontrada" })
      }

      const publicTask = await toPublicOwnTask(task, request.user.sub)
      publishTaskEvent(request.user.sub, { type: "task.updated", task: publicTask })
      return { task: publicTask }
    },
  )

  app.delete<{ Params: TaskParams }>(
    "/tasks/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const taskId = parseTaskId(request.params.id)
      if (!taskId) {
        return reply.code(400).send({ message: "Tarea no válida" })
      }

      const existing = await findOwnTask(taskId, request.user.sub)
      if (!existing) {
        return reply.code(404).send({ message: "Tarea no encontrada" })
      }

      const [files] = await pool.query<AttachmentRow[]>(
        "SELECT filename FROM task_attachments WHERE task_id = :id AND user_id = :userId",
        { id: taskId, userId: request.user.sub },
      )
      await pool.query("DELETE FROM tasks WHERE id = :id AND user_id = :userId", {
        id: taskId,
        userId: request.user.sub,
      })
      await Promise.all(files.map((file) => removeStoredAttachment(file.filename)))
      await removeTaskAttachments(request.user.sub, taskId)

      publishTaskEvent(request.user.sub, { type: "task.deleted", id: taskId })
      return { ok: true }
    },
  )

  app.post<{ Params: TaskParams }>(
    "/tasks/:id/attachments",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const taskId = parseTaskId(request.params.id)
      if (!taskId) {
        return reply.code(400).send({ message: "Tarea no válida" })
      }
      const existing = await findOwnTask(taskId, request.user.sub)
      if (!existing) {
        return reply.code(404).send({ message: "Tarea no encontrada" })
      }

      const [countRows] = await pool.query<({ total: number } & import("mysql2").RowDataPacket)[]>(
        "SELECT COUNT(*) AS total FROM task_attachments WHERE task_id = :taskId AND user_id = :userId",
        { taskId, userId: request.user.sub },
      )
      if (Number(countRows[0]?.total ?? 0) >= MAX_ATTACHMENTS) {
        return reply.code(400).send({ message: "Máximo 10 archivos por tarea" })
      }

      let file: Awaited<ReturnType<typeof request.file>>
      try {
        file = await request.file()
      } catch (error) {
        if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
          return reply.code(413).send({ message: "El archivo es demasiado grande (máx. 12 MB)" })
        }
        throw error
      }
      if (!file) {
        return reply.code(400).send({ message: "Selecciona un archivo" })
      }

      const extension = ATTACHMENT_TYPES[file.mimetype]
      if (!extension) {
        await file.toBuffer().catch(() => undefined)
        return reply.code(400).send({ message: "Formato no permitido. Usa foto, PDF, TXT, ZIP, DOCX o XLSX" })
      }

      let buffer: Buffer
      try {
        buffer = await file.toBuffer()
      } catch (error) {
        if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
          return reply.code(413).send({ message: "El archivo es demasiado grande (máx. 12 MB)" })
        }
        throw error
      }

      const assetId = randomUUID()
      const folder = taskAttachmentFolder(request.user.sub, taskId, assetId)
      const diskDir = taskAttachmentDiskDir(request.user.sub, taskId, assetId)
      await mkdir(diskDir, { recursive: true })

      let storedName = `file.${extension}`
      let storedMime = file.mimetype
      let storedSize = buffer.length
      let thumbRel: string | null = null

      try {
        if (isOptimizableImage(file.mimetype)) {
          const [full, thumb] = await Promise.all([
            optimizeFullImage(buffer),
            optimizeThumbImage(buffer),
          ])
          storedName = "full.webp"
          storedMime = "image/webp"
          storedSize = full.length
          thumbRel = path.posix.join(folder, "thumb.webp")
          await writeFile(path.join(diskDir, "full.webp"), full)
          await writeFile(path.join(diskDir, "thumb.webp"), thumb)
        } else {
          await writeFile(path.join(diskDir, storedName), buffer)
        }
      } catch {
        await removePath(diskDir)
        return reply.code(400).send({
          message: isOptimizableImage(file.mimetype)
            ? "No se pudo optimizar la imagen"
            : "No se pudo guardar el archivo",
        })
      }

      const relativeFile = path.posix.join(folder, storedName)
      const originalName = (file.filename?.replace(/\.[^.]+$/, "") || "archivo").slice(0, 240)
      const displayName = isOptimizableImage(file.mimetype)
        ? `${originalName}.webp`
        : file.filename?.slice(0, 255) || storedName

      let result: ResultSetHeader
      try {
        ;[result] = await pool.query<ResultSetHeader>(
          `INSERT INTO task_attachments (task_id, user_id, filename, thumb_filename, original_name, mime_type, size)
           VALUES (:taskId, :userId, :filename, :thumbFilename, :originalName, :mimeType, :size)`,
          {
            taskId,
            userId: request.user.sub,
            filename: relativeFile,
            thumbFilename: thumbRel,
            originalName: displayName,
            mimeType: storedMime,
            size: storedSize,
          },
        )
      } catch (error) {
        await removePath(diskDir)
        throw error
      }

      const publicTask = await toPublicOwnTask(existing, request.user.sub)
      publishTaskEvent(request.user.sub, { type: "task.updated", task: publicTask })
      const attachment = publicTask.attachments.find((item) => item.id === result.insertId)
      return reply.code(201).send({ attachment, task: publicTask })
    },
  )

  app.delete<{ Params: TaskParams & { attachmentId: string } }>(
    "/tasks/:id/attachments/:attachmentId",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const taskId = parseTaskId(request.params.id)
      const attachmentId = parseTaskId(request.params.attachmentId)
      if (!taskId || !attachmentId) {
        return reply.code(400).send({ message: "Archivo no válido" })
      }
      const existing = await findOwnTask(taskId, request.user.sub)
      if (!existing) {
        return reply.code(404).send({ message: "Tarea no encontrada" })
      }

      const [rows] = await pool.query<AttachmentRow[]>(
        `SELECT id, task_id, user_id, filename, thumb_filename, original_name, mime_type, size, created_at
         FROM task_attachments
         WHERE id = :id AND task_id = :taskId AND user_id = :userId LIMIT 1`,
        { id: attachmentId, taskId, userId: request.user.sub },
      )
      const attachment = rows[0]
      if (!attachment) {
        return reply.code(404).send({ message: "Archivo no encontrado" })
      }

      await pool.query("DELETE FROM task_attachments WHERE id = :id AND user_id = :userId", {
        id: attachmentId,
        userId: request.user.sub,
      })
      await removeStoredAttachment(attachment.filename)

      const publicTask = await toPublicOwnTask(existing, request.user.sub)
      publishTaskEvent(request.user.sub, { type: "task.updated", task: publicTask })
      return { ok: true, task: publicTask }
    },
  )
}
