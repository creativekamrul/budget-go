import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FinanceReports } from "@/components/finance-reports";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports — Budget Go" };
export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <FinanceReports key={session.user.id} />;
}
