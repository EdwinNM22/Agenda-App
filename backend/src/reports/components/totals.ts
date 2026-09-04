import type { ReportTotalsComponent } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { drawHorizontalRule, moveDown } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

export const renderTotals = (ctx: PdfContext, component: ReportTotalsComponent) => {
  const { doc, margin, contentWidth } = ctx
  drawHorizontalRule(ctx)

  for (const row of component.rows) {
    ctx.ensureSpace(16)
    const y = doc.y
    doc
      .fillColor(reportTheme.colors.ink)
      .font(reportTheme.fonts.bold)
      .fontSize(reportTheme.sizes.body)
      .text(row.label, margin, y, { width: contentWidth * 0.65, continued: false })
    doc
      .fillColor(reportTheme.colors.ink)
      .font(reportTheme.fonts.bold)
      .fontSize(reportTheme.sizes.body)
      .text(row.value, margin, y, { width: contentWidth, align: "right" })
    doc.y = y + 14
  }

  moveDown(ctx, 6)
}
