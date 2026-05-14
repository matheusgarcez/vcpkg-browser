import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeClient, createClient, getSqlite } from "@pkg/db";

let searchPorts: typeof import("./ports.service.js").searchPorts;

type PortFixture = {
  name: string;
  displayName?: string;
  version: string;
  description: string;
  readmeSummary?: string;
  repository?: string;
  dependencies?: string;
  features?: string;
  score?: number;
  repo?: string;
  stars?: number;
  hostDependencyCount?: number;
  patchCount?: number;
  packagingRiskScore?: number;
  packagingRiskLabel?: string;
  churn90d?: number;
};

function canonicalize(value: string): string {
  return value.toLowerCase().replace(/[-_\s]+/g, "");
}

function insertPort(sqlite: ReturnType<typeof getSqlite>, fixture: PortFixture) {
  const now = "2026-05-12T00:00:00.000Z";
  sqlite.prepare(`
    INSERT INTO ports(
      name, display_name, version, port_version, description, license, supports,
      usage_text, manifest_json, created_in_registry_at, updated_in_registry_at,
      created_at, updated_at, registry_snapshot_id
    ) VALUES (?, ?, ?, 0, ?, 'MIT', '', '', '{}', ?, ?, ?, ?, 1)
  `).run(
    fixture.name,
    fixture.displayName ?? fixture.name,
    fixture.version,
    fixture.description,
    now,
    now,
    now,
    now,
  );

  sqlite.prepare(`
    INSERT INTO upstream_repositories(
      port_name, provider, owner, repo, repo_url, readme_summary, stars, last_commit_at, created_at, updated_at
    ) VALUES (?, 'github', 'owner', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fixture.name,
    fixture.repo ?? fixture.name,
    `https://github.com/owner/${fixture.repo ?? fixture.name}`,
    fixture.readmeSummary ?? "",
    fixture.stars ?? 0,
    now,
    now,
    now,
  );

  sqlite.prepare(`
    INSERT INTO maintenance_scores(port_name, score, label, reason_json)
    VALUES (?, ?, 'healthy', '{}')
  `).run(fixture.name, fixture.score ?? 0);

  sqlite.prepare(`
    INSERT INTO packaging_risk_scores(port_name, score, label, reasons_json, components_json, updated_at)
    VALUES (?, ?, ?, '[]', '[]', ?)
  `).run(
    fixture.name,
    fixture.packagingRiskScore ?? 0,
    fixture.packagingRiskLabel ?? "low",
    now,
  );

  sqlite.prepare(`
    INSERT INTO port_registry_stats(port_name, current_version_published_at, last_changed_at, churn_30d, churn_90d, churn_365d, same_version_port_bumps, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    fixture.name,
    now,
    now,
    0,
    fixture.churn90d ?? 0,
    fixture.churn90d ?? 0,
    now,
  );

  sqlite.prepare(`
    INSERT INTO port_patch_stats(port_name, patch_count, patch_bytes_total, declared_patch_count, burden_label, patch_files_json, updated_at)
    VALUES (?, ?, 0, ?, 'none', '[]', ?)
  `).run(
    fixture.name,
    fixture.patchCount ?? 0,
    fixture.patchCount ?? 0,
    now,
  );

  for (let index = 0; index < (fixture.hostDependencyCount ?? 0); index++) {
    sqlite.prepare(`
      INSERT INTO port_dependencies(port_name, dependency_name, host)
      VALUES (?, ?, 1)
    `).run(fixture.name, `host-tool-${index}`);
  }

  sqlite.prepare(`
    INSERT INTO ports_title_fts(
      port_name, name, display_name, upstream_repo,
      name_canonical, display_name_canonical, upstream_repo_canonical
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    fixture.name,
    fixture.name,
    fixture.displayName ?? fixture.name,
    fixture.repo ?? fixture.name,
    canonicalize(fixture.name),
    canonicalize(fixture.displayName ?? fixture.name),
    canonicalize(fixture.repo ?? fixture.name),
  );

  sqlite.prepare(`
    INSERT INTO ports_fts(
      port_name, description, readme_summary, usage_text, repository, dependencies, features
    ) VALUES (?, ?, ?, '', ?, ?, ?)
  `).run(
    fixture.name,
    fixture.description,
    fixture.readmeSummary ?? "",
    fixture.repository ?? `github owner ${fixture.repo ?? fixture.name}`,
    fixture.dependencies ?? "",
    fixture.features ?? "",
  );
}

describe("searchPorts ranking", () => {
  let tempDir = "";
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    ({ searchPorts } = await import("./ports.service.js"));
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vcpkg-browse-search-"));
    const dbPath = path.join(tempDir, "catalog.sqlite");
    const bootstrap = new Database(dbPath);

    bootstrap.exec(`
      CREATE TABLE ports (
        name text PRIMARY KEY NOT NULL,
        display_name text,
        version text,
        port_version integer,
        versions_path text,
        description text,
        homepage text,
        license text,
        supports text,
        usage_text text,
        manifest_json text NOT NULL,
        portfile_text text,
        source_url text,
        vcpkg_tree_sha text,
        vcpkg_updated_at text,
        created_in_registry_at text,
        updated_in_registry_at text,
        registry_snapshot_id integer NOT NULL,
        created_at text NOT NULL,
        updated_at text NOT NULL
      );
      CREATE TABLE upstream_repositories (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        port_name text NOT NULL UNIQUE,
        provider text NOT NULL,
        owner text,
        repo text,
        repo_url text NOT NULL,
        readme_summary text,
        stars integer,
        last_commit_at text,
        created_at text NOT NULL,
        updated_at text NOT NULL
      );
      CREATE TABLE upstream_issues (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        upstream_id integer NOT NULL,
        provider_issue_id text,
        number integer,
        title text NOT NULL,
        url text NOT NULL,
        state text,
        comments integer,
        reactions integer,
        body_text text,
        labels_json text,
        updated_at text,
        created_at text,
        captured_at text NOT NULL
      );
      CREATE TABLE maintenance_scores (
        port_name text PRIMARY KEY NOT NULL,
        score integer,
        label text,
        reason_json text
      );
      CREATE TABLE port_versions (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        port_name text NOT NULL,
        version text NOT NULL,
        port_version integer,
        git_tree text,
        version_date text,
        registry_commit text,
        published_at text
      );
      CREATE TABLE port_dependencies (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        port_name text NOT NULL,
        dependency_name text NOT NULL,
        host integer
      );
      CREATE TABLE port_features (
        port_name text NOT NULL,
        feature_name text NOT NULL,
        description text
      );
      CREATE TABLE port_files (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        port_name text NOT NULL,
        file_type text NOT NULL,
        path text NOT NULL,
        content text,
        size_bytes integer,
        sha256 text,
        updated_at text NOT NULL
      );
      CREATE TABLE triplet_support (
        port_name text NOT NULL,
        triplet text NOT NULL,
        supported integer NOT NULL
      );
      CREATE VIRTUAL TABLE ports_title_fts USING fts5(
        port_name UNINDEXED,
        name,
        display_name,
        upstream_repo,
        name_canonical,
        display_name_canonical,
        upstream_repo_canonical,
        tokenize = 'trigram'
      );
      CREATE VIRTUAL TABLE ports_fts USING fts5(
        port_name UNINDEXED,
        description,
        readme_summary,
        usage_text,
        repository,
        dependencies,
        features,
        prefix = '2 3 4'
      );
    `);

    bootstrap.close();
    createClient(dbPath);
    const sqlite = getSqlite();

    insertPort(sqlite, {
      name: "polyhook2",
      displayName: "PolyHook_2_0",
      repo: "polyhook2",
      version: "2025-06-21",
      description: "C++17 x86/x64 Hooking Library v2.0",
      readmeSummary: "Hook engine for detours and trampolines.",
      score: 47,
      stars: 1856,
    });
    insertPort(sqlite, {
      name: "minhook",
      repo: "minhook",
      version: "1.3.4",
      description: "Minimalistic API Hooking Library for Windows.",
      readmeSummary: "Hooking library for Windows APIs.",
      score: 66,
      stars: 5743,
    });
    insertPort(sqlite, {
      name: "libmem",
      repo: "libmem",
      version: "5.1.5",
      description: "Advanced memory toolkit with Hooking and Detouring support.",
      readmeSummary: "Process memory toolkit.",
      score: 57,
      stars: 1187,
    });
    insertPort(sqlite, {
      name: "jemalloc",
      repo: "jemalloc",
      version: "5.3.1",
      description: "General purpose allocator.",
      readmeSummary: "Instrumentation hooks and profiling integrations.",
      score: 84,
      stars: 10877,
    });
    insertPort(sqlite, {
      name: "orange-math",
      repo: "omath",
      version: "5.2.0",
      description: "General purpose math library.",
      dependencies: "hook-runtime",
      score: 81,
      stars: 206,
    });
    insertPort(sqlite, {
      name: "ffmpeg",
      repo: "ffmpeg",
      version: "7.0",
      description: "Multimedia toolkit.",
      score: 90,
      stars: 10000,
    });
    insertPort(sqlite, {
      name: "tensorflow-cc",
      repo: "tensorflow",
      version: "2.16.0",
      description: "TensorFlow C++ API bindings.",
      score: 88,
      stars: 9000,
    });
  });

  afterEach(() => {
    closeClient();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("keeps relevance sort match-quality first", async () => {
    const result = await searchPorts({ text: "hook", sort: "relevance", page: 1, pageSize: 10 });
    const names = result.items.map((item) => item.name);

    expect(names.slice(0, 2)).toEqual(["minhook", "polyhook2"]);
    expect(names.indexOf("minhook")).toBeLessThan(names.indexOf("jemalloc"));
    expect(names.indexOf("polyhook2")).toBeLessThan(names.indexOf("libmem"));
  });

  it("uses explicit text-search sorts as the primary order", async () => {
    const result = await searchPorts({ text: "hook", sort: "score", page: 1, pageSize: 10 });
    const names = result.items.map((item) => item.name);

    expect(names.slice(0, 2)).toEqual(["jemalloc", "orange-math"]);
    expect(names.indexOf("jemalloc")).toBeLessThan(names.indexOf("minhook"));
    expect(names.indexOf("orange-math")).toBeLessThan(names.indexOf("polyhook2"));
  });

  it("supports ascending and descending sort direction", async () => {
    const ascending = await searchPorts({ sort: "score", sortDirection: "asc", page: 1, pageSize: 3 });
    const descending = await searchPorts({ sort: "score", sortDirection: "desc", page: 1, pageSize: 3 });

    expect(ascending.items[0]?.name).toBe("polyhook2");
    expect(descending.items[0]?.name).toBe("ffmpeg");
  });

  it("keeps name sort ascending by default", async () => {
    const result = await searchPorts({ sort: "name", page: 1, pageSize: 3 });

    expect(result.items.map((item) => item.name)).toEqual(["ffmpeg", "jemalloc", "libmem"]);
  });

  it("boosts description and summary hits ahead of metadata-only hits", async () => {
    const result = await searchPorts({ text: "hook", sort: "relevance", page: 1, pageSize: 10 });
    const names = result.items.map((item) => item.name);

    expect(names.indexOf("libmem")).toBeLessThan(names.indexOf("orange-math"));
    expect(names.indexOf("jemalloc")).toBeLessThan(names.indexOf("orange-math"));
  });

  it("supports prefix fuzzy matching for short typed fragments", async () => {
    const result = await searchPorts({ text: "ffm", page: 1, pageSize: 5 });
    expect(result.items.map((item) => item.name)).toContain("ffmpeg");
  });

  it("supports canonical title matching across separators", async () => {
    const result = await searchPorts({ text: "tensorflowcc", page: 1, pageSize: 5 });
    expect(result.items[0]?.name).toBe("tensorflow-cc");
  });

  it("filters ports with host dependencies", async () => {
    const sqlite = getSqlite();
    insertPort(sqlite, {
      name: "cmake-tooling",
      repo: "cmake-tooling",
      version: "1.0.0",
      description: "Build helper package.",
      hostDependencyCount: 2,
      packagingRiskScore: 25,
      packagingRiskLabel: "moderate",
    });

    const result = await searchPorts({
      filters: [{ field: "has", op: "eq", value: "host-deps" }],
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map((item) => item.name)).toContain("cmake-tooling");
    expect(result.items.find((item) => item.name === "cmake-tooling")?.hostDependencyCount).toBe(2);
  });

  it("sorts by visible packaging score", async () => {
    const sqlite = getSqlite();
    insertPort(sqlite, {
      name: "packsort-good",
      repo: "packsort-good",
      version: "1.0.0",
      description: "Packaging sort fixture.",
      packagingRiskScore: 5,
      packagingRiskLabel: "low",
    });
    insertPort(sqlite, {
      name: "packsort-risky",
      repo: "packsort-risky",
      version: "9.9.9",
      description: "Packaging sort fixture.",
      packagingRiskScore: 81,
      packagingRiskLabel: "very-high",
      churn90d: 8,
    });

    const descending = await searchPorts({ text: "packsort", sort: "packaging-risk", sortDirection: "desc", page: 1, pageSize: 5 });
    const ascending = await searchPorts({ text: "packsort", sort: "packaging-risk", sortDirection: "asc", page: 1, pageSize: 5 });

    expect(descending.items[0]?.name).toBe("packsort-good");
    expect(ascending.items[0]?.name).toBe("packsort-risky");
  });
});
