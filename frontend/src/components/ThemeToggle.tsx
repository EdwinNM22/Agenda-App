import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/lib/theme"

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme()
  const dark = theme !== "light"

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="glass-surface size-10 rounded-full border"
      onClick={toggleTheme}
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
