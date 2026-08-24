import { BrandOrb } from "@/components/BrandOrb"

export const AuthSplash = () => (
  <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background">
    <LoginAtmosphere />
    <BrandOrb size="sm" />
    <p className="mt-5 text-sm text-muted-foreground">Cargando Agenda…</p>
  </main>
)

export const LoginAtmosphere = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
    <div className="absolute -top-28 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-violet-500/18 blur-3xl dark:bg-violet-400/14" />
    <div className="absolute -right-16 bottom-[-8%] size-72 rounded-full bg-fuchsia-400/16 blur-3xl dark:bg-fuchsia-500/12" />
    <div className="absolute -bottom-24 -left-20 size-64 rounded-full bg-indigo-400/12 blur-3xl" />
  </div>
)
