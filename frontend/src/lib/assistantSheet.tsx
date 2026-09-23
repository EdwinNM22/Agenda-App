import {
  createContext,
  useCallback,
  useContext,
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
    setOpen(true)
  }, [])

  const closeSheet = useCallback(() => {
    setOpen(false)
  }, [])

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
