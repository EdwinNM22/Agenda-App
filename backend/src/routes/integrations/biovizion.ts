import type { FastifyInstance } from "fastify"
import { fetchBiovizionHub } from "../../integrations/biovizion/client.js"

const BIOVIZION_RESOURCES = [
  "resumen",
  "proyectos",
  "reportes",
  "citas",
  "dre",
  "asistencia",
  "personas",
  "ubicaciones",
  "horas",
  "equipo",
  "push-pendientes",
  "inconsistencias",
] as const

const pickQuery = (query: Record<string, unknown>) => {
  const allowed = [
    "fecha",
    "fechaInicio",
    "fechaFin",
    "status",
    "search",
    "q",
    "activeOnly",
    "limit",
    "date",
    "userName",
    "projectId",
  ]
  const out: Record<string, string | undefined> = {}
  for (const key of allowed) {
    const value = query[key]
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim()
    }
  }
  if (!out.search && out.q) {
    out.search = out.q
    delete out.q
  }
  if (out.fecha && !out.fechaInicio && !out.fechaFin) {
    out.fechaInicio = out.fecha
    out.fechaFin = out.fecha
    delete out.fecha
  }
  return out
}

export const registerBiovizionIntegrationRoutes = async (app: FastifyInstance) => {
  for (const resource of BIOVIZION_RESOURCES) {
    app.get(
      `/api/integrations/biovizion/${resource}`,
      {
        onRequest: [app.authenticate],
      },
      async (request, reply) => {
        const result = await fetchBiovizionHub(resource, pickQuery(request.query as Record<string, unknown>))

        if (!result.ok) {
          return reply.code(result.status ?? 502).send(result)
        }

        return result
      },
    )
  }
}
