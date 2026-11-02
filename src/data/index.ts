import type { AppConfig } from "../config.js";
import type { Repository } from "./repository.js";
import { MemoryRepository } from "./memoryRepository.js";
import { PostgresRepository } from "./postgresRepository.js";
import { createDbFromEnv } from "../db/client.js";

/**
 * Pick the data backend from config, behind the shared Repository interface.
 * "memory" serves seeded sample data (default); "postgres" connects to the
 * dedicated RDS instance via Drizzle. The connection is resolved by
 * createDbFromEnv(), which prefers discrete DB_* parts (so an RDS-managed
 * password with URL-significant characters needs no encoding) and falls back to
 * DATABASE_URL. Config validation guarantees one of those is present.
 */
export function createRepository(config: AppConfig): Repository {
  switch (config.dataBackend) {
    case "memory":
      return new MemoryRepository();
    case "postgres": {
      const { db } = createDbFromEnv();
      return new PostgresRepository(db);
    }
    default:
      throw new Error(`Unknown DATA_BACKEND: ${config.dataBackend}`);
  }
}

export type { Repository } from "./repository.js";
