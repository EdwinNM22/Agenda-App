import { useTypewriter } from "@/hooks/useTypewriter"

type HomeGreetingTitleProps = {
  greeting: string
  loading: boolean
}

export const HomeGreetingTitle = ({ greeting, loading }: HomeGreetingTitleProps) => {
  const typed = useTypewriter(greeting, !loading && greeting.length > 0)
  const typing = !loading && typed.length < greeting.length

  if (loading) {
    return (
      <div
        className="flex min-h-[4.25rem] flex-col items-center justify-center gap-2.5 px-2"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="busy-shimmer h-7 w-[min(100%,19rem)] rounded-xl" />
        <div className="busy-shimmer h-6 w-[min(72%,13rem)] rounded-xl opacity-55" />
        <span className="sr-only">Preparando tu saludo…</span>
      </div>
    )
  }

  return (
    <h1
      className="min-h-[4.25rem] text-[1.65rem] leading-snug font-semibold tracking-tight text-pretty"
      aria-live="polite"
    >
      {typed}
      {typing ? (
        <span className="assistant-caret ml-0.5 inline-block text-muted-foreground" aria-hidden />
      ) : null}
    </h1>
  )
}
