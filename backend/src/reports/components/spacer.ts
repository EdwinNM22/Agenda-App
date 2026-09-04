import type { ReportSpacerComponent } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown } from "../pdfContext.js"

export const renderSpacer = (ctx: PdfContext, component: ReportSpacerComponent) => {
  const size = component.size ?? "md"
  const amount = size === "sm" ? 6 : size === "lg" ? 18 : 10
  moveDown(ctx, amount)
}
