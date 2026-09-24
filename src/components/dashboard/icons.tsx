// Icônes minimalistes en SVG inline (pas de dépendance externe).
type IconProps = { className?: string };

const base = "h-[18px] w-[18px]";

export const IconHome = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconCalendar = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v3M16 3v3" strokeLinecap="round" />
  </svg>
);

export const IconUpload = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M12 15V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconChart = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" />
  </svg>
);

export const IconLink = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path
      d="M9.5 14.5 14.5 9.5M8 16l-1.5 1.5a3.5 3.5 0 0 1-5-5L3 11a3.5 3.5 0 0 1 5-5l1.5-1.5m5 0L16 3a3.5 3.5 0 0 1 5 5l-1.5 1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconLogout = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconPlus = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

export const IconChevron = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Utilisées par le bouton replier/déplier de la barre latérale (voir
// sidebar-nav.tsx) : un seul bouton, l'icône change de sens selon l'action
// que le clic va déclencher (◀ replie vers la gauche, ▶ déplie vers la droite).
export const IconChevronLeft = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconChevronRight = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconSparkle = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2 14 9 21 11 14 13 12 20 10 13 3 11 10 9Z" />
  </svg>
);

// Cloche (option « Notifier les abonnés » du Composer).
export const IconBell = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z" strokeLinejoin="round" />
    <path d="M10 20.5a2 2 0 0 0 4 0" strokeLinecap="round" />
  </svg>
);

export const IconCard = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18" strokeLinecap="round" />
    <path d="M7 14.5h4" strokeLinecap="round" />
  </svg>
);

export const IconSend = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M21 3 3 10.5l7.5 2.5L14 21l7-18Z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.5 13 21 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconMessage = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path
      d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5Z"
      strokeLinejoin="round"
    />
  </svg>
);

// Onglet Engagements (likes, partages, enregistrements) — un pouce levé,
// distinct du cœur d'IconHeart (réservé à « Soutenir Nebula ») et de la
// bulle d'IconMessage (Commentaires).
export const IconThumbUp = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M7 11v9H4.5A1.5 1.5 0 0 1 3 18.5v-6A1.5 1.5 0 0 1 4.5 11H7Z" strokeLinejoin="round" />
    <path d="M7 11l4.2-7.2a1.6 1.6 0 0 1 2.9 1.1L13.4 9H18a2.4 2.4 0 0 1 2.3 3l-1.6 6.2A2.4 2.4 0 0 1 16.4 20H7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconClose = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
);

export const IconHash = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M9 3 7 21M17 3l-2 18M4 9h16M3.5 15h16" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconUsers = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="9" cy="8" r="3" />
    <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" strokeLinecap="round" />
    <path d="M16 4.3a3 3 0 0 1 0 5.8M19 20c0-2.9-1.9-5.3-4.5-6.2" strokeLinecap="round" />
  </svg>
);

export const IconHeart = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path
      d="M12 20.5s-7.5-4.6-9.8-9.2C.7 8 2.2 4.5 5.6 3.7c2-.5 4 .3 5.1 2 .3.4.9.4 1.2 0 1.1-1.7 3.1-2.5 5.1-2 3.4.8 4.9 4.3 3.4 7.6-2.3 4.6-9.8 9.2-9.8 9.2Z"
      strokeLinejoin="round"
    />
  </svg>
);

// Gemme fine et raffinée (contour) — utilisée partout où l'on veut évoquer
// la mise à niveau sans emoji. Pour la version dégradée/lumineuse, voir
// <UpgradeGem /> dans ./upgrade-gem.tsx.
export const IconDiamond = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className={className}>
    <path d="M8.5 3.5h7L19.5 9 12 20.5 4.5 9l4-5.5Z" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M4.5 9h15M9.2 3.5 7.6 9 12 20.5M14.8 3.5 16.4 9l-4.4 11.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
  </svg>
);

// Roue crantée redessinée (24/09/2026) : 8 dents régulières calculées
// géométriquement — l'ancien tracé, recopié avec des erreurs, s'affichait
// comme une forme ondulée déformée.
export const IconSettings = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className={className}>
    <path d="M10.44 4.77L10.80 2.48L13.20 2.48L13.56 4.77A7.4 7.4 0 0 1 16.01 5.78L17.88 4.41L19.59 6.12L18.22 7.99A7.4 7.4 0 0 1 19.23 10.44L21.52 10.80L21.52 13.20L19.23 13.56A7.4 7.4 0 0 1 18.22 16.01L19.59 17.88L17.88 19.59L16.01 18.22A7.4 7.4 0 0 1 13.56 19.23L13.20 21.52L10.80 21.52L10.44 19.23A7.4 7.4 0 0 1 7.99 18.22L6.12 19.59L4.41 17.88L5.78 16.01A7.4 7.4 0 0 1 4.77 13.56L2.48 13.20L2.48 10.80L4.77 10.44A7.4 7.4 0 0 1 5.78 7.99L4.41 6.12L6.12 4.41L7.99 5.78A7.4 7.4 0 0 1 10.44 4.77Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconGift = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="3.5" y="9" width="17" height="4" rx="1" />
    <path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 9v12" strokeLinecap="round" />
    <path
      d="M12 9c-2 0-3.4-.8-3.4-2.4S9.2 4 10.6 4C12 4 12 6.6 12 9ZM12 9c2 0 3.4-.8 3.4-2.4S13.8 4 12.4 4C11 4 11 6.6 11 9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconAvatar = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="12" cy="8.3" r="3.3" />
    <path d="M4.5 20c0-4.1 3.4-7.4 7.5-7.4s7.5 3.3 7.5 7.4" strokeLinecap="round" />
  </svg>
);

