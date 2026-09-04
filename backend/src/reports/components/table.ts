import type { ReportTableComponent, ReportTableColumn } from "../schema.js"
import type { PdfContext } from "../pdfContext.js"
import { moveDown, wrapTextHeight } from "../pdfContext.js"
import { reportTheme } from "../theme.js"

const resolveWidths = (columns: ReportTableColumn[], contentWidth: number): number[] => {
  const fixed = columns.map((column) => column.width ?? 0)
  const fixedSum = fixed.reduce((sum, value) => sum + value, 0)
  const flexible = columns.filter((column) => !column.width).length
  const remaining = Math.max(contentWidth - fixedSum, flexible * 40)
  const flexWidth = flexible > 0 ? remaining / flexible : 0
  return columns.map((column) => column.width ?? flexWidth)
}

const rowHeight = (
  doc: PDFKit.PDFDocument,
  columns: ReportTableColumn[],
  widths: number[],
  values: string[],
  fontSize: number,
  font: string,
  paddingY: number,
) => {
  let max = 0
  columns.forEach((_, index) => {
    const height = wrapTextHeight(doc, values[index] ?? "", Math.max(widths[index] - 8, 20), fontSize, font)
    max = Math.max(max, height)
  })
  return Math.max(max + paddingY * 2, 18)
}

export const renderTable = (ctx: PdfContext, component: ReportTableComponent) => {
  const { doc, margin, contentWidth } = ctx
  const { columns, rows } = component
  if (columns.length === 0) {
    return
  }

  const widths = resolveWidths(columns, contentWidth)
  const headerLabels = columns.map((column) => column.label)
  const headerHeight = rowHeight(
    doc,
    columns,
    widths,
    headerLabels,
    reportTheme.sizes.small,
    reportTheme.fonts.bold,
    5,
  )

  const drawHeader = () => {
    ctx.ensureSpace(headerHeight + 4)
    const y = doc.y
    doc.rect(margin, y, contentWidth, headerHeight).fill(reportTheme.colors.surface)
    let x = margin
    columns.forEach((column, index) => {
      doc
        .fillColor(reportTheme.colors.muted)
        .font(reportTheme.fonts.bold)
        .fontSize(reportTheme.sizes.small)
        .text(column.label, x + 4, y + 5, {
          width: widths[index] - 8,
          align: column.align ?? "left",
          lineGap: 1,
        })
      x += widths[index]
    })
    doc.y = y + headerHeight
  }

  drawHeader()

  rows.forEach((row, rowIndex) => {
    const values = columns.map((column) => String(row[column.key] ?? ""))
    const height = rowHeight(
      doc,
      columns,
      widths,
      values,
      reportTheme.sizes.body,
      reportTheme.fonts.regular,
      4,
    )

    if (doc.y + height > ctx.pageBottom) {
      doc.addPage()
      doc.x = margin
      doc.y = margin
      drawHeader()
    }

    const y = doc.y
    if (rowIndex % 2 === 1) {
      doc.rect(margin, y, contentWidth, height).fill("#fafaf9")
    }

    let x = margin
    columns.forEach((column, index) => {
      doc
        .fillColor(reportTheme.colors.ink)
        .font(reportTheme.fonts.regular)
        .fontSize(reportTheme.sizes.body)
        .text(values[index] ?? "", x + 4, y + 4, {
          width: widths[index] - 8,
          align: column.align ?? "left",
          lineGap: 1,
        })
      x += widths[index]
    })

    doc
      .strokeColor(reportTheme.colors.line)
      .lineWidth(0.4)
      .moveTo(margin, y + height)
      .lineTo(margin + contentWidth, y + height)
      .stroke()

    doc.y = y + height
  })

  moveDown(ctx, 8)
}
