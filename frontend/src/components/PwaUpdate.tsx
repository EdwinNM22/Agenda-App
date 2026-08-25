import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  applyPwaUpdate,
  checkPwaUpdate,
  pwaHasUpdate,
  subscribePwaUpdate,
} from "@/lib/pwa"

export const PwaUpdateBanner = () => {
  const [available, setAvailable] = useState(pwaHasUpdate)
  const [applying, setApplying] = useState(false)

  useEffect(() => subscribePwaUpdate(() => setAvailable(pwaHasUpdate())), [])

  if (!available) {
    return null
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[200] flex justify-center px-4 pt-[calc(var(--k-safe-area-top)+0.75rem)]">
      <div className="flex w-full max-w-lg items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-lg">
        <p className="min-w-0 flex-1 text-sm font-medium">Hay una versión nueva</p>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          disabled={applying}
          onClick={() => {
            setApplying(true)
            void applyPwaUpdate()
          }}
        >
          Actualizar
        </Button>
      </div>
    </div>
  )
}

export const PwaUpdateRow = () => {
  const [available, setAvailable] = useState(pwaHasUpdate)
  const [checking, setChecking] = useState(false)
  const [hint, setHint] = useState("Busca e instala la última versión")

  useEffect(() => subscribePwaUpdate(() => setAvailable(pwaHasUpdate())), [])

  const onClick = async () => {
    if (available) {
      await applyPwaUpdate()
      return
    }
    setChecking(true)
    setHint("Buscando…")
    await checkPwaUpdate()
    window.setTimeout(() => {
      if (pwaHasUpdate()) {
        setAvailable(true)
        setHint("Toca para instalar la nueva versión")
      } else {
        setHint("Ya tienes la última versión")
      }
      setChecking(false)
    }, 1200)
  }

  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-3xl border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-muted/40"
      onClick={() => void onClick()}
      disabled={checking}
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground">
        <RefreshCw className={`size-5 ${checking ? "animate-spin" : ""}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Actualizar app</span>
        <span className="text-sm text-muted-foreground">
          {available ? "Nueva versión lista" : hint}
        </span>
      </span>
    </button>
  )
}
