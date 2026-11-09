"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyFinance, validateFinance, type FinanceData } from "./finance";

export type StorageStatus = "loading" | "ready" | "unavailable" | "unauthenticated";
function detail(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}
export function useFinance() {
  const [data, setData] = useState<FinanceData>(emptyFinance);
  const [status, setStatus] = useState<StorageStatus>("loading");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const alive = useRef(true);
  const loadId = useRef(0);
  const reload = useCallback(async () => {
    if (saving.current) return;
    const id = ++loadId.current;
    setStatus("loading");
    try {
      const response = await fetch("/api/v1/finance", { cache: "no-store", credentials: "same-origin" });
      const payload: unknown = await response.json();
      if (!alive.current || id !== loadId.current) return;
      if (!response.ok) {
        setStatus(response.status === 401 ? "unauthenticated" : "unavailable");
        setError(detail(payload, "Your account's budget could not be loaded. Retry when the server is available."));
        return;
      }
      setData(validateFinance(payload));
      setStatus("ready"); setError(""); setStale(false);
    } catch {
      if (!alive.current || id !== loadId.current) return;
      setStatus("unavailable"); setError("Your account's budget could not be loaded. Check the connection and retry. No empty replacement has been saved.");
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void reload(); });
    return () => { cancelled = true; alive.current = false; };
  }, [reload]);
  async function commit(next: FinanceData): Promise<string | null> {
    if (saving.current) return "A save is already in progress.";
    if (stale) return "Reload saved data before retrying. Your draft is still here.";
    if (status !== "ready") return "The account's budget is not ready. Nothing has been submitted.";
    try { validateFinance(next); } catch (cause) { return cause instanceof Error ? cause.message : "Invalid finance data."; }
    saving.current = true; setPending(true);
    try {
      const response = await fetch("/api/v1/finance", {
        method: "PUT", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: data.revision, data: next }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = detail(payload, "The server rejected this save. Reload before retrying.");
        if (alive.current) {
          setError(message);
          if (response.status === 409) setStale(true);
          if (response.status === 401) setStatus("unauthenticated");
        }
        return message;
      }
      const saved = validateFinance(payload);
      if (alive.current) { setData(saved); setStatus("ready"); setError(""); setStale(false); }
      return null;
    } catch {
      const message = "The save could not be confirmed. It may have reached the database. Reload saved data before retrying to avoid overwriting a newer change.";
      if (alive.current) { setError(message); setStale(true); }
      return message;
    } finally { saving.current = false; if (alive.current) setPending(false); }
  }
  return { data, status, error, stale, pending, reload, commit };
}
