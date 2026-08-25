import { useEffect, useState } from "react"
import { Bell, Check, ChevronRight, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth"
import {
  listAppPermissions,
  requestAppPermission,
  type AppPermission,
  type AppPermissionId,
} from "@/lib/permissions"
import { currentPushStatus, describePushStatus, enablePush, syncPushSubscription, type PushStatus } from "@/lib/push"
import { cn } from "@/lib/utils"

export const PermissionsPrompt = () => {
  const { user } = useAuth()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  const refresh = async () => {
    const next = await currentPushStatus()
    setStatus(next)
    if (next === "on") {
      await syncPushSubscription().catch(() => undefined)
    }
  }

  useEffect(() => {
    if (!user) {
      return
    }
    const timer = window.setTimeout(() => {
      void refresh()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [user?.id])

  if (!user || hidden || !status || status === "on") {
    return null
  }

  const canAsk = status === "off"

  const onAllow = async () => {
    if (!canAsk) {
      setHidden(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await enablePush()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo activar el aviso")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-x-4 bottom-[calc(var(--k-safe-area-bottom)+5.75rem)] z-40 mx-auto max-w-lg">
      <div className="rounded-3xl border bg-card px-4 py-3.5 shadow-lg">
        <p className="font-medium">Avisos de tareas</p>
        <p className="mt-1 text-sm text-muted-foreground">{error ?? describePushStatus(status)}</p>
        <div className="mt-3 flex gap-2">
          <Button type="button" className="h-10 flex-1" onClick={() => void onAllow()} disabled={busy}>
            {busy ? "Activando…" : canAsk ? "Permitir" : "Entendido"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export const PermissionsRow = () => {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppPermission[]>([])
  const [busyId, setBusyId] = useState<AppPermissionId | null>(null)

  const refresh = async () => {
    setItems(await listAppPermissions())
  }

  useEffect(() => {
    void refresh()
  }, [open])

  const grantedCount = items.filter((item) => item.granted).length
  const hint =
    items.length === 0
      ? "Avisos de tareas"
      : grantedCount === items.length
        ? "Todo autorizado"
        : `${grantedCount} de ${items.length} autorizados`

  const onAsk = async (id: AppPermissionId) => {
    const item = items.find((entry) => itemMatches(entry, id))
    if (!item || item.granted || item.state === "unsupported" || item.state === "standalone") {
      return
    }
    setBusyId(id)
    try {
      await requestAppPermission(id)
    } catch {
      // El listado muestra el estado real, concedido o bloqueado.
    } finally {
      await refresh()
      setBusyId(null)
    }
  }

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-3 rounded-3xl border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-muted/40"
        onClick={() => setOpen(true)}
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Permisos</span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="z-80 gap-0 rounded-t-[1.75rem] pb-[calc(var(--k-safe-area-bottom)+1.25rem)]"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              Permisos
            </SheetTitle>
            <SheetDescription>
              Avisos de las tareas. Si cancelaste el permiso, actívalo aquí.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 px-4 pb-2">
            {items.map((item) => (
              <PermissionItem
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onAsk={() => void onAsk(item.id)}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

const itemMatches = (item: AppPermission, id: AppPermissionId) => item.id === id

const PermissionItem = ({
  item,
  busy,
  onAsk,
}: {
  item: AppPermission
  busy: boolean
  onAsk: () => void
}) => {
  const canAsk = !item.granted && item.state !== "unsupported" && item.state !== "standalone"

  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left disabled:opacity-70"
      onClick={onAsk}
      disabled={busy || !canAsk}
    >
      <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground">
        <Bell className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{item.title}</span>
        <span className="text-sm text-muted-foreground">{busy ? "Pidiendo permiso…" : item.hint}</span>
      </span>
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full border",
          item.granted
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/35 text-transparent",
        )}
        aria-label={item.granted ? "Autorizado" : "Sin autorizar"}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
    </button>
  )
}
