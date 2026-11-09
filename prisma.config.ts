import "./scripts/load-env";
import { defineConfig } from "prisma/config";

// Generation/validation do not require a live database. CLI deployment must supply DATABASE_URL.
if (process.argv.includes("deploy") && !process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set before deploying migrations.");
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL || "postgresql://unset:unset@127.0.0.1:5432/budget_go?schema=public" },
});
