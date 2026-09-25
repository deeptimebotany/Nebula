"use client";

// Capture d'email progressive des outils gratuits (brief growth, lot G4.b).
// Affichée après la 2e génération du jour, avant la 3e : « Recevez 5
// générations de plus par jour ». Le refus (« Continuer sans ») laisse le
// quota de base — on ne bloque jamais complètement. Un seul lead par
// navigateur (localStorage), rate-limit + Turnstile côté serveur.
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TurnstileWidget } from "@/components/turnstile-widget";

const STORAGE_KEY = "nebula:tool-lead";

export function hasToolLead(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function ToolLeadCapture({ tool, onDone, onSkip }: { tool: string; onDone: (bonus: number) => void; onSkip: () => void }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Adresse email invalide.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/tools/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), tool, consent, turnstileToken: token ?? undefined })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Enregistrement impossible.");
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
      onDone(d.bonus ?? 5);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-aurora-400/25 bg-nebula-900/40 p-4" aria-label="Recevoir des générations bonus">
      <p className="text-sm font-medium text-white">Recevez 5 générations de plus par jour</p>
      <p className="mt-1 text-xs text-slate-400">Laissez votre email : vos générations bonus s&apos;activent tout de suite.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.fr"
          aria-label="Votre email"
          required
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
        />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? "Activation…" : "Activer mes bonus"}
        </Button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-transparent" />
        <span>
          Recevoir les conseils Nebula (après confirmation par e-mail, désinscription en un clic). Voir la{" "}
          <Link href="/legal#confidentialite" className="text-aurora-300 hover:underline">
            politique de confidentialité
          </Link>
          .
        </span>
      </label>
      <TurnstileWidget onVerify={setToken} />
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <button type="button" onClick={onSkip} className="mt-3 text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
        Continuer sans
      </button>
    </form>
  );
}
