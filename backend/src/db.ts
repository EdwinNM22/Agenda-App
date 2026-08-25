import type { RowDataPacket } from "mysql2"
import mysql from "mysql2/promise"
import { config } from "./config.js"
import { avatarThumbPublicPath, publicAssetPath } from "./uploads.js"

export const pool = mysql.createPool({
  host: config.db.socketPath ? undefined : config.db.host,
  port: config.db.socketPath ? undefined : config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  socketPath: config.db.socketPath,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
})

export const APPEARANCE_THEMES = ["light", "dark", "wallpaper"] as const

export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number]

export type UserRow = RowDataPacket & {
  id: number
  email: string
  password_hash: string
  name: string
  avatar_url: string | null
  theme: string | null
  wallpaper_url: string | null
  wallpaper_x: number | null
  wallpaper_y: number | null
  wallpaper_zoom: number | null
  wallpaper_color: string | null
}

export type PublicUser = {
  id: number
  email: string
  name: string
  avatarUrl: string | null
  avatarThumbUrl: string | null
  theme: AppearanceTheme
  wallpaperUrl: string | null
  wallpaperX: number
  wallpaperY: number
  wallpaperZoom: number
  wallpaperColor: string | null
}

export const parseAppearanceTheme = (value: unknown): AppearanceTheme =>
  value === "light" || value === "wallpaper" || value === "dark" ? value : "dark"

export const clampWallpaperValue = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }
  return Math.min(max, Math.max(min, number))
}

export const parseWallpaperColor = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }
  const color = value.trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null
}

export const toPublicUser = (user: UserRow): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: publicAssetPath(user.avatar_url),
  avatarThumbUrl: avatarThumbPublicPath(publicAssetPath(user.avatar_url)),
  theme: parseAppearanceTheme(user.theme),
  wallpaperUrl: publicAssetPath(user.wallpaper_url),
  wallpaperX: clampWallpaperValue(user.wallpaper_x, 50, 0, 100),
  wallpaperY: clampWallpaperValue(user.wallpaper_y, 50, 0, 100),
  wallpaperZoom: clampWallpaperValue(user.wallpaper_zoom, 1, 1, 2.4),
  wallpaperColor: parseWallpaperColor(user.wallpaper_color),
})

export const USER_COLUMNS =
  "id, email, password_hash, name, avatar_url, theme, wallpaper_url, wallpaper_x, wallpaper_y, wallpaper_zoom, wallpaper_color"

export const ensureUsersSchema = async () => {
  const [avatarCols] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'`,
    { schemaName: config.db.database },
  )
  if (avatarCols.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL")
  }

  const [themeCols] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'users' AND COLUMN_NAME = 'theme'`,
    { schemaName: config.db.database },
  )
  if (themeCols.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN theme VARCHAR(20) NOT NULL DEFAULT 'dark'")
  } else {
    await pool.query("ALTER TABLE users MODIFY COLUMN theme VARCHAR(20) NOT NULL DEFAULT 'dark'")
  }

  const [wallpaperCols] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'users' AND COLUMN_NAME = 'wallpaper_url'`,
    { schemaName: config.db.database },
  )
  if (wallpaperCols.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN wallpaper_url VARCHAR(512) NULL")
  }

  const [posXCols] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'users' AND COLUMN_NAME = 'wallpaper_x'`,
    { schemaName: config.db.database },
  )
  if (posXCols.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN wallpaper_x FLOAT NOT NULL DEFAULT 50")
  }

  const [posYCols] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'users' AND COLUMN_NAME = 'wallpaper_y'`,
    { schemaName: config.db.database },
  )
  if (posYCols.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN wallpaper_y FLOAT NOT NULL DEFAULT 50")
  }

  const [zoomCols] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'users' AND COLUMN_NAME = 'wallpaper_zoom'`,
    { schemaName: config.db.database },
  )
  if (zoomCols.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN wallpaper_zoom FLOAT NOT NULL DEFAULT 1")
  }

  const [colorCols] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'users' AND COLUMN_NAME = 'wallpaper_color'`,
    { schemaName: config.db.database },
  )
  if (colorCols.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN wallpaper_color CHAR(7) NULL")
  }
}

