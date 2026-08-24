import { useEffect, useRef, useState } from "react"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export type WallpaperFrame = {
  x: number
  y: number
  zoom: number
}

type WallpaperAdjusterProps = {
  src: string
  initial?: WallpaperFrame
  onCancel: () => void
  onConfirm: (frame: WallpaperFrame) => void
  busy?: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const WallpaperAdjuster = ({
  src,
  initial,
  onCancel,
  onConfirm,
  busy = false,
}: WallpaperAdjusterProps) => {
  const [frame, setFrame] = useState<WallpaperFrame>({
    x: initial?.x ?? 50,
    y: initial?.y ?? 50,
    zoom: initial?.zoom ?? 1,
  })
  const dragRef = useRef<{ x: number; y: number; start: WallpaperFrame } | null>(null)
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, start: frame }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    const width = event.currentTarget.clientWidth || 1
    const height = event.currentTarget.clientHeight || 1
    setFrame({
      x: clamp(drag.start.x - (dx / width) * 90, 0, 100),
      y: clamp(drag.start.y - (dy / height) * 90, 0, 100),
      zoom: drag.start.zoom,
    })
  }

  const onPointerUp = () => {
    dragRef.current = null
    pinchRef.current = null
  }

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const [first, second] = [event.touches[0], event.touches[1]]
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
      pinchRef.current = { distance, zoom: frame.zoom }
      dragRef.current = null
    }
  }

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchRef.current) {
      const [first, second] = [event.touches[0], event.touches[1]]
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
      const nextZoom = clamp((distance / pinchRef.current.distance) * pinchRef.current.zoom, 1, 2.4)
      setFrame((current) => ({ ...current, zoom: nextZoom }))
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-zinc-950">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-4">
        <p className="text-sm text-white/70">Así se verá en el teléfono</p>
        <div
          className="relative h-[min(calc(100dvh-13rem),calc(90vw*19.5/9))] w-[min(90vw,calc((100dvh-13rem)*9/19.5))] touch-none overflow-hidden rounded-[2.5rem] border-[3px] border-white/25 bg-black shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onPointerUp}
        >
          <span className="absolute top-2 left-1/2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/25" />
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full select-none object-cover"
            style={{
              objectPosition: `${frame.x}% ${frame.y}%`,
              transform: `scale(${frame.zoom})`,
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-black/30" />
        </div>
        <p className="text-xs text-white/55">Arrastra para mover · pellizca o usa el zoom</p>
      </div>
      <div className="grid gap-3 bg-zinc-950 px-4 pt-3 pb-[calc(var(--k-safe-area-bottom)+1rem)]">
        <label className="grid gap-1.5 text-xs text-white/70">
          Zoom
          <input
            type="range"
            min={1}
            max={2.4}
            step={0.01}
            value={frame.zoom}
            onChange={(event) =>
              setFrame((current) => ({ ...current, zoom: Number(event.target.value) }))
            }
          />
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel} disabled={busy}>
            <X data-icon="inline-start" />
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 flex-1"
            onClick={() => onConfirm(frame)}
            disabled={busy}
          >
            <Check data-icon="inline-start" />
            {busy ? "Guardando…" : "Usar este recorte"}
          </Button>
        </div>
      </div>
    </div>
  )
}
