import { defineConfig } from "drizzle-kit";

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