export const IconSun = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="12" cy="12" r="4.2" />
    <path
      d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"
      strokeLinecap="round"
    />
  </svg>
);

export const IconMoon = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path
      d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconEmoji = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.3 14.2c1 1.3 2.2 1.9 3.7 1.9s2.7-.6 3.7-1.9" strokeLinecap="round" />
    <path d="M8.7 9.5h.01M15.3 9.5h.01" strokeLinecap="round" strokeWidth="2.4" />
  </svg>
);

// Glyphes simplifiés (pas les logos officiels, juste une forme reconnaissable
// dans le style trait de l'appli) pour repérer chaque réseau d'un coup d'œil
// dans "Réseaux cibles" du Composer.
export const IconTikTok = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path
      d="M14 3v10.8a3.3 3.3 0 1 1-2.6-3.23"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 3c.35 2.4 2.05 4.1 4.5 4.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconYouTube = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="2.7" y="6" width="18.6" height="12" rx="3.5" />
    <path d="M10.3 9.6v4.8l4.3-2.4Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconInstagram = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconFacebook = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M14 8.5h-1.6c-.9 0-1.4.5-1.4 1.4V11H14l-.3 2.2h-2.7V21" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Bluesky (25/09/2026) : papillon stylisé au trait, comme les autres
// glyphes de réseaux ci-dessus (pas le logo officiel).
export const IconBluesky = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M12 11.5C10.6 8.6 6.9 4.5 4.4 4.5c-1.6 0-1.6 1.7-1.3 4 .3 2.1 1.5 3.4 4.1 3.6-2.6.5-3.3 2-2 3.6 2.2 2.6 4.8 1.2 6.8-2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 11.5c1.4-2.9 5.1-7 7.6-7 1.6 0 1.6 1.7 1.3 4-.3 2.1-1.5 3.4-4.1 3.6 2.6.5 3.3 2 2 3.6-2.2 2.6-4.8 1.2-6.8-2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Automatisations (lot 4) : prise électrique.
export const IconPlug = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M9 3.5V8M15 3.5V8M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8ZM12 16.5v4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Lot 2 (25/09/2026) : glyphes simplifiés au trait, comme ci-dessus.
export const IconThreads = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M16.5 11.2c-.4-2.6-2.1-3.9-4.4-3.9-2.6 0-4.4 1.9-4.4 4.8 0 3.4 2 5.4 4.7 5.4 2.3 0 4.3-1.4 4.3-3.6 0-2-1.8-3-4-3-1.6 0-2.8.8-2.8 2 0 1.1 1 1.8 2.2 1.8 1.9 0 3-1.5 3.1-4.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 7.5A8.5 8.5 0 1 0 20.5 12" strokeLinecap="round" />
  </svg>
);

export const IconPinterest = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10.4 20.5 12.2 13M11 13.6c.5.9 1.4 1.3 2.4 1.3 2.2 0 3.6-2 3.6-4.4 0-2.5-2.1-4.3-4.8-4.3-3 0-4.9 2-4.9 4.4 0 1.2.5 2.2 1.3 2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconLinkedIn = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <path d="M8 10.5V16M8 7.8v.1M11.5 16v-5.5M11.5 13c0-1.7 1-2.6 2.3-2.6 1.3 0 2.2.8 2.2 2.6V16" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Logos simplifiés (traits, pas les marques officielles) pour les boutons de
// connexion rapide sur /login et /register — voir oauth-providers.ts.
export const IconGoogle = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.33-.17-1.96H12v3.7h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.26Z" />
    <path fill="#34A853" d="M12 22c2.43 0 4.47-.8 5.96-2.17l-3.24-2.5c-.9.6-2.06.96-2.72.96-2.1 0-3.87-1.4-4.5-3.3H4.4v2.55A9.98 9.98 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M7.5 14.99a5.9 5.9 0 0 1 0-3.98V8.46H4.4a9.98 9.98 0 0 0 0 9.08l3.1-2.55Z" />
    <path fill="#EA4335" d="M12 6.7c1.32 0 2.5.45 3.44 1.34l2.87-2.87A9.6 9.6 0 0 0 12 2a9.98 9.98 0 0 0-7.6 4.46l3.1 2.55c.63-1.9 2.4-3.3 4.5-3.3Z" />
  </svg>
);

