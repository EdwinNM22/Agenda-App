import { hash } from "bcryptjs"
import mysql from "mysql2/promise"
import { config } from "../config.js"

const seedEmail = "admin@agenda.local"
const seedPassword = "agenda123"
const seedName = "Alex"

const admin = await mysql.createConnection({
  host: config.db.socketPath ? undefined : config.db.host,
  port: config.db.socketPath ? undefined : config.db.port,
  user: config.db.user,
  password: config.db.password,
  socketPath: config.db.socketPath,
  multipleStatements: true,
})

try {
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await admin.query(`USE \`${config.db.database}\``)
  await admin.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(120) NOT NULL,
      avatar_url VARCHAR(512) NULL,
      theme VARCHAR(20) NOT NULL DEFAULT 'dark',
      wallpaper_url VARCHAR(512) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await admin.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      due_at VARCHAR(22) NULL,
      notify_at VARCHAR(22) NULL,
      notified_at DATETIME NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tasks_user (user_id),
      INDEX idx_tasks_due (due_at),
      CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  await admin.query(`
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

  const passwordHash = await hash(seedPassword, 10)
  await admin.query(
    `
    INSERT INTO users (email, password_hash, name)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      password_hash = VALUES(password_hash),
      name = VALUES(name)
    `,
    [seedEmail, passwordHash, seedName],
  )

  console.log("Base de datos y usuario listos.")
  console.log(`  email: ${seedEmail}`)
  console.log(`  password: ${seedPassword}`)
} finally {
  await admin.end()
}
