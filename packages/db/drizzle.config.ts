import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Self-load .env when drizzle-kit invokes this config directly (no parent process loads it)
const dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(dir, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && !Object.prototype.hasOwnProperty.call(process.env, k)) {
      process.env[k] = v;
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required for drizzle-kit");
}

export default defineConfig({
  out: "./src/migrations",
  schema: "./src/schema/*",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
