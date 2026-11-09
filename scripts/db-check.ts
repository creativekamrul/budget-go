import "./load-env";
import { db } from "../lib/server/db";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const client = db();
  try {
    await client.$queryRaw`SELECT 1`;
    await Promise.all([client.user.count(), client.transaction.count(), client.budget.count(), client.apiToken.count(), client.loginRateLimit.count(), client.financialAccount.count(), client.transfer.count(), client.requestReceipt.count(), client.category.count(), client.tag.count(), client.merchant.count(), client.transactionTag.count(), client.workspacePreference.count(), client.automationSource.count(), client.automationEvent.count(), client.recurringSchedule.count(), client.recurringOccurrence.count(), client.transactionSplit.count(), client.monthlyPlan.count()]);
    await Promise.all([client.balanceAdjustment.count(),client.matchedTransfer.count(),client.financeRule.count(),client.statementImport.count(),client.ruleRun.count()]);
    console.log("Database connection and Budget Go schema are ready. No finance data was written.");
  } finally { await client.$disconnect(); }
}
main().catch(() => { console.error("Database check failed. Set DATABASE_URL, verify PostgreSQL is reachable and run npm run db:migrate. Connection details have not been printed."); process.exitCode = 1; });
