"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { Button } from "./ui/button";
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return <form action={action} className="auth-form" aria-busy={pending}><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} disabled={pending} /></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={pending} /></div>{state.error && <p className="save-error" role="alert">{state.error}</p>}<Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button><p className="auth-description">Accounts are provisioned by your server administrator. Contact them to create an account or reset your password.</p></form>;
}
