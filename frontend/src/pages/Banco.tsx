import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  Minus,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { BancoDestino, BancoMovimiento, BancoResumen, BancoTipo } from "@/lib/banco"
import {
  BANCO_DESTINOS,
  BANCO_DESTINO_LABELS,
  createBancoEgreso,
  createBancoIngreso,
  deleteBancoMovimiento,
  fetchBancoMovimientos,
  fetchBancoResumen,
  formatBancoDate,
  formatCurrency,
  todayIsoDate,
  updateBancoMovimiento,
} from "@/lib/banco"
import { cn } from "@/lib/utils"

type FormMode = "ingreso" | "egreso" | null

const FILTERS = [
  { id: "all" as const, label: "Todos" },
  { id: "ingreso" as const, label: "Ingresos" },
  { id: "egreso" as const, label: "Egresos" },
]

const emptyForm = () => ({
  monto: "",
  motivo: "",
  destino: "" as BancoDestino | "",
  fecha: todayIsoDate(),
})

const isEgresoForm = (mode: FormMode, editing: BancoMovimiento | null) =>
  mode === "egreso" || editing?.tipo === "egreso"

export const BancoPage = () => {
  const [resumen, setResumen] = useState<BancoResumen | null>(null)
  const [movimientos, setMovimientos] = useState<BancoMovimiento[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editing, setEditing] = useState<BancoMovimiento | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [resumenData, movimientosData] = await Promise.all([
        fetchBancoResumen(),
        fetchBancoMovimientos(),
      ])
      setResumen(resumenData)
      setMovimientos(movimientosData.movimientos)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar Banco")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const visibleMovimientos = useMemo(() => {
    if (filter === "all") {
      return movimientos
    }
    return movimientos.filter((item) => item.tipo === filter)
  }, [filter, movimientos])

  const openCreate = (mode: BancoTipo) => {
    setEditing(null)
    setForm(emptyForm())
    setFormMode(mode)
  }

  const openEdit = (movimiento: BancoMovimiento) => {
    setEditing(movimiento)
    setFormMode(movimiento.tipo)
    setForm({
      monto: String(movimiento.monto),
      motivo: movimiento.motivo,
      destino: movimiento.destino ?? "",
      fecha: movimiento.fecha,
    })
  }

  const closeForm = () => {
    if (saving) {
      return
    }
    setFormMode(null)
    setEditing(null)
    setForm(emptyForm())
  }

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const monto = Number(form.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("El monto debe ser mayor a cero.")
      return
    }
    if (!form.motivo.trim()) {
      setError("El motivo es obligatorio.")
      return
    }
    const needsDestino = isEgresoForm(formMode, editing)
    if (needsDestino && !form.destino) {
      setError("Selecciona el destino del egreso.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body = {
        monto,
        motivo: form.motivo.trim(),
        fecha: form.fecha,
        ...(needsDestino ? { destino: form.destino as BancoDestino } : {}),
      }
      if (editing) {
        await updateBancoMovimiento(editing.id, body)
      } else if (formMode === "ingreso") {
        await createBancoIngreso(body)
      } else if (formMode === "egreso") {
        await createBancoEgreso(body as { monto: number; motivo: string; destino: BancoDestino; fecha: string })
      }
      closeForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (movimiento: BancoMovimiento) => {
    if (!window.confirm(`¿Eliminar ${movimiento.tipo} de ${formatCurrency(movimiento.monto)}?`)) {
      return
    }
    setError(null)
    try {
      await deleteBancoMovimiento(movimiento.id)
      if (editing?.id === movimiento.id) {
        closeForm()
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-5 pt-[calc(var(--k-safe-area-top)+2rem)] pb-8">
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
        <Wallet className="size-7" />
        Banco
      </h1>

      {error ? (
        <div className="glass-surface rounded-2xl border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card className="glass-surface border-none ring-1 ring-foreground/10">
        <CardHeader>
          <CardDescription>Caja chica</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">
            {loading || resumen?.cajaChica === undefined ? "—" : formatCurrency(resumen.cajaChica)}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-500/10 px-3 py-3">
            <p className="text-xs text-muted-foreground">Ingresos (mes)</p>
            <p className="mt-1 font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
              {loading || !resumen?.periodo ? "—" : formatCurrency(resumen.periodo.ingresos)}
            </p>
          </div>
          <div className="rounded-2xl bg-rose-500/10 px-3 py-3">
            <p className="text-xs text-muted-foreground">Egresos (mes)</p>
            <p className="mt-1 font-medium text-rose-600 tabular-nums dark:text-rose-400">
              {loading || !resumen?.periodo ? "—" : formatCurrency(resumen.periodo.egresos)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          className="h-12 rounded-2xl"
          onClick={() => openCreate("ingreso")}
        >
          <Plus className="size-4" />
          Ingreso
        </Button>
        <Button
          type="button"
          variant="outline"
          className="glass-surface h-12 rounded-2xl"
          onClick={() => openCreate("egreso")}
        >
          <Minus className="size-4" />
          Egreso
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={filter === item.id ? "default" : "outline"}
            className={cn("rounded-full", filter !== item.id && "glass-surface")}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : visibleMovimientos.length === 0 ? (
          <div className="glass-surface rounded-2xl px-4 py-10 text-center text-sm text-muted-foreground">
            Sin movimientos todavía.
          </div>
        ) : (
          visibleMovimientos.map((movimiento) => {
            const isIngreso = movimiento.tipo === "ingreso"
            return (
              <button
                key={movimiento.id}
                type="button"
                className="glass-surface flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition hover:ring-1 hover:ring-foreground/10"
                onClick={() => openEdit(movimiento)}
              >
                <div
                  className={cn(
                    "mt-0.5 rounded-full p-2",
                    isIngreso ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600",
                  )}
                >
                  {isIngreso ? (
                    <ArrowUpCircle className="size-4" />
                  ) : (
                    <ArrowDownCircle className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate font-medium">{movimiento.motivo}</p>
                    <p
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        isIngreso ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {isIngreso ? "+" : "-"}
                      {formatCurrency(movimiento.monto)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatBancoDate(movimiento.fecha)}
                    {movimiento.destinoLabel ? ` · ${movimiento.destinoLabel}` : ""}
                    {movimiento.registradoPor ? ` · ${movimiento.registradoPor}` : ""}
                  </p>
                </div>
              </button>
            )
          })
        )}
      </section>

      <Sheet open={formMode !== null} onOpenChange={(open) => !open && closeForm()}>
        <SheetContent
          side="bottom"
          className="z-60 gap-0 overflow-y-auto rounded-t-3xl pb-[calc(var(--k-safe-area-bottom)+1rem)]"
        >
          <form onSubmit={(event) => void handleSubmit(event)}>
            <SheetHeader className="border-b">
              <SheetTitle>
                {editing
                  ? `Editar ${editing.tipo}`
                  : formMode === "ingreso"
                    ? "Nuevo ingreso"
                    : "Nuevo egreso"}
              </SheetTitle>
              <SheetDescription>Registra un movimiento en la caja chica.</SheetDescription>
            </SheetHeader>

            <div className="grid gap-4 px-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="banco-monto">Monto</Label>
                <Input
                  id="banco-monto"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.monto}
                  onChange={(event) => setForm((prev) => ({ ...prev, monto: event.target.value }))}
                  placeholder="0.00"
                  className="h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="banco-fecha">Fecha</Label>
                <Input
                  id="banco-fecha"
                  type="date"
                  value={form.fecha}
                  onChange={(event) => setForm((prev) => ({ ...prev, fecha: event.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="banco-motivo">Motivo</Label>
                <Textarea
                  id="banco-motivo"
                  value={form.motivo}
                  onChange={(event) => setForm((prev) => ({ ...prev, motivo: event.target.value }))}
                  placeholder="Describe el movimiento"
                  rows={3}
                />
              </div>
              {isEgresoForm(formMode, editing) ? (
                <div className="grid gap-2">
                  <Label htmlFor="banco-destino">Destino</Label>
                  <Select
                    value={form.destino || undefined}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, destino: value as BancoDestino }))
                    }
                  >
                    <SelectTrigger id="banco-destino" className="h-11 w-full">
                      <SelectValue placeholder="Selecciona destino" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[100]">
                      {BANCO_DESTINOS.map((destino) => (
                        <SelectItem key={destino} value={destino}>
                          {BANCO_DESTINO_LABELS[destino]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <SheetFooter className="flex-row justify-between gap-2 border-t">
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleDelete(editing)}
                  disabled={saving}
                >
                  <Trash2 className="size-4" />
                  Eliminar
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Guardar"}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </main>
  )
}
