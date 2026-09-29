"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeRelativePath } from "@/lib/safe-redirect";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { TURNSTILE_ENABLED, TURNSTILE_PENDING_MESSAGE, TurnstileWidget } from "@/components/turnstile-widget";
import { AuthShell, OAuthButtons } from "@/components/auth/auth-shell";
import { clsx } from "@/lib/clsx";
import { IntroOverlay, preloadAccountIntro } from "@/components/intro/intro-overlay";
import { unlockIntroAudio } from "@/lib/intro/audio-unlock";

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
  // Statistiques anonymes (29/09/2026) : facultatif, décoché par défaut.
  const [statsConsent, setStatsConsent] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Jeton anti-robot à usage unique : nouveau jeton après chaque essai refusé.
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "email" | "password" | "terms", string>>>({});
  const [loading, setLoading] = useState(false);
  // Intro de création de compte (29/09/2026) : jouée dès que le compte est
  // créé ; on part vers l'application quand elle est finie ET la connexion
  // ouverte (les deux se font en parallèle).
  const [intro, setIntro] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const introDoneRef = useRef(false);
  const signedInRef = useRef(false);

  // Retour après inscription : ?next=/composer?draft=… (outils gratuits,
  // lot G4.a) — chemin relatif uniquement, jamais une URL externe.
  const rawNext = searchParams.get("next");
  // safeRelativePath refuse aussi « /\evil.com » (lu //evil.com par les navigateurs).
  const nextPath = safeRelativePath(rawNext, "/dashboard");

  // Un lien de parrainage (?ref=CODE) pré-remplit le champ et le déplie, et
  // affiche « Invité par {prénom} : 30 jours d'essai offerts » (brief growth,
  // lot G7) — le prénom seul, via un endpoint public limité en débit.
  const [inviter, setInviter] = useState<{ firstName: string; trialDays: number } | null>(null);
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setForm((s) => ({ ...s, referralCode: ref.toUpperCase() }));
      setShowReferral(true);
      fetch(`/api/public/referral?code=${encodeURIComponent(ref.toUpperCase())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.found && setInviter({ firstName: d.firstName, trialDays: d.trialDays }))
        .catch(() => undefined);
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

  function goToApp() {
    if (!introDoneRef.current || !signedInRef.current) return;
    // Chargement complet : l'application reçoit sa CSP stricte même si
    // l'onglet a été ouvert sur la vitrine (lot 11, voir src/lib/csp.ts).
    window.location.assign(nextPath);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    if (TURNSTILE_ENABLED && !turnstileToken) {
      setError(TURNSTILE_PENDING_MESSAGE);
      return;
    }
    // Son de l'intro : le navigateur ne l'autorise que pendant le clic,
    // donc avant le premier `await` (Safari). L'intro se télécharge en même
    // temps que la création du compte.
    audioRef.current = unlockIntroAudio(audioRef.current);
    preloadAccountIntro();
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
        statsConsent,
        turnstileToken: turnstileToken ?? undefined
      })
    }).catch(() => null);

    if (!res) {
      setLoading(false);
      setTurnstileReset((k) => k + 1);
      setError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
      return;
    }
    if (!res.ok) {
      setTurnstileReset((k) => k + 1);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Impossible de créer le compte pour le moment.");
      setLoading(false);
      return;
    }

    // Compte créé : page blanche et intro, pendant que la connexion s'ouvre.
    setIntro(true);
    const signInRes = await signIn("credentials", { email: form.email.trim(), password: form.password, redirect: false }).catch(() => null);
    if (!signInRes || signInRes.error) {
      setIntro(false);
      setLoading(false);
      router.push("/login");
      return;
    }
    signedInRef.current = true;
    goToApp();
  }

  return (
    <AuthShell title="Créez votre espace" subtitle="Gratuit, sans carte bancaire. Vous connectez vos réseaux juste après." wide>
      {inviter && (
        <p className="mb-4 rounded-xl border border-aurora-400/30 bg-aurora-400/[0.08] px-4 py-3 text-center text-sm text-aurora-100" role="status">
          Invité{inviter.firstName ? ` par ${inviter.firstName}` : ""} : <strong className="font-semibold text-white">{inviter.trialDays} jours d&apos;essai offerts</strong> à l&apos;inscription.
        </p>
      )}
      <OAuthButtons oauth={oauth} onPick={(p) => signIn(p, { callbackUrl: nextPath })} separatorLabel="ou avec votre email" />

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

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm transition">
          <input
            type="checkbox"
            name="statsConsent"
            checked={statsConsent}
            onChange={(e) => setStatsConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.03] accent-aurora-400"
            aria-describedby="register-stats-hint"
          />
          <span className="text-slate-300">
            <span className="font-medium text-white">Facultatif :</span> j&apos;accepte que mon usage de Nebula contribue à des statistiques anonymes.
            <span id="register-stats-hint" className="mt-1 block text-xs text-slate-500">
              Uniquement des chiffres de groupe (20 comptes minimum), calculés à partir de ce que vous faites dans Nebula, jamais des données de vos réseaux. Modifiable à tout moment dans les paramètres.{" "}
              <Link href="/legal#statistiques" target="_blank" className="text-aurora-300 hover:underline">
                En savoir plus
              </Link>
            </span>
          </span>
        </label>

        <TurnstileWidget onVerify={setTurnstileToken} resetKey={turnstileReset} />
        {error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Création..." : "Créer mon espace gratuitement"}
        </Button>
      </form>

      {intro && (
        <IntroOverlay
          audio={audioRef.current}
          onDone={() => {
            introDoneRef.current = true;
            goToApp();
          }}
        />
      )}

      <p className="mt-6 text-center text-sm text-slate-400">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-aurora-300 hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
