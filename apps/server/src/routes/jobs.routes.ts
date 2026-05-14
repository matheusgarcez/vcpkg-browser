import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { getClient } from "@pkg/db";
import { jobRuns } from "@pkg/db";

export async function jobsRoutes(app: FastifyInstance) {
  app.get("/api/jobs/runs", async () => {
    const db = getClient();
    const rows = await db.select()
      .from(jobRuns)
      .orderBy(sql`${jobRuns.id} DESC`)
      .limit(50);

    return {
      items: rows.map(r => ({
        id: r.id,
        jobName: r.jobName,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt ?? undefined,
        progressCurrent: r.progressCurrent ?? 0,
        progressTotal: r.progressTotal ?? 0,
        message: r.message ?? undefined,
        error: r.errorJson ?? undefined,
      })),
      total: rows.length,
    };
  });

  app.get("/api/jobs/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getClient();
    const row = await db.select()
      .from(jobRuns)
      .where(sql`${jobRuns.id} = ${parseInt(id, 10)}`)
      .limit(1)
      .then(r => r[0] ?? null);

    if (!row) {
      return reply.status(404).send({
        error: { code: "JOB_NOT_FOUND", message: `Job run ${id} not found.` }
      });
    }

    return {
      id: row.id,
      jobName: row.jobName,
      status: row.status,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt ?? undefined,
      progressCurrent: row.progressCurrent ?? 0,
      progressTotal: row.progressTotal ?? 0,
      message: row.message ?? undefined,
      error: row.errorJson ?? undefined,
    };
  });
}
