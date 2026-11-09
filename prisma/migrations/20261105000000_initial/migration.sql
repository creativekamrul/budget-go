-- Generated schema-only from Prisma 7.10.1; explicit integrity checks added below.
-- No sample accounts or finance data. Deploy only after configuring the intended PostgreSQL database.
BEGIN;
CREATE SCHEMA IF NOT EXISTS "public";
CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "sessionVersion" INTEGER NOT NULL DEFAULT 1, "revision" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_revision_safe" CHECK ("revision" BETWEEN 0 AND 9007199254740991),
  CONSTRAINT "User_sessionVersion_positive" CHECK ("sessionVersion" > 0)
);
CREATE TABLE "Transaction" (
  "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "description" TEXT NOT NULL,
  "category" TEXT NOT NULL, "date" TEXT NOT NULL, "type" TEXT NOT NULL, "poisha" BIGINT NOT NULL,
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("userId", "id"),
  CONSTRAINT "Transaction_poisha_safe" CHECK ("poisha" BETWEEN 1 AND 9007199254740991),
  CONSTRAINT "Transaction_id_valid" CHECK ("id" ~ '^[A-Za-z0-9_-]{1,80}$'),
  CONSTRAINT "Transaction_description_valid" CHECK (length("description") BETWEEN 1 AND 120 AND "description" = btrim("description")),
  CONSTRAINT "Transaction_category_valid" CHECK (("type" = 'income' AND "category" IN ('Salary','Freelance','Other income')) OR ("type" = 'expense' AND "category" IN ('Groceries','Dining','Transport','Home','Shopping')))
);
CREATE TABLE "Budget" (
  "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "month" TEXT NOT NULL,
  "category" TEXT NOT NULL, "limitPoisha" BIGINT NOT NULL,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("userId", "id"),
  CONSTRAINT "Budget_limit_safe" CHECK ("limitPoisha" BETWEEN 1 AND 9007199254740991),
  CONSTRAINT "Budget_id_valid" CHECK ("id" ~ '^[A-Za-z0-9_-]{1,80}$'),
  CONSTRAINT "Budget_category_valid" CHECK ("category" IN ('Groceries','Dining','Transport','Home','Shopping'))
);
CREATE TABLE "ApiToken" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL, "scopes" TEXT[], "sessionVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiToken_hash_valid" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ApiToken_scopes_valid" CHECK ("scopes" IS NOT NULL AND "scopes" <@ ARRAY['finance:read','finance:write']::TEXT[] AND 'finance:read' = ANY("scopes")),
  CONSTRAINT "ApiToken_sessionVersion_positive" CHECK ("sessionVersion" > 0)
);
CREATE TABLE "LoginRateLimit" (
  "key" TEXT NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL, "attempts" INTEGER NOT NULL,
  CONSTRAINT "LoginRateLimit_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "LoginRateLimit_attempts_positive" CHECK ("attempts" > 0)
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE UNIQUE INDEX "Budget_userId_month_category_key" ON "Budget"("userId", "month", "category");
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_userId_createdAt_idx" ON "ApiToken"("userId", "createdAt");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
