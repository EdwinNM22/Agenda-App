import type { ReactNode } from "react"
import { CheckSquare, Home, Settings2 } from "lucide-react"
import { App, Icon, Tabbar, TabbarLink, ToolbarPane } from "konsta/react"
import { LiquidGlass } from "liquid-glass-backdrop-react"
import { motion } from "motion/react"
import { useLocation, useNavigate } from "react-router-dom"
import { FloatingAssistant } from "@/components/FloatingAssistant"
import { useHideOnScroll } from "@/hooks/useHideOnScroll"
import { TasksProvider } from "@/lib/tasks-store"
import { VoiceAssistantProvider } from "@/lib/voice-assistant"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { HomePage } from "@/pages/Home"
import { OptionsPage } from "@/pages/Options"
import { TasksPage } from "@/pages/Tasks"

const tabs = [
  { to: "/", label: "Home", match: (path: string) => path === "/", Icon: Home },
  {
    to: "/tareas",
    label: "Agenda",
    match: (path: string) => path.startsWith("/tareas"),
    Icon: CheckSquare,
  },
  {
    to: "/opciones",
    label: "Ajustes",
    match: (path: string) => path.startsWith("/opciones") || path.startsWith("/perfil"),
    Icon: Settings2,
  },
] as const

const TabScreen = ({
  active,
  fade,
  children,
}: {
  active: boolean
  fade: boolean
  children: ReactNode
}) => (
  <div
    className={
      active
        ? "relative"
        : fade
          ? "pointer-events-none absolute inset-x-0 top-0 w-full"
          : "hidden"
    }
    style={
      fade
        ? {
            opacity: active ? 1 : 0,
            transition: "opacity 0.2s ease",
          }
        : undefined
    }
    inert={!active}
    aria-hidden={!active}
  >
    {children}
  </div>
)

export const AppShell = () => {
  const { theme } = useTheme()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const hidden = useHideOnScroll(pathname)

  return (
    <VoiceAssistantProvider>
      <TasksProvider>
        <App
          theme="ios"
          dark={theme !== "light"}
          safeAreas
          className={cn(
            "min-h-svh text-foreground",
            theme === "dark" ? "!bg-transparent" : "bg-background",
          )}
        >
          <div className="relative min-h-svh pb-[calc(var(--k-safe-area-bottom)+6.75rem)]">
            <TabScreen active={pathname === "/"} fade={theme !== "wallpaper"}>
              <HomePage />
            </TabScreen>
            <TabScreen active={pathname === "/tareas"} fade={theme !== "wallpaper"}>
              <TasksPage />
            </TabScreen>
            <TabScreen
              active={pathname.startsWith("/opciones") || pathname.startsWith("/perfil")}
              fade={theme !== "wallpaper"}
            >
              <OptionsPage />
            </TabScreen>
          </div>

          <FloatingAssistant />

          <motion.div
            className="agenda-tabbar-wrap fixed inset-x-0 bottom-0 z-50"
            animate={{ y: hidden ? "110%" : 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <Tabbar labels icons innerClassName="!h-16" className="agenda-tabbar relative !px-4">
              <LiquidGlass
                variant="surface"
                surface="convex_squircle"
                glassThickness={160}
                refractiveIndex={1.48}
                refractionScale={0.72}
                bezelRatio={0.3}
                bezelMinPx={8}
                bezelMaxPx={14}
                blurStdDev={0.4}
                colorSaturate={1.28}
                specularOpacity={0.42}
                specularRimBlur={0.6}
                className="h-full w-full shadow-ios-light-glass dark:shadow-ios-dark-glass"
              >
                <ToolbarPane className="!bg-transparent !shadow-none !backdrop-blur-none">
                  {tabs.map((tab) => {
                    const active = tab.match(pathname)
                    const TabIcon = tab.Icon
                    return (
                      <TabbarLink
                        key={tab.to}
                        component="button"
                        className="appearance-none"
                        active={active}
                        colors={{
                          textActiveIos: "text-ios-primary",
                          textIos: "text-black/45 dark:text-white/45",
                        }}
                        onClick={() => navigate(tab.to)}
                        icon={
                          <Icon
                            ios={
                              <TabIcon
                                className="h-6 w-6 fill-none"
                                strokeWidth={active ? 2.4 : 1.8}
                              />
                            }
                          />
                        }
                        label={tab.label}
                        linkProps={{ type: "button" }}
                      />
                    )
                  })}
                </ToolbarPane>
              </LiquidGlass>
            </Tabbar>
          </motion.div>
        </App>
      </TasksProvider>
    </VoiceAssistantProvider>
  )
}
