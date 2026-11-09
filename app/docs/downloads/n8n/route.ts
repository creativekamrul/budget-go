import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return new Response(await readFile(path.join(process.cwd(), "integrations", "n8n", "budget-go-alert-inbox.json"), "utf8"), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=budget-go-alert-inbox.json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
