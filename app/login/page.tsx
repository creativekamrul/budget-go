import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import styles from "@/app/workspace.module.css";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  return <main className={`auth-page ${styles.utilityPage}`}><section className="auth-panel" aria-labelledby="login-heading"><Link href="/" className="brand"><span className="brand-icon"><BarChart3 size={21} aria-hidden="true" /></span>Budget Go</Link><div className="auth-heading"><p className="eyebrow">Your money, together.</p><h1 id="login-heading">Your financial<br />workspace.</h1><p className="auth-description">Sign in to your private accounts, transactions and monthly plan.</p></div><LoginForm /></section></main>;
}
