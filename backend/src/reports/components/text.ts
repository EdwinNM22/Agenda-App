import type { ReportTextComponent } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown, wrapTextHeight } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

export const renderText = (ctx: PdfContext, component: ReportTextComponent) => {
  const { doc, margin, contentWidth } = ctx
  const height = wrapTextHeight(doc, component.text, contentWidth, reportTheme.sizes.body)
  ctx.ensureSpace(height + 6)
  doc
    .fillColor(reportTheme.colors.ink)
    .font(reportTheme.fonts.regular)
    .fontSize(reportTheme.sizes.body)
    .text(component.text, margin, doc.y, { width: contentWidth, lineGap: 1.5, align: "left" })
  moveDown(ctx, 4)
}
