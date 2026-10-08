// Hero de la page d'accueil (refonte du 29/09/2026). Composant SERVEUR,
// sans JavaScript : titre, texte et boutons sont dans le HTML dès le
// premier octet, avec une entrée douce en CSS (.hero-enter). Le produit est
// montré tel qu'il est : de VRAIES captures (compte de démonstration, données
// fictives), en clair ou en sombre selon le mode.
// Refonte V2 (08/10/2026) : la nouvelle page Publier en grand et
// l'application sur téléphone, avec une pastille « Nouveau » (à retirer
// quelques semaines après la mise en ligne de la V2).
import { ButtonLink } from "@/components/ui/button";
import { PhoneShot, ProductShot, ShotCaption } from "@/components/marketing/product-shot";
import { LAUNCHED_NETWORKS, NETWORK_META, networksSentence } from "@/lib/types";
import { NetworkLogo, networkInkStyle } from "@/components/ui/network-badge";
import { IconCard, IconCheck, IconLock } from "@/components/dashboard/icons";
import { PRELAUNCH_PAGE, isSiteOpen } from "@/lib/launch";
import { configuredMediaSources } from "@/lib/integrations/config";
import { MEDIA_SOURCE_KIND, MEDIA_SOURCE_LABELS } from "@/lib/media-sources";
import { SourceIcon } from "@/components/media-import/source-icon";

const REASSURANCE = [
  { icon: IconCard, text: "Gratuit pour commencer, sans carte bancaire" },
  { icon: IconLock, text: "Connexion officielle à chaque réseau" },
  { icon: IconCheck, text: "Sans engagement" }
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Refonte V2 (08/10/2026) : fond uni, plus de halos colorés. */}

      <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          {/* V2 (08/10/2026) : la nouvelle interface, dès la première ligne.
              Les Réussites suivent juste sous le hero (#reussites). */}
          <a
            href="/#visite"
            className="hero-enter hero-enter-1 inline-flex items-center gap-2 rounded-full border border-[color:var(--nb-sep-strong)] py-1 pl-1 pr-3.5 text-xs font-medium text-slate-200 transition hover:border-aurora-400/60 hover:text-white"
          >
            <span className="rounded-full bg-aurora-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Nouveau</span>
            Une interface entièrement repensée
            <span aria-hidden="true" className="text-aurora-300">→</span>
          </a>

          <h1 className="hero-enter hero-enter-2 mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
            Tous vos réseaux sociaux,
            <br />
            <span className="nb-accent-ink">dans un seul espace</span>
          </h1>

          <p className="hero-enter hero-enter-3 mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Nebula programme vos publications sur {networksSentence()}, rassemble vos statistiques
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
                <item.icon className="h-3.5 w-3.5 text-slate-500" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Ordinateur : Publier en grand (et le téléphone à côté dès 1 024 px) ;
            téléphone : l'application telle qu'on la voit sur mobile. */}
        <div className="hero-enter hero-enter-4 relative mx-auto mt-14">
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-10">
            <ProductShot
              name="publier"
              priority
              sizes="(min-width: 1200px) 824px, (min-width: 640px) calc(100vw - 48px), 1px"
              alt="Page Publier de Nebula : une vidéo, son titre et sa description, les réseaux cochés et l'aperçu Instagram sur téléphone (compte de démonstration Studio Nova)"
              className="relative hidden sm:block"
            />
            <PhoneShot
              name="tableau-de-bord-mobile"
              width={240}
              statusBar
              priority
              alt="Nebula sur téléphone : la Vue d'ensemble avec les abonnés, la portée et le taux d'engagement de Studio Nova (compte de démonstration)"
              className="sm:hidden lg:block"
            />
          </div>
          <ShotCaption>La nouvelle page Publier et l&apos;application sur téléphone : captures réelles de Nebula, sur un compte de démonstration aux données fictives.</ShotCaption>
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

        {/* Import direct des médias (02/10/2026) : seulement les sources
            réellement ouvertes (clés renseignées sur Vercel, lues au build). */}
        <MediaSourcesStrip />
      </div>
    </section>
  );
}

/** « Importez vos photos et vidéos directement depuis » : ordinateur ou téléphone, puis les sources ouvertes. */
function MediaSourcesStrip() {
  const sources = configuredMediaSources();
  const banks = sources.filter((id) => MEDIA_SOURCE_KIND[id] === "banque d'images libres");
  const clouds = sources.filter((id) => MEDIA_SOURCE_KIND[id] === "stockage cloud");
  const kinds = [clouds.length ? "votre stockage cloud" : null, banks.length ? "une banque d'images libres" : null, sources.includes("canva") ? "vos designs Canva" : null].filter(Boolean) as string[];
  return (
    <div className="mt-12 text-center" id="import-medias">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Importez vos photos et vidéos directement depuis</p>
      <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-4" aria-label="Sources d'import de photos et vidéos">
        <li className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <SourceIcon id="device" className="h-5 w-5 text-slate-400" />
          Votre ordinateur ou téléphone
        </li>
        {sources.map((id) => (
          <li key={id} className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <SourceIcon id={id} className="h-5 w-5 text-slate-400" />
            {MEDIA_SOURCE_LABELS[id]}
          </li>
        ))}
      </ul>
      <p className="mx-auto mt-4 max-w-xl text-sm text-slate-400">
        {kinds.length
          ? `Choisissez un fichier dans ${kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} ou ${kinds[kinds.length - 1]}` : kinds[0]} : il arrive dans Publier sans passer par votre ordinateur.`
          : "Glissez votre photo ou votre vidéo dans Publier : elle est prête à partir sur tous vos réseaux."}
      </p>
    </div>
  );
}
