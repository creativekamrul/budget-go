import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance-workspace";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{view?: string; account?: string}> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const query = await searchParams;
  const view = query.view === "transactions" ? "Transactions" : query.view === "accounts" ? "Accounts" : query.view === "budgets" ? "Budgets" : "Overview";
  return <FinanceWorkspace key={`${session.user.id}-${view}-${query.account ?? "all"}`} initialView={view} initialAccount={query.account ?? "all"} />;
}
