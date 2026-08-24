import type { ReactNode } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { useAuth } from "@/lib/auth"
import { HomePage } from "@/pages/Home"
import { LoginPage } from "@/pages/Login"
import { OptionsPage } from "@/pages/Options"
import { TasksPage } from "@/pages/Tasks"

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando...
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/tareas" element={<TasksPage />} />
        <Route path="/opciones" element={<OptionsPage />} />
        <Route path="/perfil" element={<Navigate to="/opciones" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
