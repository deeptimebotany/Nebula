// Gabarit des pages publiques SECONDAIRES (outils, tarifs, contact,
// sécurité, légal) : même navigation et même footer que l'accueil, un fond
// discret commun, et une zone de contenu centrée. L'accueil compose sa page
// lui-même (hero pleine largeur) ; les pages d'auth et les pages partagées
// avec des tiers ont leur propre cadre, volontairement plus dépouillé.
// Refonte V2 (08/10/2026) : même langage que l'application — fond uni, blocs
// sans cadre séparés par des traits fins (.nb-site dans globals.css).
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { clsx } from "@/lib/clsx";

export function PublicShell({ children, width = "max-w-6xl" }: { children: React.ReactNode; width?: string }) {
  return (
    <>
      <MarketingNav />
      {/* Refonte V2 (08/10/2026) : fond uni, plus d'étoiles ni de halos colorés. */}
      <main id="contenu" className="nb-site relative overflow-hidden">
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
      {eyebrow && <p className="nb-eyebrow">{eyebrow}</p>}
      <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-5xl">{title}</h1>
      {desc && <p className="mt-4 text-base text-slate-400 sm:text-lg">{desc}</p>}
    </div>
  );
}
