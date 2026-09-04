import type { ReportHeadingComponent } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown, wrapTextHeight } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

export const renderHeading = (ctx: PdfContext, component: ReportHeadingComponent) => {
  const { doc, margin, contentWidth } = ctx
  const level = component.level ?? 2
  const size =
    level === 1
      ? reportTheme.sizes.heading1
      : level === 3
        ? reportTheme.sizes.heading3
        : reportTheme.sizes.heading2
  const height = wrapTextHeight(
    doc,
    component.text,
    contentWidth,
    size,
    reportTheme.fonts.bold,
  )
  ctx.ensureSpace(height + 10)
  moveDown(ctx, 4)
  doc
    .fillColor(reportTheme.colors.ink)
    .font(reportTheme.fonts.bold)
    .fontSize(size)
    .text(component.text, margin, doc.y, { width: contentWidth })
  moveDown(ctx, 4)
}
