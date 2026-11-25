import fs from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

if (fs.existsSync(".env")) {
  process.loadEnvFile?.(".env");
}

let globalClient: Client | null = null;
let foreignKeysInitPromise: Promise<unknown> | null = null;

/**
 * Enables SQLite foreign key enforcement for local `file:` databases so
 * `ON DELETE CASCADE` triggers consistently outside Turso Cloud.
 */
export function ensureLocalForeignKeys(
  client: Client,
  url: string,
): Promise<unknown> | null {
  if (!url.startsWith("file:")) {
    return null;
  }

  return client.execute("PRAGMA foreign_keys = ON;").catch((err) => {
    console.error("Failed to enable SQLite foreign_keys PRAGMA:", err);
  });
}

export function getLibsqlClient(): Client {
  if (!globalClient) {
    const url = process.env.TURSO_DATABASE_URL || "file:local.db";
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

    globalClient = createClient({
      url,
      authToken,
    });
    foreignKeysInitPromise = ensureLocalForeignKeys(globalClient, url);
  }

  return globalClient;
}

export async function waitForDbInit(): Promise<void> {
  getLibsqlClient();
  if (foreignKeysInitPromise) {
    await foreignKeysInitPromise;
  }
}

export function createDb(client: Client = getLibsqlClient()) {
  return drizzle(client, { schema });
}

export const db = createDb();
export { schema };
