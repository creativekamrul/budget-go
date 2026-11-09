import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FinanceWorkbench } from "@/components/finance-workbench";
export const dynamic="force-dynamic";
export default async function RulesPage(){const session=await auth();if(!session?.user?.id)redirect('/login');return <FinanceWorkbench key={session.user.id} view="rules"/>;}
