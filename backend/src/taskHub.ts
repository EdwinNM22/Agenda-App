import type { WebSocket } from "ws"
import type { PublicTask } from "./db.js"

export type TaskSocketEvent =
  | { type: "task.created"; task: PublicTask }
  | { type: "task.updated"; task: PublicTask }
  | { type: "task.deleted"; id: number }
  | { type: "pong" }

const rooms = new Map<number, Set<WebSocket>>()

export const subscribeTaskSocket = (userId: number, socket: WebSocket) => {
  const sockets = rooms.get(userId) ?? new Set<WebSocket>()
  sockets.add(socket)
  rooms.set(userId, sockets)
}

export const unsubscribeTaskSocket = (userId: number, socket: WebSocket) => {
  const sockets = rooms.get(userId)
  if (!sockets) {
    return
  }
  sockets.delete(socket)
  if (sockets.size === 0) {
    rooms.delete(userId)
  }
}

export const publishTaskEvent = (userId: number, event: TaskSocketEvent) => {
  const sockets = rooms.get(userId)
  if (!sockets) {
    return
  }
  const payload = JSON.stringify(event)
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(payload)
    }
  }
}
