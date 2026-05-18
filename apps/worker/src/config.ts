import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const configSchema = z.object({
  DATABASE_FILE: z.string().default(
    path.resolve(PROJECT_ROOT, "data", "catalog.sqlite")
  ),
  GITHUB_GRAPHQL_ARCHIVE_DIR: z.string().default(
    path.resolve(PROJECT_ROOT, "data", "github-graphql-archive")
  ),
  VCPKG_REPO_DIR: z.string().default(
    path.resolve(PROJECT_ROOT, "data", "vcpkg-repo")
  ),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_README_SOURCE_MODE: z.enum(["snapshot", "latest"]).default("snapshot"),
  GITHUB_REFRESH_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(3),
  GITHUB_REFRESH_REPOS_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(40),
  GITHUB_FULL_REFRESH_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  VCPKG_REPO_URL: z.string().default("https://github.com/microsoft/vcpkg"),
  VCPKG_BRANCH: z.string().default("master"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type WorkerConfig = z.infer<typeof configSchema>;

export function loadConfig(): WorkerConfig {
  const parsed = configSchema.parse(process.env);
  if (process.env.DATABASE_FILE && !path.isAbsolute(parsed.DATABASE_FILE)) {
    parsed.DATABASE_FILE = path.resolve(PROJECT_ROOT, parsed.DATABASE_FILE);
  }
  if (process.env.VCPKG_REPO_DIR && !path.isAbsolute(parsed.VCPKG_REPO_DIR)) {
    parsed.VCPKG_REPO_DIR = path.resolve(PROJECT_ROOT, parsed.VCPKG_REPO_DIR);
  }
  if (process.env.GITHUB_GRAPHQL_ARCHIVE_DIR && !path.isAbsolute(parsed.GITHUB_GRAPHQL_ARCHIVE_DIR)) {
    parsed.GITHUB_GRAPHQL_ARCHIVE_DIR = path.resolve(PROJECT_ROOT, parsed.GITHUB_GRAPHQL_ARCHIVE_DIR);
  }
  return parsed;
}
