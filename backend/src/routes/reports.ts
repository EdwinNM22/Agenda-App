import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FastifyInstance } from "fastify"
import { parseReport, sanitizeFileName } from "../reports/schema.js"
import { renderReportPdf } from "../reports/renderReportPdf.js"
import { reportPublicPath, userReportDiskDir, userReportFolder } from "../uploads.js"

type ReportBody = {
  report?: unknown
  fileName?: unknown
}

export const registerReportRoutes = async (app: FastifyInstance) => {
  app.post<{ Body: ReportBody }>(
    "/api/reports/pdf",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["report"],
          properties: {
            report: { type: "object", additionalProperties: true },
            fileName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = parseReport(request.body.report)
      if ("error" in parsed) {
        return reply.code(400).send({ ok: false, message: parsed.error })
      }

      const fileName = sanitizeFileName(request.body.fileName, parsed.report.title)
      const assetId = randomUUID()
      const relativeDir = userReportFolder(request.user.sub, assetId)
      const diskDir = userReportDiskDir(request.user.sub, assetId)
      const diskPath = path.join(diskDir, fileName)

      try {
        const pdf = await renderReportPdf(parsed.report)
        await mkdir(diskDir, { recursive: true })
        await writeFile(diskPath, pdf)

        const url = reportPublicPath(path.posix.join(relativeDir, fileName))
        return {
          ok: true,
          url,
          fileName,
          title: parsed.report.title,
          bytes: pdf.byteLength,
        }
      } catch (error) {
        request.log.error({ err: error }, "No se pudo generar el PDF del reporte")
        return reply.code(500).send({
          ok: false,
          message: "No se pudo generar el PDF",
        })
      }
    },
  )
}
