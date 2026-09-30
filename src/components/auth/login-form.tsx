"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthShell, OAuthButtons } from "@/components/auth/auth-shell";
import { EARLY_ACCESS_QUERY, PRELAUNCH_ERROR, PRELAUNCH_LOGIN_MESSAGE, PRELAUNCH_PAGE, isSiteOpen } from "@/lib/launch";

interface LoginFormProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
  /** Chemin interne où revenir après connexion (déjà vérifié côté serveur). */
  callbackUrl?: string;
  initialError?: string | null;
  info?: string | null;
}

export function LoginForm({ oauth, callbackUrl = "/dashboard", initialError = null, info = null }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email: email.trim(), password, redirect: false });
    setLoading(false);
    if (res?.error === PRELAUNCH_ERROR) {
      setError(PRELAUNCH_LOGIN_MESSAGE);
      return;
    }
    if (res?.error) {
      // NextAuth ne distingue pas volontairement « compte inconnu » et
      // « mauvais mot de passe » (anti-énumération) ; le rate-limit (voir
      // lib/auth.ts) renvoie la même erreur après trop de tentatives.
      setError("Email ou mot de passe incorrect. Après plusieurs essais rapides, patientez quelques minutes.");
      return;
    }
    // Navigation complète : le retour peut viser une route serveur (ex.
    // confirmation de l'adresse e-mail), et l'application reçoit sa CSP
    // stricte même si l'onglet a été ouvert sur la vitrine (lot 11, voir
    // src/lib/csp.ts).
    window.location.assign(callbackUrl);
  }

  const open = isSiteOpen();

  return (
    <AuthShell title="Bon retour" subtitle="Connectez-vous à votre espace Nebula.">
      {!open && (
        <p role="status" className="mb-4 rounded-xl border border-amber-300/30 bg-amber-300/[0.08] px-3 py-2 text-center text-sm text-amber-100">
          Pré-lancement : la connexion est réservée à l&apos;équipe et aux partenaires invités.
        </p>
      )}
      <OAuthButtons oauth={oauth} onPick={(p) => signIn(p, { callbackUrl })} separatorLabel="ou avec votre email" />

      {info && (
        <p role="status" className="mt-4 rounded-xl border border-aurora-300/30 bg-aurora-500/10 px-3 py-2 text-sm text-aurora-100">
          {info}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          name="email"
          id="login-email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@marque.com"
        />
        <PasswordInput
          label="Mot de passe"
          labelAside={
            <Link href="/forgot-password" className="text-xs text-aurora-300 hover:underline">
              Mot de passe oublié ?
            </Link>
          }
          name="password"
          id="login-password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
            {error === PRELAUNCH_LOGIN_MESSAGE && (
              <>
                {" "}
                <Link href={PRELAUNCH_PAGE} className="font-medium text-white underline underline-offset-2">
                  Aller à la page « Bientôt »
                </Link>
              </>
            )}
          </p>
        )}
        <Button type="submit" disabled={loading || !email || !password} className="w-full">
          {loading ? "Connexion..." : "Se connecter"}
        </Button>
      </form>

      {open ? (
        <p className="mt-6 text-center text-sm text-slate-400">
          Pas encore de compte ?{" "}
          <Link href="/register" className="text-aurora-300 hover:underline">
            Créer mon espace gratuitement
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-sm text-slate-400">
          Pas encore de compte ?{" "}
          <Link href={PRELAUNCH_PAGE} className="text-aurora-300 hover:underline">
            Être prévenu de l&apos;ouverture
          </Link>
          <span aria-hidden="true"> · </span>
          <Link href={`/register?${EARLY_ACCESS_QUERY.name}=${EARLY_ACCESS_QUERY.value}`} className="text-slate-400 underline-offset-2 hover:text-white hover:underline">
            J&apos;ai une invitation
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
