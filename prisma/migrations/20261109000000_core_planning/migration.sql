-- Add planning and provenance only. Existing financial records remain unchanged.
CREATE TABLE "RecurringSchedule" (
 "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "name" TEXT NOT NULL, "accountId" TEXT NOT NULL,
 "transaction" JSONB NOT NULL, "startDate" TEXT NOT NULL, "frequency" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "archived" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "RecurringSchedule_pkey" PRIMARY KEY ("userId","id"),
 CONSTRAINT "RecurringSchedule_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "RecurringSchedule_account_fkey" FOREIGN KEY ("userId","accountId") REFERENCES "FinancialAccount"("userId","id") ON DELETE NO ACTION ON UPDATE CASCADE,
 CONSTRAINT "RecurringSchedule_name_check" CHECK (length("name") BETWEEN 1 AND 80 AND "name" = btrim("name")),
 CONSTRAINT "RecurringSchedule_frequency_check" CHECK ("frequency" IN ('weekly','monthly','yearly')),
 CONSTRAINT "RecurringSchedule_start_check" CHECK ("startDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 CONSTRAINT "RecurringSchedule_transaction_check" CHECK (jsonb_typeof("transaction") = 'object')
);
CREATE TABLE "RecurringOccurrence" (
 "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "scheduleId" TEXT NOT NULL, "date" TEXT NOT NULL, "transactionId" TEXT NOT NULL,
 CONSTRAINT "RecurringOccurrence_pkey" PRIMARY KEY ("userId","id"),
 CONSTRAINT "RecurringOccurrence_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "RecurringOccurrence_schedule_fkey" FOREIGN KEY ("userId","scheduleId") REFERENCES "RecurringSchedule"("userId","id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecurringOccurrence_userId_scheduleId_date_key" ON "RecurringOccurrence"("userId","scheduleId","date");
CREATE UNIQUE INDEX "RecurringOccurrence_userId_transactionId_key" ON "RecurringOccurrence"("userId","transactionId");
CREATE TABLE "TransactionSplit" (
 "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "originalTransactionId" TEXT NOT NULL,
 "original" JSONB NOT NULL, "partIds" TEXT[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("userId","id"),
 CONSTRAINT "TransactionSplit_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "TransactionSplit_parts_check" CHECK (cardinality("partIds") BETWEEN 2 AND 20),
 CONSTRAINT "TransactionSplit_original_check" CHECK (jsonb_typeof("original") = 'object')
);
CREATE UNIQUE INDEX "TransactionSplit_userId_originalTransactionId_key" ON "TransactionSplit"("userId","originalTransactionId");
CREATE TABLE "MonthlyPlan" (
 "userId" TEXT NOT NULL, "month" TEXT NOT NULL, "incomePoisha" BIGINT NOT NULL, "spendingPoisha" BIGINT NOT NULL,
 CONSTRAINT "MonthlyPlan_pkey" PRIMARY KEY ("userId","month"),
 CONSTRAINT "MonthlyPlan_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "MonthlyPlan_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 CONSTRAINT "MonthlyPlan_money_check" CHECK ("incomePoisha" BETWEEN 0 AND 9007199254740991 AND "spendingPoisha" BETWEEN 0 AND 9007199254740991)
);
-- Transaction IDs in split/occurrence history deliberately survive later financial-entry deletion.
