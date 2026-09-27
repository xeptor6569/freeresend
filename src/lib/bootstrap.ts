import { readFile } from "node:fs/promises";
import path from "node:path";
import { query, transaction } from "./database";
import { ensureAdminUser } from "./auth";

const SCHEMA_LOCK_ID = 7253001;

function checkEnvironment() {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!process.env.DATABASE_URL && !process.env.PGHOST) missing.push("DATABASE_URL");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
    if (!process.env[name]) {
      console.warn(`${name} is not set. Domain verification and sending will fail.`);
    }
  }
}

async function waitForDatabase(attempts = 30, delayMs = 2000) {
  for (let attempt = 1; ; attempt++) {
    try {
      await query("SELECT 1");
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.log(`Waiting for database (${attempt}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function applySchema() {
  const schema = await readFile(path.join(process.cwd(), "database.sql"), "utf8");
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [SCHEMA_LOCK_ID]);
    await client.query(schema);
  });
}

export async function bootstrap() {
  checkEnvironment();
  await waitForDatabase();
  await applySchema();
  console.log("Database schema is up to date");
  await ensureAdminUser();
}
