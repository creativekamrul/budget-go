import { readFile } from "node:fs/promises";
import path from "node:path";

export const documentDefinitions = [
  { id: "docker", title: "Docker install & upgrades", group: "Start here", description: "Use bundled or external PostgreSQL and upgrade versioned images." },
  { id: "quickstart", title: "Quickstart", group: "Start here", description: "From a bank alert to your first reviewed entry." },
  { id: "accounts", title: "Accounts & net worth", group: "Use your workspace", description: "Manual BDT asset/debt families and dated valuations." },
  { id: "transfers", title: "Transfer matching", group: "Use your workspace", description: "Pair corresponding entries, preserve dates and unmatch safely." },
  { id: "statements", title: "Statements & reconciliation", group: "Use your workspace", description: "Map CSV rows, review duplicates and compare closing balances." },
  { id: "rules", title: "Transaction rules", group: "Use your workspace", description: "Preview and deliberately apply classification rules with run history." },
  { id: "transactions", title: "Transaction tools", group: "Use your workspace", description: "Bulk edits, deliberate deletion and amount-preserving splits." },
  { id: "recurring", title: "Recurring bills & income", group: "Use your workspace", description: "Calendar schedules, upcoming dates and duplicate-safe recording." },
  { id: "budgets", title: "Budget planning", group: "Use your workspace", description: "Monthly income/spending targets, category allocations and safe copying." },
  { id: "automation", title: "Bangladesh automation", group: "Start here", description: "SMS, email, বাংলা digits and exact BDT amounts." },
  { id: "api", title: "API reference", group: "Build an integration", description: "Endpoints, payloads, scopes, revisions and errors." },
  { id: "n8n", title: "n8n workflow", group: "Build an integration", description: "Connect your collector with a downloadable starter." },
  { id: "mcp", title: "MCP & agents", group: "Build an integration", description: "Connect a client to the same financial service." },
  { id: "security", title: "Security & privacy", group: "Maintain your app", description: "Tokens, private messages and safe extraction." },
  { id: "backup", title: "Full backup & restore", group: "Maintain your app", description: "Download all supported domains, validate and deliberately restore." },
  { id: "operations", title: "Setup & operations", group: "Maintain your app", description: "Install, migrate, verify, back up and troubleshoot." },
  { id: "parity", title: "Feature coverage", group: "Maintain your app", description: "What is implemented and what Sure parity still needs." },
] as const;
export async function loadDocuments() {
  return Promise.all(documentDefinitions.map(async document => ({ ...document, markdown: await readFile(path.join(process.cwd(), "docs", "developer", `${document.id}.md`), "utf8") })));
}
