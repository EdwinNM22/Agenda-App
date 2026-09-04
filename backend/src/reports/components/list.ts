import type { ReportListComponent } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown, wrapTextHeight } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

export const renderList = (ctx: PdfContext, component: ReportListComponent) => {
  const { doc, margin, contentWidth } = ctx
  const bulletWidth = 16
  const textWidth = contentWidth - bulletWidth

  component.items.forEach((item, index) => {
    const marker = component.style === "numbered" ? `${index + 1}.` : "•"
    const height = wrapTextHeight(doc, item, textWidth, reportTheme.sizes.body)
    ctx.ensureSpace(height + 4)
    const y = doc.y
    doc
      .fillColor(reportTheme.colors.ink)
      .font(reportTheme.fonts.regular)
      .fontSize(reportTheme.sizes.body)
      .text(marker, margin, y, { width: bulletWidth, align: "left" })
    doc.text(item, margin + bulletWidth, y, { width: textWidth, lineGap: 1.2 })
    doc.y = Math.max(doc.y, y + height)
    moveDown(ctx, 3)
  })

  moveDown(ctx, 4)
}
