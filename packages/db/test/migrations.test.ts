import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("database migrations", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("applies cleanly to a fresh SQLite database", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vcpkg-browser-db-"));
    const dbPath = path.join(tempDir, "catalog.sqlite");
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);

    migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), "packages/db/src/migrations"),
    });

    const columns = sqlite.prepare("PRAGMA table_info(upstream_repositories)").all() as Array<{ name: string }>;

    expect(columns.some((column) => column.name === "repo_updated_at")).toBe(true);
    expect(columns.some((column) => column.name === "latest_tag_name")).toBe(true);

    sqlite.close();
  });
});
