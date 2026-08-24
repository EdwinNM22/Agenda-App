import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import { useLocation } from "react-router-dom"
import { useTaskSocket } from "@/hooks/useTaskSocket"
import { applyTaskSocketEvent } from "@/lib/taskSocket"
import { listTasks, type Task } from "@/lib/tasks"

type TasksContextValue = {
  tasks: Task[]
  setTasks: Dispatch<SetStateAction<Task[]>>
  live: boolean
  loading: boolean
  error: string | null
  setError: (error: string | null) => void
  reload: () => Promise<void>
}

const TasksContext = createContext<TasksContextValue | undefined>(undefined)

export const TasksProvider = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const skipPathReload = useRef(true)

  const onSocketEvent = useCallback((event: Parameters<typeof applyTaskSocketEvent>[1]) => {
    setTasks((current) => applyTaskSocketEvent(current, event))
  }, [])

  const live = useTaskSocket(onSocketEvent)

  const reload = useCallback(async () => {
    const data = await listTasks()
    setTasks(data.tasks)
  }, [])

  useEffect(() => {
    let cancelled = false
    listTasks()
      .then((data) => {
        if (!cancelled) {
          setTasks(data.tasks)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudieron cargar las tareas")
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (skipPathReload.current) {
      skipPathReload.current = false
      return
    }
    void reload().catch(() => undefined)
  }, [pathname, reload])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reload().catch(() => undefined)
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [reload])

  const value = useMemo(
    () => ({ tasks, setTasks, live, loading, error, setError, reload }),
    [tasks, live, loading, error, reload],
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export const useTasks = () => {
  const context = useContext(TasksContext)
  if (!context) {
    throw new Error("useTasks debe usarse dentro de TasksProvider")
  }
  return context
}
