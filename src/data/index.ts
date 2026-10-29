import type { AppConfig } from "../config.js";
import type { Repository } from "./repository.js";
import { MemoryRepository } from "./memoryRepository.js";

/**
 * Pick the data backend from config. Postgres (Drizzle) is intentionally a
 * future swap behind the same Repository interface — see db/ and TD. For now we
 * only build the memory backend; selecting "postgres" without the impl fails
 * loud rather than silently serving stubs.
 */
export function createRepository(config: AppConfig): Repository {
  switch (config.dataBackend) {
    case "memory":
      return new MemoryRepository();
    case "postgres":
      throw new Error(
        "DATA_BACKEND=postgres is not implemented yet. Run with DATA_BACKEND=memory until the Drizzle Postgres repository is wired.",
      );
    default:
      throw new Error(`Unknown DATA_BACKEND: ${config.dataBackend}`);
  }
}

export type { Repository } from "./repository.js";
