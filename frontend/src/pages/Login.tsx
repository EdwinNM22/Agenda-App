import { type FormEvent, useEffect, useMemo, useState } from "react"
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, Mail } from "lucide-react"
import { motion } from "motion/react"
import { Navigate } from "react-router-dom"
import { AuthSplash, LoginAtmosphere } from "@/components/AuthSplash"
import { BrandOrb } from "@/components/BrandOrb"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"

const LAST_EMAIL_KEY = "agenda.lastEmail"

const greeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) {
    return "Buenos días"
  }
  if (hour < 19) {
    return "Buenas tardes"
  }
  return "Buenas noches"
}

const readLastEmail = () => {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ""
  } catch {
    return ""
  }
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export const LoginPage = () => {
  const { user, loading, login } = useAuth()
  const [email, setEmail] = useState(readLastEmail)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake] = useState(0)
  const hello = useMemo(() => greeting(), [])

  useEffect(() => {
    const syncCaps = (event: KeyboardEvent) => {
      setCapsOn(event.getModifierState("CapsLock"))
    }
    window.addEventListener("keydown", syncCaps)
    window.addEventListener("keyup", syncCaps)
    return () => {
      window.removeEventListener("keydown", syncCaps)
      window.removeEventListener("keyup", syncCaps)
    }
  }, [])

  if (loading) {
    return <AuthSplash />
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  const fail = (message: string) => {
    setError(message)
    setShake((value) => value + 1)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextEmail = email.trim().toLowerCase()
    if (!nextEmail) {
      fail("Escribe tu correo")
      return
    }
    if (!isValidEmail(nextEmail)) {
      fail("Ese correo no se ve válido")
      return
    }
    if (!password) {
      fail("Escribe tu contraseña")
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await login(nextEmail, password)
      localStorage.setItem(LAST_EMAIL_KEY, nextEmail)
    } catch (err) {
      fail(err instanceof Error ? err.message : "No se pudo iniciar sesión")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-background">
      <LoginAtmosphere />

      <div className="absolute top-4 right-4 z-10 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)]">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 20 }}
        >
          <BrandOrb size="lg" />
          <p className="mt-6 text-sm font-medium text-muted-foreground">{hello}</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Bienvenido a EC Agenda</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Tu día y tu asistente en un solo lugar.
          </p>
        </motion.div>

        <motion.form
          key={shake}
          className="mt-10 grid gap-4"
          onSubmit={onSubmit}
          noValidate
          animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.38 }}
        >
          <div className="overflow-hidden rounded-[1.6rem] border bg-card/80 shadow-sm backdrop-blur-xl">
            <label className="grid gap-1.5 px-4 pt-3.5 pb-3" htmlFor="email">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Mail className="size-3.5 opacity-80" />
                Correo
              </span>
              <Input
                id="email"
                className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus={!email}
                placeholder="tú@correo.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (error) {
                    setError(null)
                  }
                }}
                aria-invalid={Boolean(error) && !password}
                disabled={submitting}
                required
              />
            </label>
            <div className="mx-4 h-px bg-border" />
            <label className="grid gap-1.5 px-4 pt-3.5 pb-3" htmlFor="password">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <KeyRound className="size-3.5 opacity-80" />
                Contraseña
              </span>
              <div className="relative">
                <Input
                  id="password"
                  className="h-11 border-0 bg-transparent px-0 pr-10 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus={Boolean(email)}
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (error) {
                      setError(null)
                    }
                  }}
                  aria-invalid={Boolean(error)}
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-0 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
          </div>

          {capsOn ? (
            <p className="px-1 text-xs text-muted-foreground">Mayúsculas activadas</p>
          ) : null}

          {error ? (
            <p
              className="flex items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="h-12 rounded-2xl text-base font-semibold"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </motion.form>
      </div>
    </main>
  )
}
