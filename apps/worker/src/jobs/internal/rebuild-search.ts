import { getClient, getSqlite } from "@pkg/db";
import { ports, upstreamRepositories } from "@pkg/db";
import { eq } from "drizzle-orm";

function canonicalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
}

export async function rebuildSearchIndexStep() {
  const db = getClient();
  const sqlite = getSqlite();

  sqlite.exec("DROP TABLE IF EXISTS ports_title_fts");
  sqlite.exec("DROP TABLE IF EXISTS ports_fts");
  sqlite.exec(`
    CREATE VIRTUAL TABLE ports_title_fts USING fts5(
      port_name UNINDEXED,
      name,
      display_name,
      upstream_repo,
      name_canonical,
      display_name_canonical,
      upstream_repo_canonical,
      tokenize = 'trigram'
    )
  `);
  sqlite.exec(`
    CREATE VIRTUAL TABLE ports_fts USING fts5(
      port_name UNINDEXED,
      description,
      prefix = '2 3 4'
    )
  `);

  const allPorts = await db.select({
    name: ports.name,
    displayName: ports.displayName,
    description: ports.description,
  }).from(ports);

  const insertTitleStmt = sqlite.prepare(`
    INSERT INTO ports_title_fts(
      port_name, name, display_name, upstream_repo,
      name_canonical, display_name_canonical, upstream_repo_canonical
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBodyStmt = sqlite.prepare(`
    INSERT INTO ports_fts(
      port_name, description
    ) VALUES (?, ?)
  `);

  const insertMany = sqlite.transaction(
    (rows: Array<{
      name: string;
      displayName: string | null;
      description: string | null;
      upstreamRepo: string;
    }>) => {
      for (const row of rows) {
        insertTitleStmt.run(
          row.name,
          row.name,
          row.displayName ?? "",
          row.upstreamRepo,
          canonicalizeSearchValue(row.name),
          canonicalizeSearchValue(row.displayName),
          canonicalizeSearchValue(row.upstreamRepo),
        );
        insertBodyStmt.run(
          row.name,
          row.description ?? "",
        );
      }
    }
  );

  const batchSize = 100;
  for (let i = 0; i < allPorts.length; i += batchSize) {
    const batch = allPorts.slice(i, i + batchSize);

    const rows = await Promise.all(
      batch.map(async (port) => {
        const upstream = await db.select({
          repo: upstreamRepositories.repo,
        })
          .from(upstreamRepositories)
          .where(eq(upstreamRepositories.portName, port.name))
          .limit(1)
          .then((result) => result[0] ?? null);

        return {
          name: port.name,
          displayName: port.displayName,
          description: port.description,
          upstreamRepo: upstream?.repo ?? "",
        };
      })
    );

    insertMany(rows);
  }

  console.log(`Search index rebuilt: ${allPorts.length} ports indexed`);
}
