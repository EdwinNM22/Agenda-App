import "dotenv/config"
import { config } from "./config.js"
import { buildApp } from "./app.js"
import { ensureAttachmentsTable, ensureTasksTable, ensureUsersSchema } from "./db.js"

const app = await buildApp()

try {
  await ensureUsersSchema()
  await ensureTasksTable()
  await ensureAttachmentsTable()
  await app.listen({ port: config.port, host: config.host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
