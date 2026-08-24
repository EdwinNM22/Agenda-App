import Orb from "@/components/Orb"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

type BrandOrbProps = {
  size?: "sm" | "md" | "lg"
  className?: string
}

const SIZE = {
  sm: "size-16",
  md: "size-24",
  lg: "size-32",
} as const

export const BrandOrb = ({ size = "md", className }: BrandOrbProps) => {
  const { theme, wallpaperColor } = useTheme()
  const backgroundColor =
    theme === "wallpaper"
      ? (wallpaperColor ?? "#1c1c1e")
      : theme === "light"
        ? "#f4f2f8"
        : "#0a0a0a"

  return (
    <div
      className={cn(
        "assistant-orb glass-surface relative overflow-hidden rounded-full border",
        SIZE[size],
        className,
      )}
    >
      <div className="assistant-orb-glow size-full">
        <Orb
          hue={270}
          hoverIntensity={0.28}
          rotateOnHover
          forceHoverState
          backgroundColor={backgroundColor}
        />
      </div>
    </div>
  )
}
