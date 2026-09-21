"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { NebulaBrandMark } from "@/components/dashboard/nebula-brandmark";

// useSearchParams() (pour lire ?token=...) impose un <Suspense> autour du
// composant qui l'appelle, sinon Next.js refuse de pré-générer la page au
// build ("useSearchParams() should be wrapped in a suspense boundary").
export function ResetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordFormInner />
    </Suspense>
  );
}

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh opacity-70" />
      <GlassCard className="relative z-10 w-full max-w-sm p-8" hover={false}>
        <NebulaBrandMark className="mb-5" />
        <h1 className="font-display text-2xl font-semibold text-white">Nouveau mot de passe</h1>

        {!token ? (
          <p className="mt-4 text-sm text-red-400">
            Lien invalide — redemandez un email depuis{" "}
            <Link href="/forgot-password" className="text-aurora-300 hover:underline">
              cette page
            </Link>
            .
          </p>
        ) : done ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-sm text-emerald-200">
            Mot de passe mis à jour — redirection vers la connexion...
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Nouveau mot de passe</label>
              <input
                type="password"
                name="new-password"
                id="reset-new-password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
                placeholder="8 caractères min."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Confirmez-le</label>
              <input
                type="password"
                name="confirm-password"
                id="reset-confirm-password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
                placeholder="8 caractères min."
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Mise à jour..." : "Valider le nouveau mot de passe"}
            </Button>
          </form>
        )}
      </GlassCard>
    </div>
  );
}
