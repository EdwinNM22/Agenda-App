import { cn } from "@/lib/utils"

const ICON_SIZE = {
  sm: 64,
  md: 96,
  lg: 128,
} as const

const FULL_WIDTH = {
  sm: 140,
  md: 180,
  lg: 240,
} as const

type BrandOrbProps = {
  size?: keyof typeof ICON_SIZE
  /** Full wordmark on login; compact EC mark on splash. */
  variant?: "icon" | "full"
  className?: string
}

export const BrandOrb = ({ size = "md", variant = "icon", className }: BrandOrbProps) => {
  if (variant === "full") {
    return (
      <img
        src="/brand/ec-assistant-logo.png"
        alt="EC Assistant"
        width={FULL_WIDTH[size]}
        className={cn("mx-auto h-auto select-none", className)}
        draggable={false}
      />
    )
  }

  const px = ICON_SIZE[size]
  return (
    <img
      src="/brand/ec-assistant-icon.png"
      alt="EC Assistant"
      width={px}
      height={px}
      className={cn("mx-auto select-none", className)}
      draggable={false}
    />
  )
}
