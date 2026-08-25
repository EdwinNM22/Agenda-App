import { config } from "./config.js"
import { buildApp } from "./app.js"
import { ensureAttachmentsTable, ensurePushSubscriptionsTable, ensureTasksTable, ensureUsersSchema } from "./db.js"
import { startNotifyWorker } from "./notifyWorker.js"

const app = await buildApp()

try {
  await ensureUsersSchema()
  await ensureTasksTable()
  await ensureAttachmentsTable()
  await ensurePushSubscriptionsTable()
  await app.listen({ port: config.port, host: config.host })
  startNotifyWorker(app.log)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
