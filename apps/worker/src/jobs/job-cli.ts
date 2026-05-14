import { installPrettyConsole } from "@pkg/shared/logging";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { clearLock as clearJobLock, withJobLock } from "./helpers.js";

installPrettyConsole({
  name: "worker",
  enabled: process.env.NODE_ENV === "development",
});

export type ClearLockOptions = {
  clearLock?: boolean;
};

export function isJobInvocation(metaUrl: string, jobName: string): boolean {
  if (process.env.JOB_NAME === jobName) {
    return true;
  }

  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }

  return path.resolve(entryArg) === fileURLToPath(metaUrl);
}

export function addClearLockOption<TCommand extends Command>(program: TCommand): TCommand {
  return program.option("--clear-lock", "Clear any existing job lock before starting");
}

export async function runJobWithLock<T>(args: {
  jobName: string;
  lockTtlMs: number;
  clearLock?: boolean;
  run: () => Promise<T>;
}): Promise<T | undefined> {
  if (args.clearLock) {
    console.warn(`Clear-lock flag detected. Clearing any existing ${args.jobName} lock before starting.`);
    await clearJobLock(args.jobName);
  }

  return withJobLock(args.jobName, args.lockTtlMs, args.run);
}
