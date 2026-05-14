import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: ReturnType<typeof Database> | null = null;

function hasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function applyCompatMigrations(sqlite: Database.Database) {
  if (!hasColumn(sqlite, "ports", "versions_path")) {
    sqlite.exec("ALTER TABLE ports ADD COLUMN versions_path text");
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS historical_port_snapshots (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      port_name text NOT NULL,
      version text NOT NULL,
      port_version integer DEFAULT 0 NOT NULL,
      git_tree text NOT NULL,
      manifest_json text NOT NULL,
      usage_text text,
      description text,
      homepage text,
      license text,
      supports text,
      dependencies_json text NOT NULL,
      features_json text NOT NULL,
      files_json text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      FOREIGN KEY (port_name) REFERENCES ports(name) ON UPDATE no action ON DELETE no action
    );
  `);
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS historical_port_snapshots_git_tree_unique ON historical_port_snapshots (git_tree)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_port_dependencies_port_name ON port_dependencies (port_name)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_port_dependencies_port_name_lower_dependency_name ON port_dependencies (port_name, lower(dependency_name))");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_port_features_port_name ON port_features (port_name)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_port_features_port_name_lower_feature_name ON port_features (port_name, lower(feature_name))");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_port_files_port_name ON port_files (port_name)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_port_versions_port_name_id ON port_versions (port_name, id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_triplet_support_triplet_supported_port_name ON triplet_support (triplet, supported, port_name)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_maintenance_scores_score_port_name ON maintenance_scores (score DESC, port_name)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_upstream_issues_upstream_id_comments ON upstream_issues (upstream_id, comments DESC)");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS port_patch_stats (
      port_name text PRIMARY KEY NOT NULL,
      patch_count integer NOT NULL,
      patch_bytes_total integer NOT NULL,
      declared_patch_count integer NOT NULL,
      burden_label text NOT NULL,
      patch_files_json text NOT NULL,
      unreferenced_patch_files_json text,
      missing_patch_files_json text,
      updated_at text NOT NULL,
      FOREIGN KEY (port_name) REFERENCES ports(name) ON UPDATE no action ON DELETE no action
    );
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS port_source_provenance (
      port_name text PRIMARY KEY NOT NULL,
      provider text NOT NULL,
      source_url text,
      normalized_repo_url text,
      ref text,
      ref_kind text,
      quality text NOT NULL,
      is_exact integer NOT NULL,
      confidence integer NOT NULL,
      detected_from text NOT NULL,
      reason text NOT NULL,
      reference_url text,
      updated_at text NOT NULL,
      FOREIGN KEY (port_name) REFERENCES ports(name) ON UPDATE no action ON DELETE no action
    );
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS port_registry_stats (
      port_name text PRIMARY KEY NOT NULL,
      current_version_published_at text,
      last_changed_at text,
      churn_30d integer NOT NULL,
      churn_90d integer NOT NULL,
      churn_365d integer NOT NULL,
      same_version_port_bumps integer,
      updated_at text NOT NULL,
      FOREIGN KEY (port_name) REFERENCES ports(name) ON UPDATE no action ON DELETE no action
    );
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS packaging_risk_scores (
      port_name text PRIMARY KEY NOT NULL,
      score integer NOT NULL,
      label text NOT NULL,
      reasons_json text NOT NULL,
      components_json text NOT NULL,
      updated_at text NOT NULL,
      FOREIGN KEY (port_name) REFERENCES ports(name) ON UPDATE no action ON DELETE no action
    );
  `);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_port_registry_stats_churn_90d_port_name ON port_registry_stats (churn_90d DESC, port_name)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_packaging_risk_scores_score_port_name ON packaging_risk_scores (score DESC, port_name)");
}

export function createClient(dbPath: string) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

  _sqlite = new Database(dbPath);

  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("busy_timeout = 5000");
  _sqlite.pragma("foreign_keys = ON");
  _sqlite.pragma("synchronous = NORMAL");
  applyCompatMigrations(_sqlite);

  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getClient() {
  if (!_db) throw new Error("Database not initialized. Call createClient first.");
  return _db;
}

export function getSqlite(): Database.Database {
  if (!_sqlite) throw new Error("Database not initialized. Call createClient first.");
  return _sqlite;
}

export function closeClient() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

export { schema };
