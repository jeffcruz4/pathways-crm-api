import type { AppConfig } from "../config.js";
import type { Repository } from "./repository.js";
import { MemoryRepository } from "./memoryRepository.js";
import { PostgresRepository } from "./postgresRepository.js";
import { createDb } from "../db/client.js";

/**
 * Pick the data backend from config, behind the shared Repository interface.
 * "memory" serves seeded sample data (default); "postgres" connects to the
 * dedicated RDS instance via DATABASE_URL (Drizzle).
 */
export function createRepository(config: AppConfig): Repository {
  switch (config.dataBackend) {
    case "memory":
      return new MemoryRepository();
    case "postgres": {
      if (!config.databaseUrl) {
        throw new Error("DATA_BACKEND=postgres requires DATABASE_URL");
      }
      const { db } = createDb(config.databaseUrl);
      return new PostgresRepository(db);
    }
    default:
      throw new Error(`Unknown DATA_BACKEND: ${config.dataBackend}`);
  }
}

export type { Repository } from "./repository.js";
