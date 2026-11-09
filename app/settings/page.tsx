import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FinanceSettings } from "@/components/finance-settings";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
 const session = await auth(); if (!session?.user?.id) redirect("/login");
 return <FinanceSettings key={session.user.id} email={session.user.email ?? ""}/>;
}