export const IconApple = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M16.5 12.6c0-1.86 1.02-2.85 1.6-3.36-.9-1.29-2.25-1.5-2.73-1.53-1.24-.12-2.4.72-3 .72-.63 0-1.62-.7-2.66-.68-1.37.02-2.63.8-3.32 2.04-1.42 2.46-.36 6.5.87 8.7.6 1.06 1.32 2.25 2.28 2.2.9-.03 1.26-.6 2.36-.6s1.42.6 2.4.58c1-.02 1.65-1.02 2.25-2.08.53-.94.9-1.85 1-2-.02 0-1.05-.4-1.05-2Z" />
    <path d="M14.5 6.15c.5-.62.86-1.5.76-2.4-.72.06-1.6.5-2.13 1.12-.47.55-.9 1.44-.78 2.28.8.06 1.62-.42 2.15-1Z" />
  </svg>
);

export const IconCommand = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M8 6.5A2.5 2.5 0 1 0 5.5 9H8m0-2.5V9m0-2.5H16m0 0A2.5 2.5 0 1 1 18.5 9H16m0-2.5V9m0 6.5A2.5 2.5 0 1 0 18.5 18H16m0-2.5V18m0-2.5H8m0 0A2.5 2.5 0 1 1 5.5 18H8m0-2.5V18" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconTrophy = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 5.5H4.5a2 2 0 0 0-2 2v.5a3.5 3.5 0 0 0 3.5 3.5H7M17 5.5h2.5a2 2 0 0 1 2 2v.5a3.5 3.5 0 0 1-3.5 3.5H17" strokeLinecap="round" />
    <path d="M12 14v3M8.5 20.5h7M9.5 20.5V18a2.5 2.5 0 0 1 5 0v2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconLock = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    <circle cx="12" cy="15.3" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

// Icône "hamburger" — ouvre le menu latéral (voir sidebar.tsx), placée à
// gauche du logo dans la barre de navigation.
export const IconMenu = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" strokeLinecap="round" />
  </svg>
);

// Téléphone avec des boutons de liens empilés — page "link in bio" publique
// (voir /link-in-bio et /l/[slug]).
export const IconBioLink = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M9 6.5h6M8.5 11h7M8.5 14.3h7M8.5 17.6h4.5" strokeLinecap="round" />
  </svg>
);

// Courbe qui chute puis remonte — outil autonome d'analyse de rétention
// vidéo (voir /retention).
export const IconRetention = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M3 5v14a1 1 0 0 0 1 1h17" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 8 11 14 14 11 20 17" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Feuille avec une mini-courbe de croissance — rapports clients automatiques
// (voir /reports).
export const IconReport = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
    <path d="M8.5 16.5 11 12.5l2 2.5 3-4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Calendrier avec une flèche de partage — calendrier client public en
// lecture seule (voir /calendar-share).
export const IconCalendarShare = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="3" y="5.5" width="14" height="15" rx="2.2" />
    <path d="M3 9.5h14M6.5 3v3M13.5 3v3" strokeLinecap="round" />
    <path d="M16 4.5h5v5M21 4.5 15 10.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Fiole de laboratoire — onglet privé "Test / QA" (voir /dev-preview),
// réservé au compte propriétaire du site.
export const IconFlask = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M9.5 3h5M10 3v6.2L4.8 18.6a1.6 1.6 0 0 0 1.4 2.4h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 15h9" strokeLinecap="round" />
  </svg>
);

// --- Icônes de la vitrine (page d'accueil, Lot 1) ---------------------------
export const IconCheck = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconShield = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconDownload = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M12 4v11m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 19h14" strokeLinecap="round" />
  </svg>
);

export const IconLayers = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M12 4l8 4.5-8 4.5-8-4.5L12 4z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 13l8 4.5 8-4.5M4 17l8 4.5 8-4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// --- Icônes du shell de l'application (Lot 3) -------------------------------
export const IconList = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M8 6h12M8 12h12M8 18h12" strokeLinecap="round" />
    <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSearch = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" strokeLinecap="round" />
  </svg>
);

export const IconSidebar = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </svg>
);

export const IconFocus = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" strokeLinecap="round" />
  </svg>
);

export const IconDots = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

export const IconAlert = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M12 3.5l9 16h-18l9-16z" strokeLinejoin="round" />
    <path d="M12 10v4.5M12 17.5h.01" strokeLinecap="round" />
  </svg>
);

export const IconRefresh = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" strokeLinecap="round" />
    <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconClock = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
