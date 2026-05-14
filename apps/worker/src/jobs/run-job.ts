import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
import { addClearLockOption } from "./job-cli.js";
import { runCleanupJob } from "./cleanup.job.js";
import { runMaintenanceJob, type MaintenanceScope } from "./maintenance.job.js";
import { runRefreshGitHubFullJob } from "./refresh-github-full.job.js";
import { runRefreshGitHubHotJob } from "./refresh-github-hot.job.js";
import { runSyncVcpkgJob } from "./sync-vcpkg.job.js";

type JobRunnerHandlers = {
  cleanup: typeof runCleanupJob;
  maintenance: typeof runMaintenanceJob;
  refreshGitHubFull: typeof runRefreshGitHubFullJob;
  refreshGitHubHot: typeof runRefreshGitHubHotJob;
  syncVcpkg: typeof runSyncVcpkgJob;
};

const DEFAULT_HANDLERS: JobRunnerHandlers = {
  cleanup: runCleanupJob,
  maintenance: runMaintenanceJob,
  refreshGitHubFull: runRefreshGitHubFullJob,
  refreshGitHubHot: runRefreshGitHubHotJob,
  syncVcpkg: runSyncVcpkgJob,
};

export function normalizeJobRunnerArgv(argv: string[]): string[] {
  return argv[2] === "--"
    ? [argv[0] ?? "node", argv[1] ?? "job", ...argv.slice(3)]
    : argv;
}

export function createJobRunnerProgram(handlers: JobRunnerHandlers = DEFAULT_HANDLERS) {
  const program = new Command()
    .name("pnpm job -- <command>")
    .description("Run worker jobs from a single entrypoint.")
    .showHelpAfterError()
    .allowExcessArguments(false);

  addClearLockOption(
    program.command("sync-vcpkg")
      .description("Sync ports and versions from the local vcpkg registry checkout into SQLite.")
      .option("--force", "Reparse the current registry checkout even when the commit has not changed")
      .action(async (options: { force?: boolean; clearLock?: boolean }) => {
        await handlers.syncVcpkg({
          force: Boolean(options.force),
          clearLock: Boolean(options.clearLock),
        });
      })
  );

  addClearLockOption(
    program.command("refresh-github-hot")
      .description("Refresh the hottest GitHub repos based on stars and recent staleness.")
      .action(async (options: { clearLock?: boolean }) => {
        await handlers.refreshGitHubHot({
          clearLock: Boolean(options.clearLock),
        });
      })
  );

  addClearLockOption(
    program.command("refresh-github-full")
      .description("Refresh GitHub metadata for stored upstream repositories.")
      .option("--refresh-all", "Refresh every stored GitHub repo, ignoring the 7-day freshness window")
      .action(async (options: { refreshAll?: boolean; clearLock?: boolean }) => {
        await handlers.refreshGitHubFull({
          refreshAll: Boolean(options.refreshAll),
          clearLock: Boolean(options.clearLock),
        });
      })
  );

  addClearLockOption(
    program.command("cleanup")
      .description("Clean up old job runs and cached HTTP responses, then optimize SQLite.")
      .action(async (options: { clearLock?: boolean }) => {
        await handlers.cleanup({
          clearLock: Boolean(options.clearLock),
        });
      })
  );

  addClearLockOption(
    program.command("maintenance")
      .description("Rerun derived maintenance pipelines for catalog or upstream data.")
      .addOption(
        new Option("--scope <scope>", "Maintenance scope")
          .choices(["catalog", "upstream"])
          .default("catalog")
      )
      .action(async (options: { scope?: MaintenanceScope; clearLock?: boolean }) => {
        await handlers.maintenance({
          scope: options.scope,
          clearLock: Boolean(options.clearLock),
        });
      })
  );

  return program;
}

const isDirectInvocation = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectInvocation) {
  await createJobRunnerProgram().parseAsync(normalizeJobRunnerArgv(process.argv));
}
