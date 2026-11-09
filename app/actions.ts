"use server";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export async function loginAction(_previous: { error: string }, form: FormData): Promise<{ error: string }> {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return { error: "Enter your email and password." };
  try { await signIn("credentials", { email: email.trim(), password, redirectTo: "/" }); }
  catch (error) {
    if (error instanceof AuthError) return { error: "Sign-in failed. Check your credentials or try again when the server is available." };
    throw error;
  }
  return { error: "" };
}
export async function signOutAction() { await signOut({ redirectTo: "/login" }); }
