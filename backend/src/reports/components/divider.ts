import type { PdfContext } from "../pdfContext.js"
import { drawHorizontalRule } from "../pdfContext.js"

export const renderDivider = (ctx: PdfContext) => {
  drawHorizontalRule(ctx)
}
