import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ApiError } from "./errors";

const globalDb = globalThis as unknown as { budgetDb?: PrismaClient };
export function db(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new ApiError(503, "DATABASE_NOT_CONFIGURED", "Database is not configured. Ask the administrator to set DATABASE_URL and apply the migration.");
  if (!globalDb.budgetDb) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000, max: 10 });
    globalDb.budgetDb = new PrismaClient({ adapter, log: [] });
  }
  return globalDb.budgetDb;
}
