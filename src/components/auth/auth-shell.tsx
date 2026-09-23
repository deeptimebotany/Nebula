// Cadre commun des quatre pages d'authentification (connexion, inscription,
// mot de passe oublié, nouveau mot de passe) : même fond, logo cliquable
// vers l'accueil, carte centrée, et un pied de page discret vers les pages
// légales et le contact. Avant : chaque formulaire avait son propre fond
// (deux différents), un logo non cliquable et aucune sortie vers le reste
// du site.
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { NebulaBrandMark } from "@/components/dashboard/nebula-brandmark";
import { IconApple, IconFacebook, IconGoogle } from "@/components/dashboard/icons";

export function AuthShell({ title, subtitle, children, wide = false }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <main id="contenu" className="relative flex min-h-screen flex-col overflow-hidden px-4 py-8">
      <div aria-hidden="true" className="hero-stars pointer-events-none absolute inset-0 opacity-40" />
      <div aria-hidden="true" className="hero-orb pointer-events-none -left-24 top-10 h-[360px] w-[360px] bg-accent-violet/25" />
      <div aria-hidden="true" className="hero-orb hero-orb-b pointer-events-none -right-24 bottom-10 h-[420px] w-[420px] bg-accent-cyan/15" />

      <div className="relative z-10 flex flex-1 items-center justify-center">
        <GlassCard className={wide ? "w-full max-w-md p-8" : "w-full max-w-sm p-8"} hover={false}>
          <Link href="/" aria-label="Nebula — accueil" className="mb-6 inline-flex">
            <NebulaBrandMark iconSize={44} wordHeight={40} />
          </Link>
          <h1 className="font-display text-2xl font-semibold text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          {children}
        </GlassCard>
      </div>

      <footer className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-300 hover:underline">
          Accueil
        </Link>
        <Link href="/legal#conditions" className="hover:text-slate-300 hover:underline">
          Conditions
        </Link>
        <Link href="/legal#confidentialite" className="hover:text-slate-300 hover:underline">
          Confidentialité
        </Link>
        <Link href="/contact" className="hover:text-slate-300 hover:underline">
          Contact
        </Link>
      </footer>
    </main>
  );
}

/** Boutons « Continuer avec … » partagés entre connexion et inscription. */
export function OAuthButtons({
  oauth,
  onPick,
  separatorLabel
}: {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
  onPick: (provider: "google" | "facebook" | "apple") => void;
  separatorLabel: string;
}) {
  if (!oauth?.google && !oauth?.apple && !oauth?.facebook) return null;
  return (
    <div className="mt-6 space-y-2">
      {oauth.google && (
        <OAuthButton onClick={() => onPick("google")} icon={<IconGoogle className="h-4 w-4" />} label="Continuer avec Google" />
      )}
      {oauth.facebook && (
        <OAuthButton onClick={() => onPick("facebook")} icon={<IconFacebook className="h-4 w-4" />} label="Continuer avec Meta" />
      )}
      {oauth.apple && (
        <OAuthButton onClick={() => onPick("apple")} icon={<IconApple className="h-4 w-4" />} label="Continuer avec Apple" />
      )}
      <div className="flex items-center gap-3 pt-2">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-slate-500">{separatorLabel}</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}

function OAuthButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.06]"
    >
      {icon} {label}
    </button>
  );
}
