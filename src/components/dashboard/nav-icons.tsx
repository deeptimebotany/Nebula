"use client";

// Icônes du menu (09/10/2026, demande de Lucas : « plus gras, plus remplis,
// un peu plus gros », dans l'esprit du menu de YouTube Studio).
//  - Dessinées sur 24 px, traits de 2 px aux bouts arrondis, affichées en
//    24 px dans le menu latéral (au lieu de 18 px en traits de 1,7).
//  - `filled` (page ouverte) : la forme principale est pleine, les détails
//    (barres, lignes, flèche…) sont découpés dedans par un masque SVG, pour
//    rester lisibles sur n'importe quel fond.
// Dessins propres à Nebula (aucune icône reprise d'un autre produit).
import { useId, type ReactNode } from "react";

export interface NavIconProps {
  className?: string;
  /** Page ouverte : version pleine. */
  filled?: boolean;
}

function useMaskId(): string {
  return `nbm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Forme pleine `shape`, avec `cut` (traits) découpés dedans. */
function Solid({ id, shape, cut, cutWidth = 2 }: { id: string; shape: ReactNode; cut: ReactNode; cutWidth?: number }) {
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" stroke="none" />
        <g stroke="#000" strokeWidth={cutWidth} fill="none">
          {cut}
        </g>
      </mask>
      <g fill="currentColor" mask={`url(#${id})`}>
        {shape}
      </g>
    </>
  );
}

/** Vue d'ensemble : quatre tuiles. */
export function NavIconDashboard({ className, filled = false }: NavIconProps) {
  return (
    <Svg className={className}>
      <g fill={filled ? "currentColor" : "none"}>
        <rect x="3.5" y="3.5" width="7" height="9" rx="1.8" />
        <rect x="13.5" y="3.5" width="7" height="5" rx="1.8" />
        <rect x="13.5" y="11.5" width="7" height="9" rx="1.8" />
        <rect x="3.5" y="15.5" width="7" height="5" rx="1.8" />
      </g>
    </Svg>
  );
}

