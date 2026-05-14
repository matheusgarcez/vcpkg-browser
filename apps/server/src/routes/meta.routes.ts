import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { getClient } from "@pkg/db";
import { registrySnapshots, ports, portFeatures, tripletSupport, jobRuns, catalogMeta } from "@pkg/db";

export async function metaRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/meta", async () => {
    const db = getClient();

    const snapshot = await db.select()
      .from(registrySnapshots)
      .orderBy(sql`${registrySnapshots.id} DESC`)
      .limit(1)
      .then(r => r[0] ?? null);
    const lastSuccessfulSync = await db.select({ finishedAt: jobRuns.finishedAt })
      .from(jobRuns)
      .where(sql`${jobRuns.jobName} = 'sync-vcpkg' AND ${jobRuns.status} = 'success'`)
      .orderBy(sql`${jobRuns.id} DESC`)
      .limit(1)
      .then((rows) => rows[0] ?? null);
    const releaseMetaRows = await db.select()
      .from(catalogMeta)
      .where(sql`${catalogMeta.key} in ('latest_release_version', 'latest_release_published_at', 'latest_release_commit_sha')`);

    const [{ portsCount }] = await db.select({ portsCount: sql<number>`count(*)` }).from(ports);
    const [{ featuresCount }] = await db.select({ featuresCount: sql<number>`count(*)` }).from(portFeatures);
    const releaseMetaMap = new Map(releaseMetaRows.map((row) => [row.key, row.value]));
    const latestRelease = releaseMetaMap.get("latest_release_version")
      ? {
          version: releaseMetaMap.get("latest_release_version")!,
          publishedAt: releaseMetaMap.get("latest_release_published_at") ?? "",
        }
      : null;

    return {
      portsCount,
      featuresCount,
      registryCommit: snapshot?.commitSha ?? "",
      registryUpdatedAt: snapshot?.indexedAt ?? "",
      lastSuccessfulSyncAt: lastSuccessfulSync?.finishedAt ?? undefined,
      latestRelease: latestRelease ?? undefined,
    };
  });

  app.get("/api/triplets", async () => {
    const db = getClient();
    const rows = await db.all<Array<{ triplet: string; ports: number }>>(
      sql`SELECT triplet, count(*) as ports FROM triplet_support WHERE supported = 1 GROUP BY triplet ORDER BY ports DESC`
    );
    return { triplets: rows ?? [] };
  });

  app.get("/api/triplets/:triplet/ports", async (request) => {
    const { triplet } = request.params as { triplet: string };
    const { page, pageSize } = request.query as { page?: string; pageSize?: string; };
    const db = getClient();
    const p = page ? parseInt(page, 10) : 1;
    const ps = Math.min(pageSize ? parseInt(pageSize, 10) : 30, 100);

    const rows = db.all(
      sql`SELECT port_name FROM triplet_support WHERE triplet = ${triplet} AND supported = 1 LIMIT ${ps} OFFSET ${(p - 1) * ps}`
    ) as Array<{ port_name: string }>;
    const [{ count: total }] = db.all(
      sql`SELECT count(*) as count FROM triplet_support WHERE triplet = ${triplet} AND supported = 1`
    ) as Array<{ count: number }>;

    const { getPortDetail } = await import("../services/ports.service.js");
    const items = (await Promise.all((rows ?? []).map((r: { port_name: string }) => getPortDetail(r.port_name)))).filter(Boolean);

    return { items, page: p, pageSize: ps, total };
  });

  app.get("/api/releases", async () => {
    const db = getClient();
    const rows = await db.select()
      .from(registrySnapshots)
      .orderBy(sql`${registrySnapshots.id} DESC`)
      .limit(50);

    return {
      releases: rows.map(r => ({
        version: r.releaseVersion ?? `commit-${r.commitSha.slice(0, 8)}`,
        publishedAt: r.releasePublishedAt ?? r.indexedAt,
        commitSha: r.commitSha,
        portsCount: r.portsCount,
      })),
    };
  });
}
