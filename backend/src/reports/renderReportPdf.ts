import PDFDocument from "pdfkit"
import type { Report } from "./schema.js"
import { createPdfContext } from "./pdfContext.js"
import { renderDocumentHeader, renderSection } from "./components/index.js"
import { reportTheme } from "./theme.js"

const applyPageFooters = (doc: PDFKit.PDFDocument) => {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i)
    const pageNumber = i + 1
    const total = range.count
    const margin = reportTheme.page.margin
    const y = doc.page.height - margin + 4
    doc
      .strokeColor(reportTheme.colors.line)
      .lineWidth(0.5)
      .moveTo(margin, y - 10)
      .lineTo(doc.page.width - margin, y - 10)
      .stroke()
    doc
      .fillColor(reportTheme.colors.soft)
      .font(reportTheme.fonts.regular)
      .fontSize(reportTheme.sizes.footer)
      .text("Isi · EC", margin, y - 6, { lineBreak: false })
    doc.text(`Página ${pageNumber} de ${total}`, margin, y - 6, {
      width: doc.page.width - margin * 2,
      align: "right",
      lineBreak: false,
    })
  }
}

export const renderReportPdf = async (report: Report): Promise<Buffer> => {
  const doc = new PDFDocument({
    size: reportTheme.page.size,
    margins: {
      top: reportTheme.page.margin,
      bottom: reportTheme.page.margin + 12,
      left: reportTheme.page.margin,
      right: reportTheme.page.margin,
    },
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: report.title,
      Author: "Isi",
      Creator: "EC Assistant",
    },
  })

  const chunks: Buffer[] = []
  doc.on("data", (chunk: Buffer) => {
    chunks.push(chunk)
  })

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })

  const ctx = createPdfContext(doc)
  renderDocumentHeader(ctx, report)

  for (const section of report.sections) {
    renderSection(ctx, section)
  }

  applyPageFooters(doc)
  doc.end()
  return done
}
