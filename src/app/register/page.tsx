"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "", brandName: "", referralCode: "" });
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
      body: JSON.stringify({ ...form, referralCode: form.referralCode || undefined })
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
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh opacity-70" />
      <GlassCard className="relative z-10 w-full max-w-sm p-8" hover={false}>
        <h1 className="font-display text-2xl font-semibold text-white">
          Créez votre <span className="text-gradient">cockpit</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">Un espace, plusieurs réseaux, zéro friction.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {[
            { key: "name", label: "Votre nom", type: "text", placeholder: "Alex Martin" },
            { key: "email", label: "Email", type: "email", placeholder: "vous@marque.com" },
            { key: "password", label: "Mot de passe", type: "password", placeholder: "8 caractères min." },
            { key: "brandName", label: "Nom de la marque / du compte", type: "text", placeholder: "Ma Marque" }
          ].map((f) => (
            <div key={f.key}>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">{f.label}</label>
              <input
                type={f.type}
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
