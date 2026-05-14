import Bree from "bree";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkerConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isSourceRuntime = __dirname.endsWith(`${path.sep}src`);
const jobsRoot = path.resolve(__dirname, "jobs");
const jobExtension = isSourceRuntime ? "ts" : "js";

function jobPath(name: string) {
  return path.join(jobsRoot, `${name}.job.${jobExtension}`);
}

export function getScheduledJobs() {
  return [
    { name: "sync-vcpkg", path: jobPath("sync-vcpkg"), interval: "24h" },
    { name: "refresh-github-hot", path: jobPath("refresh-github-hot"), interval: "6h" },
    { name: "refresh-github-full", path: jobPath("refresh-github-full"), interval: "24h" },
    { name: "cleanup", path: jobPath("cleanup"), interval: "7d" },
  ] as const;
}

export function startScheduler(config: WorkerConfig) {
  const bree = new Bree({
    root: jobsRoot,
    defaultExtension: isSourceRuntime ? "ts" : "js",
    acceptedExtensions: isSourceRuntime ? [".ts", ".js", ".mjs"] : [".js", ".mjs"],
    jobs: [...getScheduledJobs()],
    worker: {
      execArgv: isSourceRuntime ? process.execArgv : undefined,
      workerData: {
        DATABASE_FILE: config.DATABASE_FILE,
        VCPKG_REPO_DIR: config.VCPKG_REPO_DIR,
        GITHUB_TOKEN: config.GITHUB_TOKEN,
        VCPKG_REPO_URL: config.VCPKG_REPO_URL,
        VCPKG_BRANCH: config.VCPKG_BRANCH,
      },
    },
  });

  bree.start();
  return bree;
}