export const TASK_STATUSES = ["pending", "completed", "cancelled", "archived"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export type TaskRow = RowDataPacket & {
  id: number
  user_id: number
  title: string
  description: string
  due_at: string | null
  status: TaskStatus
  created_at: Date
}

export type AttachmentRow = RowDataPacket & {
  id: number
  task_id: number
  user_id: number
  filename: string
  thumb_filename: string | null
  original_name: string
  mime_type: string
  size: number
  created_at: Date
}

export type PublicAttachment = {
  id: number
  taskId: number
  name: string
  url: string
  thumbUrl: string | null
  mimeType: string
  size: number
}

export type PublicTask = {
  id: number
  title: string
  description: string
  dueAt: string | null
  status: TaskStatus
  attachments: PublicAttachment[]
}

const STATUS_ALIASES: Record<string, TaskStatus> = {
  pending: "pending",
  pendiente: "pending",
  completed: "completed",
  completado: "completed",
  completada: "completed",
  done: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  cancelado: "cancelled",
  cancelada: "cancelled",
  archived: "archived",
  archivado: "archived",
  archivada: "archived",
}

export const parseTaskStatus = (value: unknown): TaskStatus | null => {
  if (typeof value !== "string") {
    return null
  }
  return STATUS_ALIASES[value.trim().toLowerCase()] ?? null
}

export const toPublicTask = (
  task: TaskRow,
  attachments: PublicAttachment[] = [],
): PublicTask => ({
  id: task.id,
  title: task.title,
  description: task.description,
  dueAt: task.due_at,
  status: parseTaskStatus(task.status) ?? "pending",
  attachments,
})

export const toPublicAttachment = (row: AttachmentRow): PublicAttachment => ({
  id: row.id,
  taskId: row.task_id,
  name: row.original_name,
  url: `/uploads/attachments/${row.filename}`,
  thumbUrl: row.thumb_filename ? `/uploads/attachments/${row.thumb_filename}` : null,
  mimeType: row.mime_type,
  size: row.size,
})

export const ensureTasksTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      due_at VARCHAR(22) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tasks_user (user_id),
      INDEX idx_tasks_due (due_at),
      INDEX idx_tasks_status (status),
      CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  const [columns] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'due_at'`,
    { schemaName: config.db.database },
  )
  const dueColumn = columns[0] as { COLUMN_NAME?: string; DATA_TYPE?: string } | undefined
  if (!dueColumn) {
    await pool.query("ALTER TABLE tasks ADD COLUMN due_at VARCHAR(22) NULL")
    await pool.query("ALTER TABLE tasks ADD INDEX idx_tasks_due (due_at)")
    return
  }
  await pool.query("ALTER TABLE tasks MODIFY due_at VARCHAR(22) NULL")

  const [statusColumns] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'status'`,
    { schemaName: config.db.database },
  )
  if (statusColumns.length === 0) {
    await pool.query(
      "ALTER TABLE tasks ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'",
    )
    await pool.query("ALTER TABLE tasks ADD INDEX idx_tasks_status (status)")
  }
}

export const ensureAttachmentsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      filename VARCHAR(512) NOT NULL,
      thumb_filename VARCHAR(512) NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size INT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_attachments_task (task_id),
      INDEX idx_attachments_user (user_id),
      CONSTRAINT fk_attachments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      CONSTRAINT fk_attachments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  const [filenameCols] = await pool.query<RowDataPacket[]>(
    `SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'task_attachments' AND COLUMN_NAME = 'filename'`,
    { schemaName: config.db.database },
  )
  const maxLength = Number(filenameCols[0]?.CHARACTER_MAXIMUM_LENGTH ?? 0)
  if (maxLength > 0 && maxLength < 512) {
    await pool.query("ALTER TABLE task_attachments MODIFY filename VARCHAR(512) NOT NULL")
  }

  const [thumbCols] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = 'task_attachments' AND COLUMN_NAME = 'thumb_filename'`,
    { schemaName: config.db.database },
  )
  if (thumbCols.length === 0) {
    await pool.query("ALTER TABLE task_attachments ADD COLUMN thumb_filename VARCHAR(512) NULL")
  }
}
