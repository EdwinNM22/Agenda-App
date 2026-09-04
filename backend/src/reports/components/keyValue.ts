import type { ReportKeyValueComponent } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown, wrapTextHeight } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

export const renderKeyValue = (ctx: PdfContext, component: ReportKeyValueComponent) => {
  const { doc, margin, contentWidth } = ctx
  const labelWidth = Math.min(150, contentWidth * 0.35)
  const valueWidth = contentWidth - labelWidth - 8

  if (component.title) {
    const height = wrapTextHeight(
      doc,
      component.title,
      contentWidth,
      reportTheme.sizes.heading3,
      reportTheme.fonts.bold,
    )
    ctx.ensureSpace(height + 8)
    doc
      .fillColor(reportTheme.colors.ink)
      .font(reportTheme.fonts.bold)
      .fontSize(reportTheme.sizes.heading3)
      .text(component.title, margin, doc.y, { width: contentWidth })
    moveDown(ctx, 4)
  }

  for (const pair of component.pairs) {
    const height = Math.max(
      wrapTextHeight(doc, pair.label, labelWidth, reportTheme.sizes.body, reportTheme.fonts.bold),
      wrapTextHeight(doc, pair.value, valueWidth, reportTheme.sizes.body),
    )
    ctx.ensureSpace(height + 4)
    const y = doc.y
    doc
      .fillColor(reportTheme.colors.muted)
      .font(reportTheme.fonts.bold)
      .fontSize(reportTheme.sizes.body)
      .text(pair.label, margin, y, { width: labelWidth })
    doc
      .fillColor(reportTheme.colors.ink)
      .font(reportTheme.fonts.regular)
      .fontSize(reportTheme.sizes.body)
      .text(pair.value, margin + labelWidth + 8, y, { width: valueWidth, lineGap: 1.2 })
    doc.y = Math.max(doc.y, y + height)
    moveDown(ctx, 3)
  }

  moveDown(ctx, 4)
}
