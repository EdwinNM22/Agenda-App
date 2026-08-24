import { useRef, useState } from "react"
import { Check, ImagePlus, Moon, Sun } from "lucide-react"
import { WallpaperAdjuster, type WallpaperFrame } from "@/components/WallpaperAdjuster"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

const THEME_OPTIONS = [
  {
    value: "light" as const,
    label: "Claro",
    hint: "Luminoso y limpio",
    icon: Sun,
  },
  {
    value: "dark" as const,
    label: "Oscuro",
    hint: "Suave para la noche",
    icon: Moon,
  },
]

type Draft = {
  src: string
  file?: File
}

export const ThemePicker = () => {
  const { theme, wallpaper, frame, setTheme, setWallpaper, setWallpaperFrame } = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const onPickFile = () => fileRef.current?.click()

  const onCustomClick = () => {
    if (wallpaper) {
      setTheme("wallpaper")
      return
    }
    onPickFile()
  }

  const onFile = (file: File | undefined) => {
    if (!file) {
      return
    }
    setError(null)
    setDraft({ src: URL.createObjectURL(file), file })
  }

  const onConfirm = async (nextFrame: WallpaperFrame) => {
    if (!draft) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (draft.file) {
        await setWallpaper(draft.file, nextFrame)
      } else {
        await setWallpaperFrame(nextFrame)
      }
      if (draft.src.startsWith("blob:")) {
        URL.revokeObjectURL(draft.src)
      }
      setDraft(null)
    } catch {
      setError("No se pudo guardar el fondo")
    } finally {
      setBusy(false)
    }
  }

  const selectedCustom = theme === "wallpaper"

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        {THEME_OPTIONS.map((option) => {
          const selected = theme === option.value
          const Icon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex flex-col items-start gap-3 rounded-3xl border px-4 py-4 text-left transition-all",
                selected
                  ? "border-primary bg-primary/8 shadow-sm"
                  : "border-border/80 bg-card/80 hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-2xl",
                  selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  {option.label}
                  {selected ? <Check className="size-3.5 text-primary" /> : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onCustomClick}
        className={cn(
          "relative overflow-hidden rounded-3xl border px-4 py-4 text-left transition-all",
          selectedCustom
            ? "border-primary shadow-sm"
            : "border-border/80 bg-card/80 hover:bg-muted/60",
        )}
      >
        {wallpaper ? (
          <span
            className="absolute inset-0 bg-cover"
            style={{
              backgroundImage: `url(${wallpaper})`,
              backgroundPosition: `${frame.x}% ${frame.y}%`,
              transform: `scale(${frame.zoom})`,
            }}
          />
        ) : null}
        {wallpaper ? <span className="absolute inset-0 bg-black/30" /> : null}
        <span className="relative flex items-center gap-3">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-2xl",
              selectedCustom ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <ImagePlus className="size-5" />
          </span>
          <span className={cn("min-w-0 flex-1", wallpaper && "text-white")}>
            <span className="flex items-center gap-1.5 font-medium">
              Fondo personalizado
              {selectedCustom ? <Check className="size-3.5" /> : null}
            </span>
            <span className={cn("mt-0.5 block text-xs", wallpaper ? "text-white/75" : "text-muted-foreground")}>
              Elige una foto y encuádrala arrastrando
            </span>
          </span>
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0])
          event.target.value = ""
        }}
      />

      {wallpaper ? (
        <div className="flex gap-4">
          <button type="button" className="text-sm font-medium text-primary" onClick={onPickFile}>
            Cambiar imagen
          </button>
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => setDraft({ src: wallpaper })}
          >
            Ajustar recorte
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {draft ? (
        <WallpaperAdjuster
          src={draft.src}
          initial={draft.file ? undefined : frame}
          busy={busy}
          onCancel={() => {
            if (draft.src.startsWith("blob:")) {
              URL.revokeObjectURL(draft.src)
            }
            setDraft(null)
          }}
          onConfirm={(nextFrame) => void onConfirm(nextFrame)}
        />
      ) : null}
    </div>
  )
}
