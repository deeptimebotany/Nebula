// Petites icônes de l'éditeur vidéo (traits fins, même style que le reste de Nebula).
import type { ReactNode } from "react";

type P = { className?: string };
const S = (d: ReactNode, className?: string) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export const IcScissors = ({ className }: P) => S(<><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8.2 7.8 20 16M8.2 16.2 20 8" /></>, className);
export const IcCrop = ({ className }: P) => S(<><path d="M6 2.5v15.5h15.5" /><path d="M2.5 6H18v15.5" /></>, className);
export const IcSliders = ({ className }: P) => S(<><path d="M5 4v16M12 4v16M19 4v16" /><circle cx="5" cy="14" r="2" fill="currentColor" /><circle cx="12" cy="8" r="2" fill="currentColor" /><circle cx="19" cy="15" r="2" fill="currentColor" /></>, className);
export const IcFilter = ({ className }: P) => S(<><circle cx="9" cy="9" r="5.5" /><circle cx="15" cy="9" r="5.5" /><circle cx="12" cy="14.5" r="5.5" /></>, className);
export const IcSticker = ({ className }: P) => S(<><path d="M20.5 12A8.5 8.5 0 1 1 12 3.5h1.5a7 7 0 0 0 7 7V12Z" /><path d="M8.5 13.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2" /><path d="M9 9.5h.01M14.5 9.5h.01" /></>, className);
export const IcPencil = ({ className }: P) => S(<><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /><path d="M13.5 7l3 3" /></>, className);
export const IcResize = ({ className }: P) => S(<><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M9 15l6-6M11 9h4v4" /></>, className);
export const IcUndo = ({ className }: P) => S(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>, className);
export const IcRedo = ({ className }: P) => S(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>, className);
export const IcReset = ({ className }: P) => S(<><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4v4.5H8" /></>, className);
export const IcPlay = ({ className }: P) => S(<path d="M7 5v14l12-7L7 5Z" fill="currentColor" />, className);
export const IcPause = ({ className }: P) => S(<><path d="M8 5v14M16 5v14" strokeWidth={3} /></>, className);
export const IcSound = ({ className }: P) => S(<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>, className);
export const IcMute = ({ className }: P) => S(<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></>, className);
export const IcSplit = ({ className }: P) => S(<><path d="M12 3v18" /><path d="M8 8 4 12l4 4M16 8l4 4-4 4" /></>, className);
export const IcTrash = ({ className }: P) => S(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>, className);
export const IcRotate = ({ className }: P) => S(<><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></>, className);
export const IcFlipH = ({ className }: P) => S(<><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 6 3 18h6V6ZM15 6l6 12h-6V6Z" /></>, className);
export const IcFlipV = ({ className }: P) => S(<><path d="M3 12h18" strokeDasharray="2 2" /><path d="M6 9 18 3v6H6ZM6 15l12 6v-6H6Z" /></>, className);
export const IcRatio = ({ className }: P) => S(<><rect x="3.5" y="6" width="17" height="12" rx="1.5" /><path d="M7 9v6M17 9v6" strokeDasharray="1.5 2" /></>, className);
export const IcLine = ({ className }: P) => S(<path d="M5 19 19 5" />, className);
export const IcArrow = ({ className }: P) => S(<><path d="M5 19 19 5" /><path d="M10 5h9v9" /></>, className);
export const IcRect = ({ className }: P) => S(<rect x="4" y="6" width="16" height="12" rx="1" />, className);
export const IcEllipse = ({ className }: P) => S(<ellipse cx="12" cy="12" rx="8.5" ry="6.5" />, className);
export const IcText = ({ className }: P) => S(<><path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6" /></>, className);
export const IcEraser = ({ className }: P) => S(<><path d="m15 4 5 5-10 10H5l-2-2 12-13Z" /><path d="M9.5 9.5l5 5M10 19h10" /></>, className);
export const IcCursor = ({ className }: P) => S(<path d="M5 3.5 18.5 12l-6 1.5-3 6L5 3.5Z" />, className);
export const IcImage = ({ className }: P) => S(<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></>, className);
export const IcLock = ({ className }: P) => S(<><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>, className);
export const IcUnlock = ({ className }: P) => S(<><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" /></>, className);
export const IcClose = ({ className }: P) => S(<path d="M6 6l12 12M18 6 6 18" />, className);
export const IcZoomIn = ({ className }: P) => S(<path d="M12 5v14M5 12h14" />, className);
export const IcZoomOut = ({ className }: P) => S(<path d="M5 12h14" />, className);
