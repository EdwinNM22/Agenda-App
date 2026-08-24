import type { FastifyReply, FastifyRequest } from "fastify"

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: number; email: string }
    user: { sub: number; email: string }
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
