import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DeveloperDocs } from "@/components/developer-docs";
import { loadDocuments } from "./content";
export const dynamic = "force-dynamic";
export default async function DocsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <DeveloperDocs documents={await loadDocuments()} current="quickstart" />;
}
