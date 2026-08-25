import type { FastifyBaseLogger } from "fastify"
import { pool, type PushSubscriptionRow, type TaskRow } from "./db.js"
import { naiveToDate } from "./naiveDateTime.js"
import { configurePush, isGoneSubscription, pushEnabled, sendPush } from "./push.js"

const TICK_MS = 20_000
const MAX_LATENESS_MS = 24 * 60 * 60 * 1000

let running = false

const pendingWithNotify = async () => {
  const [rows] = await pool.query<TaskRow[]>(
    `SELECT id, user_id, title, description, due_at, notify_at, status
     FROM tasks
     WHERE notify_at IS NOT NULL
       AND notified_at IS NULL
       AND status = 'pending'`,
  )
  return rows
}

const markNotified = async (taskId: number) => {
  await pool.query("UPDATE tasks SET notified_at = NOW() WHERE id = :id", { id: taskId })
}

const subscriptionsFor = async (userId: number) => {
  const [rows] = await pool.query<PushSubscriptionRow[]>(
    `SELECT id, user_id, endpoint, p256dh, auth, created_at
     FROM push_subscriptions
     WHERE user_id = :userId`,
    { userId },
  )
  return rows
}

const removeSubscription = async (id: number) => {
  await pool.query("DELETE FROM push_subscriptions WHERE id = :id", { id })
}

const notifyTask = async (task: TaskRow, log: FastifyBaseLogger) => {
  const subscriptions = await subscriptionsFor(task.user_id)
  if (subscriptions.length === 0) {
    return
  }

  const payload = {
    title: task.title,
    body: task.description.trim() || task.due_at || "Tienes un recordatorio",
    url: "/tareas",
    taskId: task.id,
  }

  let sent = 0
  for (const row of subscriptions) {
    try {
      await sendPush(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      )
      sent += 1
    } catch (error) {
      if (isGoneSubscription(error)) {
        await removeSubscription(row.id)
        continue
      }
      log.warn({ err: error, taskId: task.id }, "No se pudo enviar el aviso")
    }
  }

  if (sent > 0) {
    await markNotified(task.id)
  }
}

const tick = async (log: FastifyBaseLogger) => {
  if (!pushEnabled() || running) {
    return
  }
  running = true
  try {
    const now = Date.now()
    const pending = await pendingWithNotify()
    for (const task of pending) {
      const due = naiveToDate(task.notify_at)
      if (!due) {
        await markNotified(task.id)
        continue
      }
      const age = now - due.getTime()
      if (age < 0) {
        continue
      }
      if (age > MAX_LATENESS_MS) {
        await markNotified(task.id)
        continue
      }
      await notifyTask(task, log)
    }
  } catch (error) {
    log.error({ err: error }, "Fallo al revisar avisos de tareas")
  } finally {
    running = false
  }
}

export const startNotifyWorker = (log: FastifyBaseLogger) => {
  if (!pushEnabled()) {
    log.warn("Avisos push desactivados: faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY")
    return
  }
  configurePush()
  log.info("Avisos push activos")
  void tick(log)
  setInterval(() => {
    void tick(log)
  }, TICK_MS)
}
