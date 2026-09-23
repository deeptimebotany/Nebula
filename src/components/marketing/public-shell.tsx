// Gabarit des pages publiques SECONDAIRES (outils, tarifs, contact,
// sécurité, légal) : même navigation et même footer que l'accueil, un fond
// discret commun, et une zone de contenu centrée. L'accueil compose sa page
// lui-même (hero pleine largeur) ; les pages d'auth et les pages partagées
// avec des tiers ont leur propre cadre, volontairement plus dépouillé.
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { clsx } from "@/lib/clsx";

export function PublicShell({ children, width = "max-w-6xl" }: { children: React.ReactNode; width?: string }) {
  return (
    <>
      <MarketingNav />
      <main id="contenu" className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-stars pointer-events-none absolute inset-0 opacity-25" />
        <div aria-hidden="true" className="hero-orb pointer-events-none -left-32 top-10 h-[380px] w-[380px] bg-accent-violet/20" />
        <div aria-hidden="true" className="hero-orb hero-orb-b pointer-events-none -right-32 top-[60%] h-[420px] w-[420px] bg-nebula-500/20" />
        <div className={clsx("relative z-10 mx-auto px-6 pb-24 pt-14 sm:pt-20", width)}>{children}</div>
      </main>
      <MarketingFooter />
    </>
  );
}

/** En-tête de page publique : surtitre, titre, description. */
export function PublicPageHeading({ eyebrow, title, desc, align = "center" }: { eyebrow?: string; title: string; desc?: React.ReactNode; align?: "center" | "left" }) {
  return (
    <div className={clsx("mb-12 max-w-2xl", align === "center" ? "mx-auto text-center" : "text-left")}>
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">{eyebrow}</p>}
      <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-5xl">{title}</h1>
      {desc && <p className="mt-4 text-base text-slate-400 sm:text-lg">{desc}</p>}
    </div>
  );
}
