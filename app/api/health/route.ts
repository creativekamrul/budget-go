import {readdir} from "node:fs/promises";
import path from "node:path";
import {version} from "@/package.json";
import {db} from "@/lib/server/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Intentionally public and independent of browser Host/Origin: container probes
// use an internal address. Return readiness only, never configuration or records.
export async function GET(){
  try{
    const expected=(await readdir(path.join(process.cwd(),"prisma","migrations"),{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name);
    const applied=await db().$queryRaw<{migration_name:string}[]>`SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`;
    const names=new Set(applied.map(entry=>entry.migration_name));
    if(!expected.length||expected.some(name=>!names.has(name)))throw new Error("Migrations are incomplete.");
    await db().$queryRaw`SELECT "id" FROM "RuleRun" LIMIT 0`;
    return Response.json({status:"ok",version},{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch{
    return Response.json({status:"unavailable",version},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
}
