import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FinanceInbox } from "@/components/finance-inbox";

export const dynamic = "force-dynamic";
export default async function InboxPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <FinanceInbox key={session.user.id}/>;
}
