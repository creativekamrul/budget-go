import specification from "@/docs/API.openapi.json";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return Response.json(specification, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(new URL(request.url).searchParams.get("download") === "1" ? { "Content-Disposition": "attachment; filename=budget-go.openapi.json" } : {}) } });
}
