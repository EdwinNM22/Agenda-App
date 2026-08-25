import { mkdir, rm, rmdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const uploadsRoot = path.join(backendRoot, "uploads")
export const avatarsDir = path.join(uploadsRoot, "avatars")
export const wallpapersDir = path.join(uploadsRoot, "wallpapers")
export const attachmentsDir = path.join(uploadsRoot, "attachments")

export const ensureUploadDirs = async () => {
  await mkdir(avatarsDir, { recursive: true })
  await mkdir(wallpapersDir, { recursive: true })
  await mkdir(attachmentsDir, { recursive: true })
}

export const withoutApiPrefix = (url: string): string => url.replace(/^\/api(?=\/)/, "")

export const publicAssetPath = (url: string | null | undefined): string | null => {
  if (!url) {
    return null
  }
  return withoutApiPrefix(url)
}

export const avatarPublicPath = (relativePath: string) => `/uploads/avatars/${relativePath}`

export const avatarThumbPublicPath = (avatarUrl: string | null): string | null => {
  if (!avatarUrl) {
    return null
  }
  if (avatarUrl.endsWith("/full.webp")) {
    return `${avatarUrl.slice(0, -"full.webp".length)}thumb.webp`
  }
  return avatarUrl
}

export const userAvatarFolder = (userId: number, assetId: string) =>
  path.posix.join("users", String(userId), assetId)

export const userAvatarDiskDir = (userId: number, assetId: string) =>
  path.join(avatarsDir, "users", String(userId), assetId)

export const wallpaperPublicPath = (relativePath: string) => `/uploads/wallpapers/${relativePath}`

export const userWallpaperFolder = (userId: number, assetId: string) =>
  path.posix.join("users", String(userId), assetId)

export const userWallpaperDiskDir = (userId: number, assetId: string) =>
  path.join(wallpapersDir, "users", String(userId), assetId)

export const taskAttachmentFolder = (userId: number, taskId: number, assetId: string) =>
  path.posix.join("users", String(userId), "tasks", String(taskId), assetId)

export const taskAttachmentDiskDir = (userId: number, taskId: number, assetId: string) =>
  path.join(attachmentsDir, "users", String(userId), "tasks", String(taskId), assetId)

export const taskAttachmentsDiskDir = (userId: number, taskId: number) =>
  path.join(attachmentsDir, "users", String(userId), "tasks", String(taskId))

export const isPathInside = (root: string, target: string) => {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

export const removePath = async (absolutePath: string) => {
  await rm(absolutePath, { recursive: true, force: true })
}

export const removeStoredAttachment = async (relativeFile: string) => {
  const absolute = path.resolve(attachmentsDir, relativeFile)
  if (!isPathInside(attachmentsDir, absolute)) {
    return
  }
  const dir = path.dirname(absolute)
  const root = path.resolve(attachmentsDir)
  if (dir === root) {
    await rm(absolute, { force: true })
    return
  }
  await removePath(dir)
  let parent = path.dirname(dir)
  while (parent !== root && isPathInside(attachmentsDir, parent)) {
    try {
      await rmdir(parent)
    } catch {
      break
    }
    parent = path.dirname(parent)
  }
}

export const removeTaskAttachments = async (userId: number, taskId: number) => {
  await removePath(taskAttachmentsDiskDir(userId, taskId))
}

export const avatarFilenameFromUrl = (avatarUrl: string | null): string | null => {
  if (!avatarUrl) {
    return null
  }
  const prefix = "/uploads/avatars/"
  const normalized = withoutApiPrefix(avatarUrl)
  if (!normalized.startsWith(prefix)) {
    return null
  }
  const filename = normalized.slice(prefix.length)
  if (!filename || filename.includes("..") || filename.includes("\\")) {
    return null
  }
  return filename
}

export const wallpaperDiskPathFromUrl = (wallpaperUrl: string | null): string | null => {
  const relativeFile = wallpaperFilenameFromUrl(wallpaperUrl)
  if (!relativeFile) {
    return null
  }
  const absolute = path.resolve(wallpapersDir, relativeFile)
  if (!isPathInside(wallpapersDir, absolute)) {
    return null
  }
  return absolute
}

export const wallpaperFilenameFromUrl = (wallpaperUrl: string | null): string | null => {
  if (!wallpaperUrl) {
    return null
  }
  const prefix = "/uploads/wallpapers/"
  const normalized = withoutApiPrefix(wallpaperUrl)
  if (!normalized.startsWith(prefix)) {
    return null
  }
  const filename = normalized.slice(prefix.length)
  if (!filename || filename.includes("..") || filename.includes("\\")) {
    return null
  }
  return filename
}

export const removeStoredWallpaper = async (wallpaperUrl: string | null) => {
  const relativeFile = wallpaperFilenameFromUrl(wallpaperUrl)
  if (!relativeFile) {
    return
  }
  const absolute = path.resolve(wallpapersDir, relativeFile)
  if (!isPathInside(wallpapersDir, absolute)) {
    return
  }
  const dir = path.dirname(absolute)
  const root = path.resolve(wallpapersDir)
  if (dir === root) {
    await rm(absolute, { force: true })
    return
  }
  await removePath(dir)
  let parent = path.dirname(dir)
  while (parent !== root && isPathInside(wallpapersDir, parent)) {
    try {
      await rmdir(parent)
    } catch {
      break
    }
    parent = path.dirname(parent)
  }
}

export const removeStoredAvatar = async (avatarUrl: string | null) => {
  const relativeFile = avatarFilenameFromUrl(avatarUrl)
  if (!relativeFile) {
    return
  }
  const absolute = path.resolve(avatarsDir, relativeFile)
  if (!isPathInside(avatarsDir, absolute)) {
    return
  }
  const dir = path.dirname(absolute)
  const root = path.resolve(avatarsDir)
  if (dir === root) {
    await rm(absolute, { force: true })
    return
  }
  await removePath(dir)
  let parent = path.dirname(dir)
  while (parent !== root && isPathInside(avatarsDir, parent)) {
    try {
      await rmdir(parent)
    } catch {
      break
    }
    parent = path.dirname(parent)
  }
}
