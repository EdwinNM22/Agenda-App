import webpush from "web-push"
import { config } from "./config.js"

export const pushEnabled = (): boolean =>
  Boolean(config.vapidPublicKey && config.vapidPrivateKey)

let configured = false

export const configurePush = () => {
  if (configured || !pushEnabled()) {
    return
  }
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey)
  configured = true
}

export const sendPush = async (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: unknown,
) => {
  configurePush()
  await webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 60 * 60,
    urgency: "high",
  })
}

export const isGoneSubscription = (error: unknown): boolean => {
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : null
  return status === 404 || status === 410
}
