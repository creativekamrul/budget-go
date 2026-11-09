import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { FinanceSettings } from "@/components/finance-settings";
export const dynamic = "force-dynamic";
export default async function SettingsSection({params}:{params:Promise<{section:string}>}) {
 const session = await auth(); if (!session?.user?.id) redirect("/login");
 const {section} = await params;
 if(section !== "profile" && section !== "security" && section !== "backups" && section !== "categories" && section !== "tags" && section !== "merchants" && section !== "integrations" && section !== "preferences" && section !== "sources") notFound();
 return <FinanceSettings key={`${session.user.id}-${section}`} section={section} email={session.user.email ?? ""}/>;
}
