import type { ReportMetricsComponent } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

export const renderMetrics = (ctx: PdfContext, component: ReportMetricsComponent) => {
  const { doc, margin, contentWidth } = ctx
  const items = component.items
  if (items.length === 0) {
    return
  }

  const gap = 8
  const columns = Math.min(items.length, items.length <= 2 ? items.length : items.length === 3 ? 3 : 4)
  const cardWidth = (contentWidth - gap * (columns - 1)) / columns
  const cardHeight = 46
  let index = 0

  while (index < items.length) {
    const rowItems = items.slice(index, index + columns)
    ctx.ensureSpace(cardHeight + 10)
    const y = doc.y
    rowItems.forEach((item, col) => {
      const x = margin + col * (cardWidth + gap)
      doc.roundedRect(x, y, cardWidth, cardHeight, 4).fill(reportTheme.colors.surface)
      doc
        .fillColor(reportTheme.colors.muted)
        .font(reportTheme.fonts.regular)
        .fontSize(reportTheme.sizes.small)
        .text(item.label, x + 8, y + 8, { width: cardWidth - 16, lineBreak: false })
      doc
        .fillColor(reportTheme.colors.ink)
        .font(reportTheme.fonts.bold)
        .fontSize(12)
        .text(item.value, x + 8, y + 22, { width: cardWidth - 16, lineBreak: false })
      if (item.hint) {
        doc
          .fillColor(reportTheme.colors.soft)
          .font(reportTheme.fonts.regular)
          .fontSize(7.5)
          .text(item.hint, x + 8, y + 36, { width: cardWidth - 16, lineBreak: false })
      }
    })
    doc.y = y + cardHeight
    moveDown(ctx, 8)
    index += columns
  }
}
