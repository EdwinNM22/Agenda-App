import type { ReportNoteComponent } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown, wrapTextHeight } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

export const renderNote = (ctx: PdfContext, component: ReportNoteComponent) => {
  const { doc, margin, contentWidth } = ctx
  const pad = 8
  const innerWidth = contentWidth - pad * 2
  const textHeight = wrapTextHeight(doc, component.text, innerWidth, reportTheme.sizes.small)
  const boxHeight = textHeight + pad * 2
  ctx.ensureSpace(boxHeight + 8)

  const y = doc.y
  doc
    .roundedRect(margin, y, contentWidth, boxHeight, 4)
    .fill(reportTheme.colors.surface)
  doc
    .fillColor(reportTheme.colors.muted)
    .font(reportTheme.fonts.regular)
    .fontSize(reportTheme.sizes.small)
    .text(component.text, margin + pad, y + pad, { width: innerWidth, lineGap: 1.2 })
  doc.y = y + boxHeight
  moveDown(ctx, 6)
}
