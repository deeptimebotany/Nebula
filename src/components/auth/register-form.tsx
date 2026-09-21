"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { IconGoogle, IconApple, IconFacebook } from "@/components/dashboard/icons";
import { NebulaBrandMark } from "@/components/dashboard/nebula-brandmark";

interface RegisterFormProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
}

// useSearchParams() (utilisé ci-dessous pour lire ?ref=CODE) impose que le
// composant qui l'appelle soit entouré d'un <Suspense>, sinon Next.js
// refuse de pré-générer la page au build ("useSearchParams() should be
// wrapped in a suspense boundary"). D'où cet export qui ne fait que poser
// la limite, le vrai contenu étant dans RegisterFormInner ci-dessous.
export function RegisterForm({ oauth }: RegisterFormProps) {
  return (
    <Suspense fallback={null}>
      <RegisterFormInner oauth={oauth} />
    </Suspense>
  );
}

function RegisterFormInner({ oauth }: RegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "", brandName: "", referralCode: "" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Un lien de parrainage (?ref=CODE) pré-remplit le champ automatiquement.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) setForm((s) => ({ ...s, referralCode: ref.toUpperCase() }));
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, referralCode: form.referralCode || undefined, turnstileToken })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Impossible de créer le compte.");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
    setLoading(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh opacity-70" />
      <GlassCard className="relative z-10 w-full max-w-sm p-8" hover={false}>
        <NebulaBrandMark className="mb-5" iconSize={52} wordHeight={48} />
        <h1 className="font-display text-2xl font-semibold text-white">
          Créez votre <span className="text-gradient">cockpit</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">Un espace, plusieurs réseaux, zéro friction.</p>

        {(oauth?.google || oauth?.apple || oauth?.facebook) && (
          <div className="mt-6 space-y-2">
            {oauth.google && (
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                <IconGoogle className="h-4 w-4" /> Continuer avec Google
              </button>
            )}
            {oauth.facebook && (
              <button
                type="button"
                onClick={() => signIn("facebook", { callbackUrl: "/dashboard" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                <IconFacebook className="h-4 w-4" /> Continuer avec Meta
              </button>
            )}
            {oauth.apple && (
              <button
                type="button"
                onClick={() => signIn("apple", { callbackUrl: "/dashboard" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                <IconApple className="h-4 w-4" /> Continuer avec Apple
              </button>
            )}
            <div className="flex items-center gap-3 pt-2">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-slate-500">ou créez votre espace avec un email</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {[
            { key: "name", label: "Votre nom", type: "text", placeholder: "Alex Martin", autoComplete: "name" },
            { key: "email", label: "Email", type: "email", placeholder: "vous@marque.com", autoComplete: "username" },
            { key: "password", label: "Mot de passe", type: "password", placeholder: "8 caractères min.", autoComplete: "new-password" },
            { key: "brandName", label: "Nom de la marque / du compte", type: "text", placeholder: "Ma Marque", autoComplete: "organization" }
          ].map((f) => (
            <div key={f.key}>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">{f.label}</label>
              <input
                type={f.type}
                name={f.key}
                id={`register-${f.key}`}
                autoComplete={f.autoComplete}
                required
                minLength={f.key === "password" ? 8 : 2}
                value={form[f.key as keyof typeof form]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
                placeholder={f.placeholder}
              />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Code de parrainage <span className="text-slate-600">(optionnel — 14 jours d&apos;IA offerts)</span>
            </label>
            <input
              type="text"
              value={form.referralCode}
              onChange={(e) => setForm((s) => ({ ...s, referralCode: e.target.value.toUpperCase() }))}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm uppercase tracking-widest text-white outline-none transition focus:border-aurora-400/60"
              placeholder="ABCD1234"
            />
          </div>
          <TurnstileWidget onVerify={setTurnstileToken} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Création..." : "Créer mon espace"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-aurora-300 hover:underline">
            Se connecter
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
