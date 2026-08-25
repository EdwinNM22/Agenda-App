import {
  currentPushStatus,
  describePushStatus,
  enablePush,
  type PushStatus,
} from "@/lib/push"

export type PermissionState = "granted" | "denied" | "prompt" | "unsupported" | "standalone" | "insecure"

export type AppPermissionId = "notifications"

export type AppPermission = {
  id: AppPermissionId
  title: string
  granted: boolean
  state: PermissionState
  hint: string
}

const notificationState = (status: PushStatus): PermissionState => {
  if (status === "on") {
    return "granted"
  }
  if (status === "off") {
    return "prompt"
  }
  return status
}

export const listAppPermissions = async (): Promise<AppPermission[]> => {
  const notifications = await currentPushStatus()
  return [
    {
      id: "notifications",
      title: "Avisos",
      granted: notifications === "on",
      state: notificationState(notifications),
      hint: describePushStatus(notifications),
    },
  ]
}

export const requestAppPermission = async (id: AppPermissionId) => {
  if (id === "notifications") {
    await enablePush()
  }
}
