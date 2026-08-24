import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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

const MIN_ZOOM = 1
const MAX_ZOOM = 3

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const touchDistance = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

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
  const frameRef = useRef(frame)
  frameRef.current = frame
  const overlayRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; start: WallpaperFrame } | null>(null)
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousPointer = document.body.style.pointerEvents
    document.body.style.overflow = "hidden"
    document.body.style.setProperty("pointer-events", "auto", "important")
    overlayRef.current?.style.setProperty("pointer-events", "auto", "important")
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousPointer) {
        document.body.style.pointerEvents = previousPointer
      } else {
        document.body.style.removeProperty("pointer-events")
      }
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [busy, onCancel])

  useEffect(() => {
    const screen = screenRef.current
    if (!screen) {
      return
    }

    const endGesture = () => {
      dragRef.current = null
      pinchRef.current = null
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        const [first, second] = [event.touches[0], event.touches[1]]
        pinchRef.current = { distance: touchDistance(first, second), zoom: frameRef.current.zoom }
        dragRef.current = null
        return
      }
      if (event.touches.length === 1) {
        const touch = event.touches[0]
        dragRef.current = { x: touch.clientX, y: touch.clientY, start: frameRef.current }
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault()
      const screenBox = screen
      const width = screenBox.clientWidth || 1
      const height = screenBox.clientHeight || 1

      if (event.touches.length === 2) {
        const [first, second] = [event.touches[0], event.touches[1]]
        const distance = touchDistance(first, second)
        const pinch = pinchRef.current ?? {
          distance,
          zoom: frameRef.current.zoom,
        }
        pinchRef.current = pinch
        dragRef.current = null
        const nextZoom = clamp((distance / pinch.distance) * pinch.zoom, MIN_ZOOM, MAX_ZOOM)
        setFrame((current) => ({ ...current, zoom: nextZoom }))
        return
      }

      const drag = dragRef.current
      const touch = event.touches[0]
      if (!drag || !touch) {
        return
      }
      setFrame({
        x: clamp(drag.start.x - ((touch.clientX - drag.x) / width) * 90, 0, 100),
        y: clamp(drag.start.y - ((touch.clientY - drag.y) / height) * 90, 0, 100),
        zoom: drag.start.zoom,
      })
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY > 0 ? -0.08 : 0.08
      setFrame((current) => ({ ...current, zoom: clamp(current.zoom + delta, MIN_ZOOM, MAX_ZOOM) }))
    }

    screen.addEventListener("touchstart", onTouchStart, { passive: false })
    screen.addEventListener("touchmove", onTouchMove, { passive: false })
    screen.addEventListener("touchend", endGesture)
    screen.addEventListener("touchcancel", endGesture)
    screen.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      screen.removeEventListener("touchstart", onTouchStart)
      screen.removeEventListener("touchmove", onTouchMove)
      screen.removeEventListener("touchend", endGesture)
      screen.removeEventListener("touchcancel", endGesture)
      screen.removeEventListener("wheel", onWheel)
    }
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, start: frame }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") {
      return
    }
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const width = event.currentTarget.clientWidth || 1
    const height = event.currentTarget.clientHeight || 1
    setFrame({
      x: clamp(drag.start.x - ((event.clientX - drag.x) / width) * 90, 0, 100),
      y: clamp(drag.start.y - ((event.clientY - drag.y) / height) * 90, 0, 100),
      zoom: drag.start.zoom,
    })
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-auto fixed inset-0 z-[300] flex flex-col bg-black"
      style={{ pointerEvents: "auto" }}
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar recorte del fondo"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="mb-3 text-sm text-white/70">Así se verá en el teléfono</p>
        <div
          className="relative"
          style={{
            height: "min(72dvh, calc(100dvh - 11.25rem), calc(78vw * 19.5 / 9))",
            width: "min(78vw, calc(72dvh * 9 / 19.5), calc((100dvh - 11.25rem) * 9 / 19.5))",
          }}
        >
          <div className="absolute inset-0 rounded-[2.85rem] bg-neutral-700 p-[3px] shadow-[0_24px_80px_-16px_rgba(0,0,0,0.85)]">
            <div
              ref={screenRef}
              className="relative size-full touch-none overflow-hidden rounded-[2.55rem] bg-black"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
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
              <span className="pointer-events-none absolute top-[0.72rem] left-1/2 z-20 h-[1.4rem] w-[5.85rem] -translate-x-1/2 rounded-full bg-black" />
              <span className="pointer-events-none absolute bottom-[0.45rem] left-1/2 z-20 h-[0.28rem] w-[7.25rem] -translate-x-1/2 rounded-full bg-white/50" />
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-white/55">Arrastra para mover · pellizca o usa el zoom</p>
      </div>
      <div className="grid gap-2.5 bg-black px-4 pt-2 pb-[calc(var(--k-safe-area-bottom)+0.75rem)]">
        <label className="grid gap-1 text-xs text-white/70">
          Zoom
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
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
    </div>,
    document.body,
  )
}
