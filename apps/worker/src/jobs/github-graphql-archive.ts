import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { RepoRefreshSnapshot } from "@pkg/github";

export type GitHubGraphqlArchiveRecord = {
  schemaVersion: 1;
  jobName: string;
  runId: number;
  batchNumber: number;
  snapshotAsOf: string;
  capturedAt: string;
  upstreamId: number;
  portName: string;
  owner: string;
  repo: string;
  status: "success" | "processing-failed";
  error?: string;
  graphqlRateLimit: RepoRefreshSnapshot["graphqlRateLimit"];
  rawGraphqlResponse: RepoRefreshSnapshot["rawGraphqlResponse"];
};

function sanitizeTimestamp(value: string): string {
  return value.replace(/[:]/g, "-");
}

export function buildGitHubGraphqlArchivePath(args: {
  archiveDir: string;
  jobName: string;
  runId: number;
  startedAt: string;
}): string {
  const fileName = `${args.jobName}-${args.runId}-${sanitizeTimestamp(args.startedAt)}.jsonl.gz`;
  return path.join(args.archiveDir, fileName);
}

export async function appendGitHubGraphqlArchiveBatch(args: {
  archivePath: string;
  records: GitHubGraphqlArchiveRecord[];
}): Promise<{ count: number; archivePath: string; gzipBytes: number } | null> {
  if (args.records.length === 0) return null;

  await fs.mkdir(path.dirname(args.archivePath), { recursive: true });

  const payload = `${args.records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const compressed = gzipSync(Buffer.from(payload, "utf8"), { level: 9 });

  await fs.appendFile(args.archivePath, compressed);

  return {
    count: args.records.length,
    archivePath: args.archivePath,
    gzipBytes: compressed.length,
  };
}