/** Publier : carré arrondi et flèche vers le haut. */
export function NavIconPublish({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const box = <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />;
  const arrow = <path d="M12 16.5V8M8.5 11.5 12 8l3.5 3.5" />;
  return <Svg className={className}>{filled ? <Solid id={id} shape={box} cut={arrow} cutWidth={2.2} /> : <>{box}{arrow}</>}</Svg>;
}

/** Studio IA : étoile de l'IA (toujours pleine, couleur gérée par .nb-ai-nav). */
export function NavIconStudio({ className }: NavIconProps) {
  return (
    <Svg className={className}>
      <path d="M11 3.5c.5 4 2.5 6.4 6.5 7.5-4 1.1-6 3.5-6.5 7.5-.5-4-2.5-6.4-6.5-7.5 4-1.1 6-3.5 6.5-7.5Z" fill="currentColor" />
      <path d="M18.5 3v4M16.5 5h4" />
    </Svg>
  );
}

/** Publications : pile de contenus et triangle de lecture. */
export function NavIconPublications({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const card = <rect x="3.5" y="7" width="13.5" height="13.5" rx="2.5" />;
  return (
    <Svg className={className}>
      <path d="M7.5 3.5H18a2.5 2.5 0 0 1 2.5 2.5v10.5" />
      {filled ? (
        <Solid id={id} shape={card} cut={<path d="M8.5 11v6l4.8-3z" fill="#000" />} cutWidth={1.2} />
      ) : (
        <>
          {card}
          <path d="M8.5 11v6l4.8-3z" fill="currentColor" strokeWidth={1.2} />
        </>
      )}
    </Svg>
  );
}

/** Calendrier : page de calendrier, anneaux et deux jours. */
export function NavIconCalendar({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const body = <rect x="3.5" y="5" width="17" height="15.5" rx="2.8" />;
  const details = <path d="M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17.2h.01M12 17.2h.01" />;
  return (
    <Svg className={className}>
      <path d="M8 3v4M16 3v4" />
      {filled ? <Solid id={id} shape={body} cut={details} cutWidth={2.4} /> : <>{body}{details}</>}
    </Svg>
  );
}

/** Analytics : cadre et barres. */
export function NavIconAnalytics({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const box = <rect x="3.5" y="3.5" width="17" height="17" rx="3.2" />;
  const bars = <path d="M8 16.5v-4M12 16.5v-9M16 16.5V11" />;
  return <Svg className={className}>{filled ? <Solid id={id} shape={box} cut={bars} cutWidth={2.2} /> : <>{box}{bars}</>}</Svg>;
}

/** Outils : clé. */
export function NavIconTools({ className, filled = false }: NavIconProps) {
  return (
    <Svg className={className}>
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-7.9 7.9l-6.3 6.3a2.1 2.1 0 0 1-3-3l6.3-6.3a6 6 0 0 1 7.9-7.9l-3.4 3.4Z"
        fill={filled ? "currentColor" : "none"}
      />
    </Svg>
  );
}

/** Comptes connectés : deux maillons. */
export function NavIconAccounts({ className, filled = false }: NavIconProps) {
  return (
    <Svg className={className}>
      <g strokeWidth={filled ? 2.6 : 2}>
        <path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4" />
        <path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5l-2.7 2.7a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" />
      </g>
    </Svg>
  );
}

/** Interactions : bulle et deux lignes de texte. */
export function NavIconInteractions({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const bubble = <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v8.5A2.5 2.5 0 0 1 18 17.5h-7l-4.5 3.5v-3.5H6A2.5 2.5 0 0 1 3.5 15Z" />;
  const lines = <path d="M8 9h8M8 12.5h5" />;
  return <Svg className={className}>{filled ? <Solid id={id} shape={bubble} cut={lines} cutWidth={2.2} /> : <>{bubble}{lines}</>}</Svg>;
}

/** Page bio : téléphone et liens. */
export function NavIconBio({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const phone = <rect x="5.5" y="2.5" width="13" height="19" rx="3" />;
  const links = <path d="M9 8h6M9 11.5h6M9 15h6" />;
  return <Svg className={className}>{filled ? <Solid id={id} shape={phone} cut={links} cutWidth={2.2} /> : <>{phone}{links}</>}</Svg>;
}

/** Media kit : carte de visite avec portrait. */
export function NavIconMediaKit({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const card = <rect x="2.5" y="4.5" width="19" height="15" rx="3" />;
  const details = (
    <>
      <circle cx="8.5" cy="10.5" r="1.9" />
      <path d="M5.8 15.8c.6-1.4 1.6-2.1 2.7-2.1s2.1.7 2.7 2.1M14.5 10h4M14.5 13.5h3" />
    </>
  );
  return <Svg className={className}>{filled ? <Solid id={id} shape={card} cut={details} cutWidth={2} /> : <>{card}{details}</>}</Svg>;
}

/** Rapports : document et courbe. */
export function NavIconReports({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const doc = <rect x="4.5" y="2.5" width="15" height="19" rx="3" />;
  const chart = <path d="M8 15.5 10.5 12l2.5 2 3-4.5" />;
  return <Svg className={className}>{filled ? <Solid id={id} shape={doc} cut={chart} cutWidth={2.2} /> : <>{doc}{chart}</>}</Svg>;
}

/** Calendrier client : calendrier et flèche de partage. */
export function NavIconClientCalendar({ className, filled = false }: NavIconProps) {
  const id = useMaskId();
  const body = <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h12a2.5 2.5 0 0 1 2.5 2.5V12H14a2 2 0 0 0-2 2v6.5H6a2.5 2.5 0 0 1-2.5-2.5Z" />;
  const band = <path d="M3.5 10h17" />;
  return (
    <Svg className={className}>
      <path d="M8 3v4M16 3v4" />
      {filled ? <Solid id={id} shape={body} cut={band} cutWidth={2.2} /> : <>{body}{band}</>}
      <path d="M15.5 20.5 21 15M17 15h4v4" />
    </Svg>
  );
}

/** Communauté : deux personnes. */
export function NavIconCommunity({ className, filled = false }: NavIconProps) {
  return (
    <Svg className={className}>
      <g fill={filled ? "currentColor" : "none"}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6Z" />
      </g>
      <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6M18 14.4c2.2.7 3.5 2.8 3.5 5.6" />
    </Svg>
  );
}

/** Réussites : coupe. */
export function NavIconTrophy({ className, filled = false }: NavIconProps) {
  return (
    <Svg className={className}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0Z" fill={filled ? "currentColor" : "none"} />
      <path d="M7 6H4.5v1.2A3.5 3.5 0 0 0 7.6 10.7M17 6h2.5v1.2a3.5 3.5 0 0 1-3.1 3.5M12 14v3.5M8.5 20.5h7M9.5 17.5h5" />
    </Svg>
  );
}
