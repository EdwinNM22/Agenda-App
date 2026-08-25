import { BrandOrb } from "@/components/BrandOrb"

export const AuthSplash = () => (
  <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-transparent px-6 pt-[var(--k-safe-area-top)] pb-[var(--k-safe-area-bottom)]">
    <BrandOrb size="sm" />
    <p className="mt-5 text-sm text-muted-foreground">Cargando Agenda…</p>
  </main>
)
