import fastifyStatic from "@fastify/static";
import path from "node:path";
import type { FastifyInstance } from "fastify";

export async function staticPlugin(app: FastifyInstance) {
  const distPath = process.env.WEB_DIST_DIR
    ? path.resolve(process.env.WEB_DIST_DIR)
    : path.resolve(process.cwd(), "apps/web/dist");

  await app.register(fastifyStatic, {
    root: distPath,
    prefix: "/",
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "API route not found." },
      });
    }
    return reply.sendFile("index.html");
  });
}
