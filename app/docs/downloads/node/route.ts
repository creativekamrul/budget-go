import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return new Response(await readFile(path.join(process.cwd(), "integrations", "n8n", "ingest-event.mjs"), "utf8"), { headers: { "Content-Type": "text/javascript; charset=utf-8", "Content-Disposition": "attachment; filename=budget-go-ingest-event.mjs", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
