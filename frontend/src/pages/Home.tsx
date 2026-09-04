import { CallHero } from "@/components/CallHero"
import { AssistantChat } from "@/components/AssistantChat"

export const HomePage = () => {
  return (
    <main className="mx-auto flex h-[calc(100svh-var(--k-safe-area-top)-var(--k-safe-area-bottom)-6.75rem)] w-full max-w-lg flex-col">
      <CallHero />
      <AssistantChat />
    </main>
  )
}
