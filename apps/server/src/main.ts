import { createPrettyLogger } from "@pkg/shared/logging";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const logger = config.NODE_ENV === "development" ? createPrettyLogger("server") : null;

const app = await buildApp(config);

await app.listen({
  port: config.PORT,
  host: config.HOST,
});

if (logger) {
  logger.info("Server listening", {
    url: `http://${config.HOST}:${config.PORT}`,
  });
} else {
  console.log(`Server listening on http://${config.HOST}:${config.PORT}`);
}
