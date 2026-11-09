import type { Metadata } from "next";
import { FinanceConcept } from "@/components/finance-concept";

export const metadata: Metadata = {
  title: "Budget Go — Finance workspace concept",
  description: "A fictional-data preview of the new Budget Go personal-finance workspace.",
};

export default function ConceptPage() {
  return <FinanceConcept />;
}
