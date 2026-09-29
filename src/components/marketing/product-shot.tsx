// Vraie capture de l'application (29/09/2026), affichée dans un cadre de
// navigateur ou de téléphone. Les images sont prises sur le compte de
// démonstration par scripts/demo/capture-screens.mjs (public/screens/),
// en clair et en sombre : le site montre celles du mode choisi (classes
// .nb-when-light / .nb-when-dark de globals.css), et le navigateur ne
// télécharge que celles qui s'affichent (chargement différé).
//
// Composant serveur, sans JavaScript : une page pré-générée reste légère.
import { clsx } from "@/lib/clsx";

/** Écrans disponibles (voir SCREENS dans scripts/demo/capture-screens.mjs). */
export type ScreenName =
  | "tableau-de-bord"
  | "publier"
  | "calendrier"
  | "analytics"
  | "studio"
  | "page-bio"
  | "rapports"
  | "rapport-client"
  | "bio-mobile"
  | "kit-mobile";

const DESKTOP = { width: 1440, height: 900, widths: [1200, 2400] };
const PHONE = { width: 390, height: 844, widths: [390, 780] };

const SCREENS: Record<ScreenName, { size: typeof DESKTOP; url: string }> = {
  "tableau-de-bord": { size: DESKTOP, url: "nebulahub.space/dashboard" },
  publier: { size: DESKTOP, url: "nebulahub.space/composer" },
  calendrier: { size: DESKTOP, url: "nebulahub.space/calendar" },
  analytics: { size: DESKTOP, url: "nebulahub.space/analytics" },
  studio: { size: DESKTOP, url: "nebulahub.space/studio" },
  "page-bio": { size: DESKTOP, url: "nebulahub.space/link-in-bio" },
  rapports: { size: DESKTOP, url: "nebulahub.space/reports" },
  "rapport-client": { size: { width: 1280, height: 800, widths: [1200, 2400] }, url: "nebulahub.space/rapport/…" },
  "bio-mobile": { size: PHONE, url: "nebulahub.space/l/studio-nova" },
  "kit-mobile": { size: PHONE, url: "nebulahub.space/kit/studio-nova" }
};

export function screenSrc(name: ScreenName, mode: "light" | "dark", width: number): string {
  return `/screens/${name}-${mode}-${width}.webp`;
}

/** Toutes les images attendues dans public/screens (vérifié par tests/quality/home.test.ts). */
export function allScreenFiles(): string[] {
  return (Object.keys(SCREENS) as ScreenName[]).flatMap((name) =>
    (["light", "dark"] as const).flatMap((mode) => SCREENS[name].size.widths.map((w) => screenSrc(name, mode, w)))
  );
}

function ShotImage({ name, alt, sizes, priority }: { name: ScreenName; alt: string; sizes: string; priority?: boolean }) {
  const { size } = SCREENS[name];
  const srcSet = (mode: "light" | "dark") => size.widths.map((w) => `${screenSrc(name, mode, w)} ${w}w`).join(", ");
  const common = { width: size.width, height: size.height, sizes, decoding: "async" as const, className: "block h-auto w-full" };
  return (
    <>
      {/* Clair (mode par défaut) : prioritaire pour l'image du haut de page.
          <img> volontaire : WebP déjà à la bonne taille (srcset 1x/2x), sans
          passer par l'optimisation d'images de Vercel (quota du plan Hobby). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...common}
        src={screenSrc(name, "light", size.widths[0])}
        srcSet={srcSet("light")}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        {...(priority ? { fetchPriority: "high" as const } : {})}
        className={clsx(common.className, "nb-when-light")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...common}
        src={screenSrc(name, "dark", size.widths[0])}
        srcSet={srcSet("dark")}
        alt={alt}
        loading="lazy"
        className={clsx(common.className, "nb-when-dark")}
      />
    </>
  );
}

/** Capture dans un cadre de navigateur (écrans de l'application). */
export function ProductShot({
  name,
  alt,
  sizes = "(min-width: 1280px) 1100px, 100vw",
  priority,
  className
}: {
  name: ScreenName;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("nb-shot overflow-hidden rounded-2xl border border-white/10 bg-void-900", className)}>
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5" aria-hidden="true">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="mx-auto w-full max-w-sm truncate rounded-md bg-white/[0.05] px-3 py-1 text-center text-[11px] text-slate-500">
          {SCREENS[name].url}
        </span>
        <span className="w-[42px]" />
      </div>
      <ShotImage name={name} alt={alt} sizes={sizes} priority={priority} />
    </div>
  );
}

/** Capture dans un cadre de téléphone (pages publiques vues sur mobile). */
export function PhoneShot({ name, alt, className }: { name: ScreenName; alt: string; className?: string }) {
  return (
    <div className={clsx("nb-phone relative mx-auto w-[260px] rounded-[42px] border border-white/10 bg-[#0b0b0d] p-2.5", className)}>
      <div aria-hidden="true" className="absolute left-1/2 top-4 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
      <div className="overflow-hidden rounded-[34px]">
        <ShotImage name={name} alt={alt} sizes="260px" />
      </div>
    </div>
  );
}

/** Mention sous les captures : données fictives, jamais de vrais clients. */
export function ShotCaption({ children = "Capture réelle de Nebula, sur un compte de démonstration aux données fictives." }: { children?: React.ReactNode }) {
  return <p className="mt-3 text-center text-xs text-slate-500">{children}</p>;
}
