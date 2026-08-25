import { useEffect, useRef, useState } from "react"
import { Download, Share } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { isIos, isStandalone } from "@/lib/pwa"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export const PwaInstall = () => {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [canPrompt, setCanPrompt] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true)
      return
    }
    const onPrompt = (event: Event) => {
      event.preventDefault()
      promptRef.current = event as BeforeInstallPromptEvent
      setCanPrompt(true)
    }
    const onInstalled = () => {
      setInstalled(true)
      promptRef.current = null
      setCanPrompt(false)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (installed) {
    return null
  }

  const install = async () => {
    const pending = promptRef.current
    if (pending) {
      await pending.prompt()
      const choice = await pending.userChoice
      if (choice.outcome === "accepted") {
        setInstalled(true)
      }
      promptRef.current = null
      setCanPrompt(false)
      return
    }
    if (isIos()) {
      setIosHelp(true)
    }
  }

  const hint = isIos()
    ? "Compartir → Añadir a pantalla de inicio"
    : canPrompt
      ? "Instalar como aplicación"
      : "Menú del navegador → Instalar aplicación"

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-3 rounded-3xl border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-muted/40"
        onClick={() => void install()}
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground">
          <Download className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Instalar app</span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </span>
      </button>

      <Sheet open={iosHelp} onOpenChange={setIosHelp}>
        <SheetContent
          side="bottom"
          className="z-80 gap-0 rounded-t-[1.75rem] pb-[calc(var(--k-safe-area-bottom)+1.25rem)]"
        >
          <SheetHeader>
            <SheetTitle>Añadir a iPhone o iPad</SheetTitle>
            <SheetDescription>
              Safari no muestra un botón de instalar. Hay que hacerlo desde Compartir.
            </SheetDescription>
          </SheetHeader>
          <ol className="grid gap-3 px-4 pb-4 text-sm text-muted-foreground">
            <li>1. Toca el botón Compartir {isIos() ? <Share className="inline size-4" /> : null}.</li>
            <li>2. Elige «Añadir a pantalla de inicio».</li>
            <li>3. Confirma. Agenda se abre a pantalla completa, sin la barra de Safari.</li>
          </ol>
          <div className="px-4 pb-2">
            <Button type="button" className="h-11 w-full" onClick={() => setIosHelp(false)}>
              Entendido
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
