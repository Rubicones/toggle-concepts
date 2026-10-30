"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { magicLinkVerifySchema } from "@/packages/data/auth";

export function MagicLinkConfirmation() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <section className="auth-confirm-panel"><span className="auth-confirm-icon"><Mail size={28}/></span><Badge variant="blue">Secure sign-in</Badge><h1>Your studio is one click away.</h1><p>Continue to sign in with the account that received this email. Only continue if you requested the link.</p><form onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    // Fragments never reach HTTP logs or Referrer headers. Consume only on an
    // explicit same-origin POST, so email scanners/GET prefetch cannot sign in.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const parsed = magicLinkVerifySchema.safeParse(hash.has("token_hash") ? { tokenHash: hash.get("token_hash") } : {});
    window.history.replaceState(null, "", "/auth/confirm");
    if (!parsed.success) { setError("This link is incomplete. Open the link from your email or request a new one."); setBusy(false); return; }
    try {
      const response = await fetch("/api/auth/confirm", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Sign-in failed. Request a new link.");
      window.location.replace(result.destination);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-in failed. Request a new link."); setBusy(false); }
  }}>{!error && <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Continue to Toggle"}<ArrowRight size={16}/></Button>}{error && <p role="alert" className="form-error">{error}</p>}</form><Link href="/login" className="text-link">Request a new sign-in link<ArrowRight size={14}/></Link></section>;
}
