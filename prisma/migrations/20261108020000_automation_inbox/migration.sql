-- Add isolated configuration and staging. Existing financial tables/rows are untouched.
CREATE TABLE "WorkspacePreference" (
 "userId" TEXT PRIMARY KEY,
 "data" JSONB NOT NULL,
 CONSTRAINT "WorkspacePreference_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AutomationSource" (
 "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "name" TEXT NOT NULL, "channel" TEXT NOT NULL, "providerLabel" TEXT NOT NULL,
 "accountId" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT true,
 CONSTRAINT "AutomationSource_pkey" PRIMARY KEY ("userId","id"),
 CONSTRAINT "AutomationSource_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AutomationSource_account_fkey" FOREIGN KEY ("userId","accountId") REFERENCES "FinancialAccount"("userId","id") ON DELETE NO ACTION ON UPDATE CASCADE,
 CONSTRAINT "AutomationSource_channel_check" CHECK ("channel" IN ('sms','email','manual')),
 CONSTRAINT "AutomationSource_name_check" CHECK (length("name") BETWEEN 1 AND 80 AND "name" = btrim("name")),
 CONSTRAINT "AutomationSource_provider_check" CHECK (length("providerLabel") <= 80)
);
CREATE UNIQUE INDEX "AutomationSource_owner_name_ci" ON "AutomationSource" ("userId",lower("name"));
CREATE TABLE "AutomationEvent" (
 "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "externalId" TEXT NOT NULL,
 "payloadHash" TEXT NOT NULL, "messageHash" TEXT, "reference" TEXT NOT NULL DEFAULT '',
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "status" TEXT NOT NULL, "draft" JSONB NOT NULL, "issues" TEXT[] NOT NULL,
 "duplicateOfEventId" TEXT, "transactionId" TEXT, "rawText" TEXT,
 CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("userId","id"),
 CONSTRAINT "AutomationEvent_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AutomationEvent_source_fkey" FOREIGN KEY ("userId","sourceId") REFERENCES "AutomationSource"("userId","id") ON DELETE NO ACTION ON UPDATE CASCADE,
 CONSTRAINT "AutomationEvent_status_check" CHECK ("status" IN ('needs_review','ready','accepted','ignored')),
 CONSTRAINT "AutomationEvent_external_check" CHECK (length("externalId") BETWEEN 1 AND 200),
 CONSTRAINT "AutomationEvent_reference_check" CHECK (length("reference") <= 120),
 CONSTRAINT "AutomationEvent_raw_check" CHECK ("rawText" IS NULL OR length("rawText") <= 16000)
);
CREATE UNIQUE INDEX "AutomationEvent_userId_sourceId_externalId_key" ON "AutomationEvent"("userId","sourceId","externalId");
CREATE UNIQUE INDEX "AutomationEvent_userId_transactionId_key" ON "AutomationEvent"("userId","transactionId");
CREATE INDEX "AutomationEvent_userId_receivedAt_idx" ON "AutomationEvent"("userId","receivedAt");
-- transactionId is historical provenance, intentionally retained if a posted entry is later deleted.
