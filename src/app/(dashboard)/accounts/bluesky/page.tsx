"use client";

// Connexion d'un compte Bluesky (25/09/2026). Bluesky n'a pas de page
// d'autorisation à la Meta/Google : on utilise un « mot de passe
// d'application », créé par la personne dans ses réglages Bluesky et
// révocable à tout moment. Nebula ne l'enregistre pas (voir
// /api/social/bluesky/connect et src/lib/social/bluesky.ts).

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { NetworkLogo } from "@/components/ui/network-badge";
import { useBrand } from "@/components/brand-context";
import { refreshConnections } from "@/lib/data/hooks";

function BlueskyConnectForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeBrand } = useBrand();
  const brandId = params.get("brandId") || activeBrand?.id || "";
  const [identifier, setIdentifier] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brandId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/social/bluesky/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, identifier, appPassword })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Connexion impossible. Vérifiez vos identifiants.");
        setSubmitting(false);
        return;
      }
      // Liste des comptes partagée (lot 6) : à jour dès l'arrivée sur Comptes.
      await refreshConnections();
      router.push("/accounts?connected=bluesky");
    } catch {
      setError("Connexion impossible pour le moment. Réessayez dans un instant.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Connecter Bluesky"
        description="Bluesky se connecte avec un mot de passe d'application : un code à part, que vous pouvez supprimer à tout moment sans toucher à votre vrai mot de passe."
      />

      <GlassCard>
        <ol className="space-y-2 text-sm text-slate-300">
          <li>
            <span className="font-medium text-white">1.</span> Dans Bluesky, ouvrez <span className="text-white">Paramètres → Confidentialité et sécurité → Mots de passe d&apos;application</span>.
          </li>
          <li>
            <span className="font-medium text-white">2.</span> Créez-en un nommé « Nebula » (inutile d&apos;autoriser les messages privés).
          </li>
          <li>
            <span className="font-medium text-white">3.</span> Collez-le ci-dessous avec votre pseudo.
          </li>
        </ol>
        <a
          href="https://bsky.app/settings/app-passwords"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm font-medium text-aurora-300 hover:underline"
        >
          Ouvrir la page des mots de passe d&apos;application ↗
        </a>
      </GlassCard>

      <GlassCard>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center gap-2 text-white">
            <NetworkLogo network="BLUESKY" className="h-5 w-5 text-[#1185FE]" />
            <span className="font-display text-base font-medium">Votre compte Bluesky</span>
          </div>
          <Input
            label="Pseudo ou adresse email"
            placeholder="votrenom.bsky.social"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
          <PasswordInput
            label="Mot de passe d'application"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            autoComplete="off"
            hint="N'utilisez pas votre mot de passe principal. Nebula ne garde pas ce code : il sert une seule fois à ouvrir la connexion."
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            required
          />
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!brandId || submitting || !identifier.trim() || !appPassword.trim()} aria-busy={submitting}>
              {submitting ? "Connexion…" : "Connecter Bluesky"}
            </Button>
            <Link href="/accounts" className="text-sm text-slate-400 hover:text-white">
              Annuler
            </Link>
          </div>
        </form>
      </GlassCard>

      <p className="text-xs leading-relaxed text-slate-500">
        Ce que Nebula peut faire avec ce compte : publier du texte et des images (jusqu&apos;à 4, réduites automatiquement sous 1 Mo), ajouter un premier
        commentaire, lire vos abonnés, les j&apos;aime, reposts et réponses de vos posts. La vidéo n&apos;est pas encore prise en charge.
      </p>
    </div>
  );
}

export default function BlueskyConnectPage() {
  return (
    <Suspense fallback={null}>
      <BlueskyConnectForm />
    </Suspense>
  );
}
