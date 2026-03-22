import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

let client: Sql | undefined;
let database: PostgresJsDatabase | undefined;

function getClient(): Sql {
  if (!client) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set");
    }
    client = postgres(databaseUrl);
  }
  return client;
}

export function getDb(): PostgresJsDatabase {
  if (!database) {
    database = drizzle(getClient());
  }
  return database;
}

/** Expose raw client for cleanup (e.g. test teardown). */
export function getClient_UNSAFE(): Sql {
  return getClient();
}
