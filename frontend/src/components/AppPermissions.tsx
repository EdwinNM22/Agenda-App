import { useEffect, useState } from "react"
import { Bell, Check, ChevronRight, Mic, ShieldCheck } from "lucide-react"
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
  promptAppPermissions,
  requestAppPermission,
  type AppPermission,
  type AppPermissionId,
} from "@/lib/permissions"
import { cn } from "@/lib/utils"

export const PermissionsPrompt = () => {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) {
      return
    }
    const timer = window.setTimeout(() => {
      void promptAppPermissions(false)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [user?.id])

  return null
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
      ? "Micrófono y avisos"
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
              Lo que la app puede usar. Si cancelaste alguno, actívalo aquí.
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
  const Icon = item.id === "notifications" ? Bell : Mic
  const canAsk = !item.granted && item.state !== "unsupported" && item.state !== "standalone"

  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left disabled:opacity-70"
      onClick={onAsk}
      disabled={busy || !canAsk}
    >
      <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground">
        <Icon className="size-4" />
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
