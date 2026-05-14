import { describe, expect, it, vi } from "vitest";
import { createJobRunnerProgram, normalizeJobRunnerArgv } from "./run-job.js";

function createHandlers() {
  return {
    cleanup: vi.fn().mockResolvedValue(undefined),
    maintenance: vi.fn().mockResolvedValue(undefined),
    refreshGitHubFull: vi.fn().mockResolvedValue(undefined),
    refreshGitHubHot: vi.fn().mockResolvedValue(undefined),
    syncVcpkg: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createJobRunnerProgram", () => {
  it("dispatches sync-vcpkg with canonical flags", async () => {
    const handlers = createHandlers();
    const program = createJobRunnerProgram(handlers);

    await program.parseAsync(["node", "job", "sync-vcpkg", "--force", "--clear-lock"]);

    expect(handlers.syncVcpkg).toHaveBeenCalledWith({
      clearLock: true,
      force: true,
    });
  });

  it("defaults maintenance scope to catalog", async () => {
    const handlers = createHandlers();
    const program = createJobRunnerProgram(handlers);

    await program.parseAsync(["node", "job", "maintenance"]);

    expect(handlers.maintenance).toHaveBeenCalledWith({
      clearLock: false,
      scope: "catalog",
    });
  });

  it("accepts pnpm's leading double-dash when dispatching commands", async () => {
    const handlers = createHandlers();
    const program = createJobRunnerProgram(handlers);

    await program.parseAsync(
      normalizeJobRunnerArgv(["node", "job", "--", "refresh-github-full", "--clear-lock"])
    );

    expect(handlers.refreshGitHubFull).toHaveBeenCalledWith({
      clearLock: true,
      refreshAll: false,
    });
  });

  it("rejects removed refresh aliases", async () => {
    const handlers = createHandlers();
    const program = createJobRunnerProgram(handlers);
    program.exitOverride();

    await expect(
      program.parseAsync(["node", "job", "refresh-github-full", "--all"])
    ).rejects.toThrow(/process\.exit unexpectedly called with "1"/);
  });
});
