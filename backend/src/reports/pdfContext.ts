import { reportTheme } from "./theme.js"

export type PdfContext = {
  doc: PDFKit.PDFDocument
  margin: number
  contentWidth: number
  pageBottom: number
  ensureSpace: (needed: number) => void
  drawFooter: () => void
}

export const createPdfContext = (doc: PDFKit.PDFDocument): PdfContext => {
  const margin = reportTheme.page.margin
  const contentWidth = doc.page.width - margin * 2
  const pageBottom = () => doc.page.height - margin - 18

  const drawFooter = () => {
    const page = doc.bufferedPageRange()
    void page
  }

  const ensureSpace = (needed: number) => {
    if (doc.y + needed <= pageBottom()) {
      return
    }
    doc.addPage()
    doc.x = margin
    doc.y = margin
  }

  return {
    doc,
    margin,
    contentWidth,
    get pageBottom() {
      return pageBottom()
    },
    ensureSpace,
    drawFooter,
  }
}

export const moveDown = (ctx: PdfContext, amount = 8) => {
  ctx.doc.y += amount
}

export const drawHorizontalRule = (ctx: PdfContext, color = reportTheme.colors.line) => {
  ctx.ensureSpace(12)
  const y = ctx.doc.y + 2
  ctx.doc
    .strokeColor(color)
    .lineWidth(0.6)
    .moveTo(ctx.margin, y)
    .lineTo(ctx.margin + ctx.contentWidth, y)
    .stroke()
  ctx.doc.y = y + 8
}

export const wrapTextHeight = (
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  fontSize: number,
  font: string = reportTheme.fonts.regular,
): number => {
  doc.font(font).fontSize(fontSize)
  return doc.heightOfString(text, { width, lineGap: 1.5 })
}
