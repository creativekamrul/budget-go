-- Additive only: existing entries remain unassigned; no finance rows are rewritten or seeded.
BEGIN;
CREATE TABLE "FinancialAccount" (
  "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'BDT',
  "openingDate" TEXT NOT NULL, "openingPoisha" BIGINT NOT NULL,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("userId", "id"),
  CONSTRAINT "FinancialAccount_kind_valid" CHECK ("kind" IN ('bank','cash','mobile')),
  CONSTRAINT "FinancialAccount_currency_valid" CHECK ("currency" = 'BDT'),
  CONSTRAINT "FinancialAccount_name_valid" CHECK (length("name") BETWEEN 1 AND 80 AND "name" = btrim("name")),
  CONSTRAINT "FinancialAccount_opening_safe" CHECK ("openingPoisha" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "FinancialAccount_id_valid" CHECK ("id" ~ '^[A-Za-z0-9_-]{1,80}$')
);
ALTER TABLE "Transaction" ADD COLUMN "accountId" TEXT;
CREATE INDEX "Transaction_userId_accountId_idx" ON "Transaction"("userId", "accountId");
CREATE TABLE "Transfer" (
  "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "fromAccountId" TEXT NOT NULL,
  "toAccountId" TEXT NOT NULL, "description" TEXT NOT NULL, "date" TEXT NOT NULL,
  "poisha" BIGINT NOT NULL,
  CONSTRAINT "Transfer_pkey" PRIMARY KEY ("userId", "id"),
  CONSTRAINT "Transfer_id_valid" CHECK ("id" ~ '^[A-Za-z0-9_-]{1,80}$'),
  CONSTRAINT "Transfer_poisha_safe" CHECK ("poisha" BETWEEN 1 AND 9007199254740991),
  CONSTRAINT "Transfer_accounts_distinct" CHECK ("fromAccountId" <> "toAccountId"),
  CONSTRAINT "Transfer_description_valid" CHECK (length("description") BETWEEN 1 AND 120 AND "description" = btrim("description"))
);
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");
CREATE INDEX "Transfer_userId_fromAccountId_idx" ON "Transfer"("userId", "fromAccountId");
CREATE INDEX "Transfer_userId_toAccountId_idx" ON "Transfer"("userId", "toAccountId");
CREATE TABLE "RequestReceipt" (
  "userId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestReceipt_pkey" PRIMARY KEY ("userId", "requestId"),
  CONSTRAINT "RequestReceipt_id_valid" CHECK ("requestId" ~ '^[A-Za-z0-9_-]{1,80}$'),
  CONSTRAINT "RequestReceipt_hash_valid" CHECK ("hash" ~ '^[a-f0-9]{64}$')
);
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_accountId_fkey" FOREIGN KEY ("userId", "accountId") REFERENCES "FinancialAccount"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fromAccountId_fkey" FOREIGN KEY ("userId", "fromAccountId") REFERENCES "FinancialAccount"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_toAccountId_fkey" FOREIGN KEY ("userId", "toAccountId") REFERENCES "FinancialAccount"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "RequestReceipt" ADD CONSTRAINT "RequestReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
