import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const app = await buildApp(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`pathways-crm-api listening on ${config.host}:${config.port} (backend=${config.dataBackend})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      app.log.info(`received ${signal}, shutting down`);
      await app.close();
      process.exit(0);
    });
  }
}

void main();
