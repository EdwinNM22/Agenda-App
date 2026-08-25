import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { useAuth } from "@/lib/auth"
import {
  currentPushStatus,
  describePushStatus,
  enablePush,
  syncPushSubscription,
  type PushStatus,
} from "@/lib/push"

export const PushSync = () => {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) {
      return
    }
    void syncPushSubscription().catch(() => undefined)
  }, [user?.id])

  return null
}

export const PushNotificationsRow = () => {
  const [status, setStatus] = useState<PushStatus>("off")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void currentPushStatus().then(setStatus)
  }, [])

  const onClick = async () => {
    if (status === "on" || status === "denied" || status === "unsupported" || status === "standalone") {
      return
    }
    setBusy(true)
    try {
      await enablePush()
      setStatus(await currentPushStatus())
    } catch {
      setStatus(await currentPushStatus())
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-3xl border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-muted/40 disabled:opacity-70"
      onClick={() => void onClick()}
      disabled={busy || status === "denied" || status === "unsupported" || status === "standalone"}
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground">
        <Bell className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Avisos</span>
        <span className="text-sm text-muted-foreground">
          {busy ? "Activando…" : describePushStatus(status)}
        </span>
      </span>
    </button>
  )
}
