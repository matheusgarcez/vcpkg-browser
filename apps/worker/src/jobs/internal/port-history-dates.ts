import { getClient } from "@pkg/db";
import { ports } from "@pkg/db";
import simpleGit from "simple-git";
import { eq } from "drizzle-orm";
import { loadConfig } from "../../config.js";

const config = loadConfig();

function parseGitLogOutput(raw: string): {
  latestByPort: Map<string, string>;
  earliestByPort: Map<string, string>;
} {
  const latestByPort = new Map<string, string>();
  const earliestByPort = new Map<string, string>();

  let currentDate = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("COMMIT ")) {
      currentDate = trimmed.slice(7).trim();
      continue;
    }

    if (trimmed.startsWith("ports/")) {
      const parts = trimmed.split("/");
      if (parts.length < 2) continue;

      const portName = parts[1];
      if (!portName || !currentDate) continue;

      if (!latestByPort.has(portName)) {
        latestByPort.set(portName, currentDate);
      }
      earliestByPort.set(portName, currentDate);
    }
  }

  return { latestByPort, earliestByPort };
}

export async function computePortHistoryDatesStep(args: {
  commitSha: string;
  portNames: string[];
}) {
  const { commitSha, portNames } = args;
  if (!commitSha) {
    throw new Error("A registry commit SHA is required to compute port history dates.");
  }
  if (portNames.length === 0) {
    console.log("No ports found while computing port history dates.");
    return;
  }

  const git = simpleGit(config.VCPKG_REPO_DIR);
  console.log(`Computing port history dates at ${commitSha}...`);
  const logOutput = await git.raw([
    "log",
    commitSha,
    "--format=COMMIT %cI",
    "--name-only",
    "--",
    "ports/",
  ]);
  const { latestByPort, earliestByPort } = parseGitLogOutput(logOutput);
  const db = getClient();

  for (const portName of portNames) {
    await db.update(ports)
      .set({
        createdInRegistryAt: earliestByPort.get(portName) ?? null,
        updatedInRegistryAt: latestByPort.get(portName) ?? null,
      })
      .where(eq(ports.name, portName));
  }

  console.log(`Port history dates computed for ${portNames.length} ports.`);
}
