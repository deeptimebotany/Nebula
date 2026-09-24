// Hero de la page d'accueil. Composant SERVEUR, sans Framer Motion : le
// titre, le texte et les boutons sont dans le HTML dès le premier octet
// (l'ancien hero était rendu invisible jusqu'à l'hydratation), avec une
// entrée douce en CSS (.hero-enter). Direction : garder l'univers Nebula
// (fond nuit, halos violet/cyan, étoiles discrètes) mais le rendre premium
// — une promesse claire, un seul appel à l'action principal, des icônes
// vectorielles au lieu d'emojis, et le produit montré tout de suite.
import { ButtonLink } from "@/components/ui/button";
import { DashboardVisual } from "@/components/marketing/product-visuals";
import { LAUNCHED_NETWORKS, NETWORK_META } from "@/lib/types";
import { NetworkLogo } from "@/components/ui/network-badge";
import { IconCard, IconCheck, IconLock } from "@/components/dashboard/icons";

const REASSURANCE = [
  { icon: IconCard, text: "Gratuit pour commencer, sans carte bancaire" },
  { icon: IconLock, text: "Connexion par les API officielles des réseaux" },
  { icon: IconCheck, text: "Résiliable à tout moment" }
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Décor : halos qui dérivent lentement (les étoiles sont posées sur
          toute la page par page.tsx) */}
      <div aria-hidden="true" className="hero-orb -left-24 top-8 h-[360px] w-[360px] bg-accent-violet/30" />
      <div aria-hidden="true" className="hero-orb hero-orb-b -right-20 top-40 h-[420px] w-[420px] bg-accent-cyan/20" />
      <div aria-hidden="true" className="hero-orb left-1/3 top-[520px] h-[300px] w-[520px] bg-nebula-500/25" />

      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <ul className="hero-enter hero-enter-1 mb-6 flex flex-wrap items-center justify-center gap-2" aria-label="Réseaux pris en charge">
            {LAUNCHED_NETWORKS.map((n) => (
              <li
                key={n}
                className="flex items-center gap-1.5 rounded-full border bg-white/[0.02] px-3 py-1 text-xs font-medium"
                style={{ borderColor: `${NETWORK_META[n].color}55`, color: NETWORK_META[n].color }}
              >
                <NetworkLogo network={n} className="h-3.5 w-3.5" />
                {NETWORK_META[n].label}
              </li>
            ))}
          </ul>

          <h1 className="hero-enter hero-enter-2 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
            Tous vos réseaux sociaux,
            <br />
            <span className="text-gradient-live">un seul cockpit</span>
          </h1>

          <p className="hero-enter hero-enter-3 mx-auto mt-6 max-w-2xl text-base text-slate-300 sm:text-lg">
            Programmez vos publications sur Instagram, TikTok, YouTube, Facebook et Bluesky en une seule fois, suivez vos
            résultats au même endroit et envoyez des rapports clairs à vos clients — sans jongler entre quatre
            applications.
          </p>

          <div className="hero-enter hero-enter-4 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/register" className="w-full px-7 py-3.5 text-base sm:w-auto">
              Créer mon espace gratuitement
            </ButtonLink>
            <ButtonLink href="/#fonctionnalites" variant="outline" className="w-full px-7 py-3.5 text-base sm:w-auto">
              Découvrir les fonctionnalités
            </ButtonLink>
          </div>

          <ul className="hero-enter hero-enter-4 mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
            {REASSURANCE.map((item) => (
              <li key={item.text} className="flex items-center gap-1.5">
                <item.icon className="h-3.5 w-3.5 text-aurora-300" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Le produit, tout de suite : composition fidèle de l'interface */}
        <div className="hero-enter hero-enter-4 relative mx-auto mt-14 max-w-5xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-10 -top-10 bottom-1/3 rounded-[40px] bg-gradient-to-b from-aurora-400/10 to-transparent blur-2xl"
          />
          <DashboardVisual />
          <p className="mt-3 text-center text-[11px] text-slate-500">
            Aperçu de l&apos;interface avec des données de démonstration.
          </p>
        </div>
      </div>
    </section>
  );
}
