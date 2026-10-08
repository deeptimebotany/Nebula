"use client";

// Offres de lancement sur la grille publique (accueil, /tarifs) — 02/10/2026.
// Valeurs lues dans src/lib/founders-offer.ts et plans.ts ; places restantes
// lues en direct (GET /api/billing/founders, même origine : la page reste
// pré-générée). Sans réponse, on affiche le nombre total de places.
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { FounderBadge } from "@/components/reussites/founder-badge";
import { PRELAUNCH_PAGE, isSiteOpen } from "@/lib/launch";
import { PLAN_LIMITS, upToBrandsText } from "@/lib/plans";
import { FOUNDERS_SALE_END_LABEL, FOUNDER_MONTHLY, FOUNDER_PREMIUM, euros, founderRegularPrice, foundersSaleOpen, placesText, type FoundersResponse } from "@/lib/founders-offer";

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-aurora-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FounderOffersPublic({ initialOpen = true }: { initialOpen?: boolean }) {
  const [data, setData] = useState<FoundersResponse | null>(null);
  // Vente terminée le 1er janvier 2027 (03/10/2026) : la section disparaît,
  // même sur une page générée avant cette date. Premier rendu = valeur du
  // serveur (initialOpen), puis l'heure du navigateur et la réponse de l'API.
  const [clockOpen, setClockOpen] = useState(initialOpen);
  useEffect(() => {
    setClockOpen(foundersSaleOpen());
    fetch("/api/billing/founders", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FoundersResponse | null) => d && setData(d))
      .catch(() => undefined);
  }, []);
  const saleOpen = data ? data.saleOpen : clockOpen;
  const open = isSiteOpen();
  const href = open ? "/register" : PRELAUNCH_PAGE;
  const pro = PLAN_LIMITS.PRO.label;
  const monthlyLeft = data ? data.monthly.left : FOUNDER_MONTHLY.places;
  const premiumLeft = data ? data.premium.left : FOUNDER_PREMIUM.places;
  const premiumPrice = euros(FOUNDER_PREMIUM.priceCents);

  const cards = [
    {
      id: "fondateur",
      title: "Fondateur",
      price: `${FOUNDER_MONTHLY.priceMonthly} €`,
      unit: `/ mois pendant ${FOUNDER_MONTHLY.months} mois`,
      sub: `puis ${founderRegularPrice()} € / mois, prélevé automatiquement, sans engagement`,
      lines: [`${pro} ${upToBrandsText(FOUNDER_MONTHLY.maxBrands)}, tout compris`, `Pour les ${FOUNDER_MONTHLY.places} premiers abonnés`, "Badge « Fondateur » à vie"],
      left: monthlyLeft,
      total: FOUNDER_MONTHLY.places
    },
    {
      id: "fondateur-premium",
      title: "Fondateur Premium",
      price: premiumPrice,
      unit: "une fois",
      sub: `${pro} ${upToBrandsText(FOUNDER_PREMIUM.maxBrands)} pendant ${FOUNDER_PREMIUM.months} mois, sans renouvellement automatique`,
      lines: ["Soutenez Nebula dès son lancement", `${FOUNDER_PREMIUM.places} places, une par compte`, "À la fin, vous choisissez la suite (rien n'est prélevé)", "Badge « Fondateur » à vie"],
      left: premiumLeft,
      total: FOUNDER_PREMIUM.places
    }
  ];

  if (!saleOpen) return null;

  return (
    <div className="mt-10" id="fondateurs">
      <div className="mx-auto mb-5 max-w-2xl text-center">
        <p className="nb-eyebrow">Offres de lancement</p>
        <h3 className="mt-2 font-display text-2xl font-semibold text-white">Devenez fondateur</h3>
        <p className="mt-2 text-sm text-slate-400">
          Places limitées, pour celles et ceux qui nous rejoignent dès le début.{" "}
          <strong className="font-medium text-slate-200">Fin des offres le {FOUNDERS_SALE_END_LABEL}.</strong>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {cards.map((c) => (
          <GlassCard key={c.id} hover={false} className="flex h-full flex-col border-aurora-400/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-lg text-white">{c.title}</p>
              <FounderBadge />
            </div>
            <p className="mt-2">
              <span className="font-display text-4xl font-semibold text-white">{c.price}</span>
              <span className="text-sm text-slate-400"> {c.unit}</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{c.sub}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-300">
              {c.lines.map((l) => (
                <li key={l} className="flex items-start gap-2">
                  <Check />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs font-medium text-aurora-200" aria-live="polite">
              {c.left > 0 ? `${placesText(c.left)} sur ${c.total} · jusqu'au ${FOUNDERS_SALE_END_LABEL}` : "Complet : merci à tous les fondateurs !"}
            </p>
            <ButtonLink href={href} variant="outline" className="mt-3 w-full">
              {open ? (c.left > 0 ? "Créer mon espace et en profiter" : "Créer mon espace gratuitement") : "Être prévenu du lancement"}
            </ButtonLink>
          </GlassCard>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        L&apos;offre se choisit dans Facturation après l&apos;inscription, jusqu&apos;au {FOUNDERS_SALE_END_LABEL} (ou avant si les places partent). Fondateur :
        premier abonnement, mensuel. Fondateur Premium : paiement unique, accès immédiat.
      </p>
    </div>
  );
}
