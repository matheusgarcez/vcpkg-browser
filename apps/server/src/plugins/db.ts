import { createClient } from "@pkg/db";
import type { FastifyInstance } from "fastify";
import type { FastifyPluginAsync } from "fastify";

export async function dbPlugin(app: FastifyInstance, opts: { dbPath: string }) {
  const db = createClient(opts.dbPath);
  app.decorate("db", db);
}

declare module "fastify" {
  interface FastifyInstance {
    db: ReturnType<typeof createClient>;
  }
}
