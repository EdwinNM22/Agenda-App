import type { FastifyInstance } from "fastify"
import { fetchPrestamoHub, resourceToHubPath } from "../../integrations/prestamo/client.js"

const PRESTAMO_RESOURCES = [
  "caja-chica",
  "caja-chica/detalle",
  "ingresos",
  "egresos",
  "desembolsos",
  "resumen",
  "cuotas-vencidas",
  "cuotas",
  "creditos",
  "clientes",
  "pagos",
  "liquidez",
] as const

const pickQuery = (query: Record<string, unknown>) => {
  const allowed = ["fecha", "fechaInicio", "fechaFin", "q", "id", "limit", "estado", "year", "startDate", "endDate", "creditoId", "clienteId"]
  const out: Record<string, string | undefined> = {}
  for (const key of allowed) {
    const value = query[key]
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim()
    }
  }
  return out
}

export const registerPrestamoIntegrationRoutes = async (app: FastifyInstance) => {
  for (const resource of PRESTAMO_RESOURCES) {
    const routePath = `/api/integrations/prestamo/${resource}`

    app.get(
      routePath,
      {
        onRequest: [app.authenticate],
      },
      async (request, reply) => {
        const result = await fetchPrestamoHub(resource, pickQuery(request.query as Record<string, unknown>))

        if (!result.ok) {
          return reply.code(result.status ?? 502).send(result)
        }

        return result
      },
    )
  }

  // Alias para la tool: caja-chica-detalle → caja-chica/detalle
  app.get(
    "/api/integrations/prestamo/caja-chica-detalle",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      const result = await fetchPrestamoHub(
        resourceToHubPath("caja-chica-detalle"),
        pickQuery(request.query as Record<string, unknown>),
      )

      if (!result.ok) {
        return reply.code(result.status ?? 502).send(result)
      }

      return result
    },
  )
}
