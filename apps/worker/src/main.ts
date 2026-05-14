import { createClient } from "@pkg/db";
import { installPrettyConsole } from "@pkg/shared/logging";
import { loadConfig } from "./config.js";
import { startScheduler } from "./scheduler.js";

const config = loadConfig();

installPrettyConsole({
  name: "worker",
  enabled: config.NODE_ENV === "development",
});

createClient(config.DATABASE_FILE);
console.log("Worker process started");

const scheduler = startScheduler(config);

process.on("SIGTERM", async () => {
  console.log("Shutting down worker...");
  await scheduler.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down worker...");
  await scheduler.stop();
  process.exit(0);
});
