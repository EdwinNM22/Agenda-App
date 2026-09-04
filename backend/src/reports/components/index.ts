import type { Report, ReportComponent, ReportSection } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { drawHorizontalRule, moveDown, wrapTextHeight } from "../pdfContext.js"
import { reportTheme } from "../theme.js"
import { renderHeading } from "./heading.js"
import { renderText } from "./text.js"
import { renderNote } from "./note.js"
import { renderMetrics } from "./metrics.js"
import { renderTable } from "./table.js"
import { renderList } from "./list.js"
import { renderKeyValue } from "./keyValue.js"
import { renderStatus } from "./status.js"
import { renderTotals } from "./totals.js"
import { renderSpacer } from "./spacer.js"
import { renderDivider } from "./divider.js"

export const renderDocumentHeader = (ctx: PdfContext, report: Report) => {
  const { doc, margin, contentWidth } = ctx
  const { colors, fonts, sizes } = reportTheme

  doc
    .fillColor(colors.accent)
    .font(fonts.bold)
    .fontSize(8)
    .text("ISI · EC", margin, margin, { width: contentWidth, align: "left" })

  doc.y = margin + 14
  doc
    .fillColor(colors.ink)
    .font(fonts.bold)
    .fontSize(sizes.title)
    .text(report.title, margin, doc.y, { width: contentWidth })

  if (report.subtitle) {
    moveDown(ctx, 4)
    doc
      .fillColor(colors.muted)
      .font(fonts.regular)
      .fontSize(sizes.subtitle)
      .text(report.subtitle, margin, doc.y, { width: contentWidth })
  }

  if (report.metadata && report.metadata.length > 0) {
    moveDown(ctx, 10)
    doc.font(fonts.regular).fontSize(sizes.small)
    for (const item of report.metadata) {
      ctx.ensureSpace(12)
      const label = `${item.label}: `
      doc.fillColor(colors.muted).font(fonts.bold).text(label, margin, doc.y, {
        continued: true,
        width: contentWidth,
      })
      doc.fillColor(colors.ink).font(fonts.regular).text(item.value, { width: contentWidth })
    }
  }

  moveDown(ctx, 6)
  drawHorizontalRule(ctx)
}

export const renderSection = (ctx: PdfContext, section: ReportSection) => {
  const { doc, margin, contentWidth } = ctx
  const { colors, fonts, sizes } = reportTheme

  if (section.title) {
    const height = wrapTextHeight(doc, section.title, contentWidth, sizes.section, fonts.bold)
    ctx.ensureSpace(height + 16)
    moveDown(ctx, 4)
    doc
      .fillColor(colors.ink)
      .font(fonts.bold)
      .fontSize(sizes.section)
      .text(section.title, margin, doc.y, { width: contentWidth })
    moveDown(ctx, 6)
  }

  for (const component of section.components) {
    renderComponent(ctx, component)
  }
}

export const renderComponent = (ctx: PdfContext, component: ReportComponent) => {
  switch (component.type) {
    case "heading":
      renderHeading(ctx, component)
      break
    case "text":
      renderText(ctx, component)
      break
    case "note":
      renderNote(ctx, component)
      break
    case "metrics":
      renderMetrics(ctx, component)
      break
    case "table":
      renderTable(ctx, component)
      break
    case "list":
      renderList(ctx, component)
      break
    case "keyValue":
      renderKeyValue(ctx, component)
      break
    case "status":
      renderStatus(ctx, component)
      break
    case "totals":
      renderTotals(ctx, component)
      break
    case "spacer":
      renderSpacer(ctx, component)
      break
    case "divider":
      renderDivider(ctx)
      break
  }
}
