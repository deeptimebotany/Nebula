"use client";

// Confirmation de l'âge (30/09/2026) : Nebula est réservé aux personnes de 18
// ans et plus (conditions de l'API Gemini, CGU article 3). Fenêtre bloquante,
// une seule fois, pour les comptes créés avant cette date et ceux ouverts avec
// Google, Apple ou Facebook (l'inscription par email coche déjà la case).
// « J'ai moins de 18 ans » : suppression du compte proposée tout de suite.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useBootstrap } from "@/components/bootstrap-provider";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";

export function AgeGate() {
  const { data: me, patch } = useBootstrap();
  const router = useRouter();
  const [step, setStep] = useState<"ask" | "minor">("ask");
  const [busy, setBusy] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!me || me.ai.ageConfirmed) return null;

  async function confirmAdult() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/age", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adult: true }) }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setError("La confirmation n'a pas pu être enregistrée. Réessayez dans un instant.");
      return;
    }
    if (me) patch({ ai: { ...me.ai, ageConfirmed: true } });
  }

  async function deleteAccount() {
    if (!confirmValue.trim()) {
      setError(me?.user.hasPassword ? "Entrez votre mot de passe pour confirmer." : "Saisissez l'adresse e-mail de votre compte pour confirmer.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(me?.user.hasPassword ? { password: confirmValue } : { confirmEmail: confirmValue.trim() })
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) {
      setError(typeof data.error === "string" ? data.error : "La suppression n'a pas abouti. Réessayez.");
      return;
    }
    await signOut({ redirect: false });
    router.push("/");
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="age-gate-title" className="glass-panel-solid w-full max-w-md rounded-3xl p-6 sm:p-8">
        <h2 id="age-gate-title" className="font-display text-xl font-semibold text-white">
          {step === "ask" ? "Nebula est réservé aux 18 ans et plus" : "Nebula n'est pas encore pour vous"}
        </h2>
        {step === "ask" ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Pour utiliser Nebula, et notamment ses fonctions d&apos;IA, vous devez avoir au moins 18 ans. Confirmez-le une seule fois pour continuer.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Voir les{" "}
              <Link href="/legal#conditions" target="_blank" className="text-aurora-300 hover:underline">
                conditions d&apos;utilisation
              </Link>
              .
            </p>
            {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button type="button" onClick={confirmAdult} disabled={busy} className={clsx(busy && "opacity-60")}>
                J&apos;ai 18 ans ou plus
              </Button>
              <button type="button" onClick={() => setStep("minor")} className="text-sm text-slate-400 transition hover:text-white">
                J&apos;ai moins de 18 ans
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Nebula ne peut pas être utilisé avant 18 ans. Vous pouvez supprimer votre compte maintenant : vos marques, publications et médias seront effacés.
            </p>
            <label className="mt-4 block text-xs text-slate-400">
              {me.user.hasPassword ? "Mot de passe" : "Adresse e-mail du compte"}
              <input
                type={me.user.hasPassword ? "password" : "email"}
                value={confirmValue}
                onChange={(e) => setConfirmValue(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-aurora-400/60"
              />
            </label>
            {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button type="button" variant="danger" onClick={deleteAccount} disabled={busy} className={clsx(busy && "opacity-60")}>
                {busy ? "Suppression…" : "Supprimer mon compte"}
              </Button>
              <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="text-sm text-slate-400 transition hover:text-white">
                Me déconnecter
              </button>
              <button type="button" onClick={() => setStep("ask")} className="text-sm text-slate-500 transition hover:text-white">
                Retour
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
