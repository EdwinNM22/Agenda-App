import type { ReportStatusComponent, ReportStatusTone } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

const toneColor = (tone: ReportStatusTone | undefined) => {
  switch (tone) {
    case "ok":
      return reportTheme.colors.ok
    case "warn":
      return reportTheme.colors.warn
    case "danger":
      return reportTheme.colors.danger
    default:
      return reportTheme.colors.neutral
  }
}

export const renderStatus = (ctx: PdfContext, component: ReportStatusComponent) => {
  const { doc, margin, contentWidth } = ctx
  ctx.ensureSpace(22)
  const y = doc.y
  const color = toneColor(component.tone)

  doc.circle(margin + 4, y + 7, 3).fill(color)
  doc
    .fillColor(reportTheme.colors.muted)
    .font(reportTheme.fonts.regular)
    .fontSize(reportTheme.sizes.body)
    .text(`${component.label}: `, margin + 12, y, { continued: true, width: contentWidth - 12 })
  doc.fillColor(color).font(reportTheme.fonts.bold).text(component.value)

  moveDown(ctx, 4)
}
