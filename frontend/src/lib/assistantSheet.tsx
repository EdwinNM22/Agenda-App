import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type AssistantSheetContextValue = {
  open: boolean
  openSheet: () => void
  closeSheet: () => void
}

const AssistantSheetContext = createContext<AssistantSheetContextValue | undefined>(undefined)

export const AssistantSheetProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false)

  const openSheet = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement) {
      active.blur()
    }
    // Un frame sin teclado: evita en iOS el “zoom” al abrir el sheet encima del input.
    requestAnimationFrame(() => {
      setOpen(true)
    })
  }, [])

  const closeSheet = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("assistant-sheet-open", open)
    return () => {
      document.documentElement.classList.remove("assistant-sheet-open")
    }
  }, [open])

  const value = useMemo(
    () => ({
      open,
      openSheet,
      closeSheet,
    }),
    [open, openSheet, closeSheet],
  )

  return <AssistantSheetContext.Provider value={value}>{children}</AssistantSheetContext.Provider>
}

export const useAssistantSheet = () => {
  const context = useContext(AssistantSheetContext)
  if (!context) {
    throw new Error("useAssistantSheet debe usarse dentro de AssistantSheetProvider")
  }
  return context
}
