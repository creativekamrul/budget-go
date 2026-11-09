import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FinanceRecurring } from "@/components/finance-recurring";
export const dynamic = "force-dynamic";
export default async function RecurringPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <FinanceRecurring key={session.user.id}/>;
}
