import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { DeveloperDocs } from "@/components/developer-docs";
import { documentDefinitions, loadDocuments } from "../content";
export const dynamic = "force-dynamic";
export default async function DocPage({ params }: { params: Promise<{ section: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { section } = await params;
  if (!documentDefinitions.some(document => document.id === section)) notFound();
  return <DeveloperDocs documents={await loadDocuments()} current={section} />;
}
