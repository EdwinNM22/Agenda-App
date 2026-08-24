import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"

type FieldLabelProps = {
  htmlFor?: string
  icon: LucideIcon
  children: ReactNode
}

export const FieldLabel = ({ htmlFor, icon: Icon, children }: FieldLabelProps) => (
  <Label htmlFor={htmlFor} className="text-muted-foreground">
    <Icon className="size-3.5 opacity-80" />
    {children}
  </Label>
)
