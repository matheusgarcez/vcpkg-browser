import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import compress from "@fastify/compress";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { createPrettyLogger } from "@pkg/shared/logging";
import { loadConfig, type Config } from "./config.js";
import { dbPlugin } from "./plugins/db.js";
import { swaggerPlugin } from "./plugins/swagger.js";
import { staticPlugin } from "./plugins/static.js";
import { metaRoutes } from "./routes/meta.routes.js";
import { portsRoutes } from "./routes/ports.routes.js";
import { searchRoutes } from "./routes/search.routes.js";
import { jobsRoutes } from "./routes/jobs.routes.js";

const requestStartedAt = Symbol("requestStartedAt");

export async function buildApp(config?: Config) {
  const cfg = config ?? loadConfig();
  const devLogger = cfg.NODE_ENV === "development" ? createPrettyLogger("server") : null;

  const app = Fastify({
    logger: cfg.NODE_ENV === "production",
  });

  if (devLogger) {
    app.addHook("onRequest", (request, _reply, done) => {
      (request as FastifyRequest & { [requestStartedAt]?: bigint })[requestStartedAt] = process.hrtime.bigint();
      done();
    });

    app.addHook("onResponse", (request, reply, done) => {
      const startedAt = (request as FastifyRequest & { [requestStartedAt]?: bigint })[requestStartedAt];
      const durationMs = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1_000_000 : undefined;

      devLogger.info(`${request.method} ${request.url}`, {
        statusCode: reply.statusCode,
        durationMs: typeof durationMs === "number" ? Number(durationMs.toFixed(1)) : undefined,
      });
      done();
    });
  }

  app.setErrorHandler((err, request, reply) => {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const statusCode = error.statusCode ?? 500;

    if (devLogger) {
      const level = statusCode >= 500 ? "error" : "warn";
      devLogger[level](`${request.method} ${request.url}`, {
        statusCode,
        code: error.code,
        error: error.message ?? "An unexpected error occurred.",
      });
    }

    reply.status(statusCode).send({
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: error.message ?? "An unexpected error occurred.",
      },
    });
  });

  await app.register(cors);
  await app.register(compress);
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(dbPlugin, { dbPath: cfg.DATABASE_FILE });

  if (cfg.NODE_ENV === "development") {
    await swaggerPlugin(app);
  }

  if (cfg.NODE_ENV === "production") {
    await staticPlugin(app);
  }

  await app.register(metaRoutes);
  await app.register(portsRoutes);
  await app.register(searchRoutes);
  await app.register(jobsRoutes);

  return app;
}
