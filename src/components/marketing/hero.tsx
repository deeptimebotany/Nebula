// Hero de la page d'accueil (refonte du 29/09/2026). Composant SERVEUR,
// sans JavaScript : titre, texte et boutons sont dans le HTML dès le
// premier octet, avec une entrée douce en CSS (.hero-enter). Le produit est
// montré tel qu'il est : une VRAIE capture du tableau de bord (compte de
// démonstration, données fictives), en clair ou en sombre selon le mode.
import { ButtonLink } from "@/components/ui/button";
import { ProductShot, ShotCaption } from "@/components/marketing/product-shot";
import { LAUNCHED_NETWORKS, NETWORK_META } from "@/lib/types";
import { NetworkLogo, networkInkStyle } from "@/components/ui/network-badge";
import { IconCard, IconCheck, IconLock, IconTrophy } from "@/components/dashboard/icons";
import { PRELAUNCH_PAGE, isSiteOpen } from "@/lib/launch";

const REASSURANCE = [
  { icon: IconCard, text: "Gratuit pour commencer, sans carte bancaire" },
  { icon: IconLock, text: "Connexion officielle à chaque réseau" },
  { icon: IconCheck, text: "Sans engagement" }
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="hero-orb -left-24 top-8 h-[360px] w-[360px] bg-accent-violet/20" />
      <div aria-hidden="true" className="hero-orb hero-orb-b -right-20 top-40 h-[420px] w-[420px] bg-accent-cyan/15" />

      <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          {/* Les Réussites, dès la première ligne (30/09/2026) : c'est ce qui
              distingue Nebula des autres outils de planification. */}
          <a
            href="/#reussites"
            className="hero-enter hero-enter-1 inline-flex items-center gap-2 rounded-full border border-aurora-400/30 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-aurora-400/60 hover:text-white"
          >
            <IconTrophy className="h-3.5 w-3.5 text-amber-300" />
            Réussites : publier régulièrement devient un jeu
            <span aria-hidden="true" className="text-aurora-300">→</span>
          </a>

          <h1 className="hero-enter hero-enter-2 mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
            Tous vos réseaux sociaux,
            <br />
            <span className="text-gradient-live">dans un seul espace</span>
          </h1>

          <p className="hero-enter hero-enter-3 mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Nebula programme vos publications sur Instagram, TikTok, YouTube, Facebook et Bluesky, rassemble vos statistiques
            et prépare les rapports de vos clients. Et chaque publication vous fait progresser : missions de la semaine,
            rangs et récompenses pour garder le rythme.
          </p>

          <div className="hero-enter hero-enter-4 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {isSiteOpen() ? (
              <ButtonLink href="/register" className="w-full px-7 py-3.5 text-base sm:w-auto">
                Créer mon espace gratuit
              </ButtonLink>
            ) : (
              <ButtonLink href={PRELAUNCH_PAGE} className="w-full px-7 py-3.5 text-base sm:w-auto">
                Être prévenu du lancement
              </ButtonLink>
            )}
            <ButtonLink href="/#visite" variant="outline" className="w-full px-7 py-3.5 text-base sm:w-auto">
              Voir l&apos;application
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

        <div className="hero-enter hero-enter-4 relative mx-auto mt-14">
          <div aria-hidden="true" className="pointer-events-none absolute -inset-x-8 -top-8 bottom-1/2 rounded-[48px] bg-gradient-to-b from-aurora-400/15 to-transparent blur-3xl" />
          <ProductShot
            name="tableau-de-bord"
            priority
            sizes="(min-width: 1200px) 1104px, calc(100vw - 48px)"
            alt="Tableau de bord Nebula : abonnés, portée, taux d'engagement, publications du mois et meilleur créneau du jour de la marque Studio Nova (compte de démonstration)"
            className="relative"
          />
          <ShotCaption />
        </div>

        <div className="mt-16 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Connexion officielle à</p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-9 gap-y-4" aria-label="Réseaux pris en charge">
            {LAUNCHED_NETWORKS.map((n) => (
              <li key={n} className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <span className="network-ink" style={networkInkStyle(n)}>
                  <NetworkLogo network={n} className="h-5 w-5" />
                </span>
                {NETWORK_META[n].label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
