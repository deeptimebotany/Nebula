"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { AuthShell, OAuthButtons } from "@/components/auth/auth-shell";
import { clsx } from "@/lib/clsx";

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
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "email" | "password" | "terms", string>>>({});
  const [loading, setLoading] = useState(false);

  // Un lien de parrainage (?ref=CODE) pré-remplit le champ et le déplie.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setForm((s) => ({ ...s, referralCode: ref.toUpperCase() }));
      setShowReferral(true);
    }
  }, [searchParams]);

  function validate(): boolean {
    const next: typeof fieldErrors = {};
    if (form.name.trim().length < 2) next.name = "Indiquez votre nom (2 caractères minimum).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Adresse email invalide.";
    if (form.password.length < 8) next.password = "8 caractères minimum.";
    if (!acceptTerms) next.terms = "Merci d'accepter les conditions pour continuer.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        brandName: form.brandName.trim() || undefined,
        referralCode: form.referralCode.trim() || undefined,
        acceptTerms,
        turnstileToken: turnstileToken ?? undefined
      })
    }).catch(() => null);

    if (!res) {
      setLoading(false);
      setError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Impossible de créer le compte pour le moment.");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", { email: form.email.trim(), password: form.password, redirect: false });
    setLoading(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell title="Créez votre espace" subtitle="Gratuit, sans carte bancaire. Vous connectez vos réseaux juste après." wide>
      <OAuthButtons oauth={oauth} onPick={(p) => signIn(p, { callbackUrl: "/dashboard" })} separatorLabel="ou avec votre email" />

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <Input
          label="Votre nom"
          name="name"
          id="register-name"
          autoComplete="name"
          required
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          error={fieldErrors.name}
          placeholder="Alex Martin"
        />
        <Input
          label="Email"
          type="email"
          name="email"
          id="register-email"
          autoComplete="username"
          inputMode="email"
          required
          value={form.email}
          onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
          error={fieldErrors.email}
          placeholder="vous@marque.com"
        />
        <PasswordInput
          label="Mot de passe"
          name="password"
          id="register-password"
          autoComplete="new-password"
          required
          minLength={8}
          showStrength
          value={form.password}
          onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
          error={fieldErrors.password}
          placeholder="8 caractères minimum"
        />
        <Input
          label={
            <>
              Nom de votre marque <span className="text-slate-500">(facultatif)</span>
            </>
          }
          name="brandName"
          id="register-brandName"
          autoComplete="organization"
          value={form.brandName}
          onChange={(e) => setForm((s) => ({ ...s, brandName: e.target.value }))}
          placeholder="Ma marque, mon studio, mon client…"
          hint="Le nom de votre premier espace de travail. Vous pourrez le changer et en créer d'autres ensuite."
        />

        {showReferral ? (
          <Input
            label={
              <>
                Code de parrainage <span className="text-slate-500">(14 jours d&apos;assistant IA offerts)</span>
              </>
            }
            name="referralCode"
            id="register-referralCode"
            autoComplete="off"
            value={form.referralCode}
            onChange={(e) => setForm((s) => ({ ...s, referralCode: e.target.value.toUpperCase() }))}
            className="uppercase tracking-widest"
            placeholder="ABCD1234"
          />
        ) : (
          <button type="button" onClick={() => setShowReferral(true)} className="text-xs text-slate-400 hover:text-aurora-300 hover:underline">
            J&apos;ai un code de parrainage
          </button>
        )}

        <label className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition", fieldErrors.terms ? "border-red-400/40 bg-red-400/[0.06]" : "border-white/10 bg-white/[0.02]")}>
          <input
            type="checkbox"
            name="acceptTerms"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.03] accent-aurora-400"
            aria-invalid={fieldErrors.terms ? true : undefined}
            aria-describedby={fieldErrors.terms ? "register-terms-error" : undefined}
          />
          <span className="text-slate-300">
            J&apos;accepte les{" "}
            <Link href="/legal#conditions" target="_blank" className="text-aurora-300 hover:underline">
              conditions d&apos;utilisation
            </Link>{" "}
            et la{" "}
            <Link href="/legal#confidentialite" target="_blank" className="text-aurora-300 hover:underline">
              politique de confidentialité
            </Link>
            .
          </span>
        </label>
        {fieldErrors.terms && (
          <p id="register-terms-error" role="alert" className="-mt-2 text-xs text-red-400">
            {fieldErrors.terms}
          </p>
        )}

        <TurnstileWidget onVerify={setTurnstileToken} />
        {error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Création..." : "Créer mon espace gratuitement"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-aurora-300 hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
