import { CallHero } from "@/components/CallHero"
import { AssistantChat } from "@/components/AssistantChat"

/**
 * En PWA (viewport-fit=cover) 100dvh ya incluye notch/home indicator.
 * El inset superior lo aplica CallHero; el inferior va en --agenda-tabbar-offset.
 * No restar otra vez --k-safe-area-top aquí: en standalone se pierde altura y el chat se corta.
 */
export const HomePage = () => {
  return (
    <main className="agenda-home mx-auto flex w-full max-w-lg flex-col overflow-hidden">
      <CallHero />
      <AssistantChat />
    </main>
  )
}
