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
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_FILE: z.string().default(
    path.resolve(PROJECT_ROOT, "data", "catalog.sqlite")
  ),
  VCPKG_REPO_DIR: z.string().default(
    path.resolve(PROJECT_ROOT, "data", "vcpkg-repo")
  ),
  GITHUB_TOKEN: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const parsed = configSchema.parse(process.env);
  if (process.env.DATABASE_FILE && !path.isAbsolute(parsed.DATABASE_FILE)) {
    parsed.DATABASE_FILE = path.resolve(PROJECT_ROOT, parsed.DATABASE_FILE);
  }
  if (process.env.VCPKG_REPO_DIR && !path.isAbsolute(parsed.VCPKG_REPO_DIR)) {
    parsed.VCPKG_REPO_DIR = path.resolve(PROJECT_ROOT, parsed.VCPKG_REPO_DIR);
  }
  return parsed;
}
