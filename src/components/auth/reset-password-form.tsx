"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthShell } from "@/components/auth/auth-shell";

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
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmError(null);
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setConfirmError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    }).catch(() => null);
    setLoading(false);
    if (!res) {
      setError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Une erreur est survenue. Réessayez dans un instant.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <AuthShell title="Nouveau mot de passe" subtitle={token ? "Choisissez un mot de passe que vous n'utilisez nulle part ailleurs." : undefined}>
      {!token ? (
        <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
          <p className="font-medium">Ce lien est incomplet ou a expiré.</p>
          <p className="mt-1 text-red-200/80">
            Redemandez un email depuis{" "}
            <Link href="/forgot-password" className="text-aurora-300 hover:underline">
              la page « Mot de passe oublié »
            </Link>
            .
          </p>
        </div>
      ) : done ? (
        <div role="status" className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-sm text-emerald-200">
          Mot de passe mis à jour. Redirection vers la connexion…
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <PasswordInput
            label="Nouveau mot de passe"
            name="new-password"
            id="reset-new-password"
            autoComplete="new-password"
            required
            minLength={8}
            showStrength
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8 caractères minimum"
          />
          <PasswordInput
            label="Confirmez-le"
            name="confirm-password"
            id="reset-confirm-password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={confirmError ?? undefined}
            placeholder="Le même mot de passe"
          />
          {error && (
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading || !password || !confirm} className="w-full">
            {loading ? "Mise à jour..." : "Valider le nouveau mot de passe"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
