import { createPortal } from "react-dom"

export const DarkAtmosphere = () => {
  if (typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute -top-28 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-violet-400/14 blur-3xl" />
      <div className="absolute -right-16 bottom-[-8%] size-72 rounded-full bg-fuchsia-500/12 blur-3xl" />
      <div className="absolute -bottom-24 -left-20 size-64 rounded-full bg-indigo-400/12 blur-3xl" />
    </div>,
    document.body,
  )
}
