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

export const IconSparkle = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2 14 9 21 11 14 13 12 20 10 13 3 11 10 9Z" />
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

export const IconSettings = ({ className = base }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
    <circle cx="12" cy="12" r="3.2" />
    <path
      d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2.06 2.06 0 1 1-2.92 2.92l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V19.6a2.06 2.06 0 1 1-4.12 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2.06 2.06 0 1 1-2.92-2.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4.4a2.06 2.06 0 1 1 0-4.12h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2.06 2.06 0 1 1 8.57 4.1l.06.06a1.7 1.7 0 0 0 1.87.34H10.6a1.7 1.7 0 0 0 1.03-1.56V4.4a2.06 2.06 0 1 1 4.12 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2.06 2.06 0 1 1 2.92 2.92l-.06.06a1.7 1.7 0 0 0-.34 1.87v.1a1.7 1.7 0 0 0 1.56 1.03h.09a2.06 2.06 0 1 1 0 4.12h-.09a1.7 1.7 0 0 0-1.56 1.03Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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
