"use client";

// Rendus « natifs » de l'aperçu de la page Publier (refonte du 24/09/2026) :
// pour chaque réseau, une imitation fidèle de son interface (mode sombre de
// chaque application), en version mobile et en version ordinateur. Purement
// visuel : les compteurs sont des valeurs d'exemple, rien n'est cliquable.
// Utilisé par composer-preview.tsx.

import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";
import type { Network } from "@/lib/types";
import type { UploadedAsset } from "./composer-types";

export type PreviewDevice = "mobile" | "desktop";
export type MediaShape = "portrait" | "landscape" | "square";

export interface PreviewPost {
  network: Network;
  accountName: string;
  /** Identifiant affiché (@…) — dérivé du nom quand le réseau n'en fournit pas. */
  handle: string;
  avatarUrl: string | null;
  asset: UploadedAsset | undefined;
  title: string;
  caption: string;
  shape: MediaShape;
  onMediaShape: (w: number, h: number) => void;
}

// --- Icônes (traits fins, façon applications) ------------------------------
type P = { className?: string };
const S = (d: ReactNode, className?: string, fill = false) => (
  <svg viewBox="0 0 24 24" className={className} fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const Heart = ({ className, fill }: P & { fill?: boolean }) => S(<path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.9 3.8 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.4 0 5.6 3.4 4.4 6.7-1.7 4.7-9.2 9.3-9.2 9.3Z" />, className, fill);
const Comment = ({ className }: P) => S(<path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.3A8.4 8.4 0 1 1 20.5 11.6Z" />, className);
const Plane = ({ className }: P) => S(<><path d="M21.5 3 10.2 14.3" /><path d="M21.5 3 14.6 21l-4.4-6.7L3.5 9.9 21.5 3Z" /></>, className);
const Bookmark = ({ className, fill }: P & { fill?: boolean }) => S(<path d="M6 3.5h12v17l-6-4.3-6 4.3v-17Z" />, className, fill);
const Dots = ({ className }: P) => S(<><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>, className);
const DotsV = ({ className }: P) => S(<><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="19" r="1.4" fill="currentColor" /></>, className);
const Share = ({ className }: P) => S(<path d="M14 5.5 21 12l-7 6.5V15c-5 0-8.5 1.5-11 5 .8-5.6 4-10 11-10.9V5.5Z" />, className, true);
const ShareOut = ({ className }: P) => S(<><path d="M14 5 20 11l-6 6" /><path d="M20 11H10a6 6 0 0 0-6 6v2" /></>, className);
const ThumbUp = ({ className, fill }: P & { fill?: boolean }) => S(<><path d="M7.5 10.5v10h-3v-10h3Z" /><path d="M7.5 10.5 11.5 3c1.7 0 2.7 1.2 2.4 2.9l-.7 3.6h5.4c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.4a2.2 2.2 0 0 1-2.1 1.7H7.5" /></>, className, fill);
const ThumbDown = ({ className }: P) => S(<g transform="rotate(180 12 12)"><path d="M7.5 10.5v10h-3v-10h3Z" /><path d="M7.5 10.5 11.5 3c1.7 0 2.7 1.2 2.4 2.9l-.7 3.6h5.4c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.4a2.2 2.2 0 0 1-2.1 1.7H7.5" /></g>, className);
const Music = ({ className }: P) => S(<><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>, className);
const Globe = ({ className }: P) => S(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" /></>, className);
const Home = ({ className }: P) => S(<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-4.8v-6H9.3v6H4.5a1 1 0 0 1-1-1v-9.5Z" />, className);
const Search = ({ className }: P) => S(<><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.5-4.5" /></>, className);
const PlusSquare = ({ className }: P) => S(<><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><path d="M12 8v8M8 12h8" /></>, className);
const Reels = ({ className }: P) => S(<><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><path d="M3.5 8.5h17M8 3.5l3 5M13.5 3.5l3 5" /><path d="m10.5 12 4 2.3-4 2.3V12Z" fill="currentColor" /></>, className);
const User = ({ className }: P) => S(<><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></>, className);
const Inbox = ({ className }: P) => S(<><path d="M3.5 13.5 6 5h12l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-5.5Z" /><path d="M3.5 13.5h5l1 2.5h5l1-2.5h5" /></>, className);
const Users = ({ className }: P) => S(<><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.9-3.3 3.4-5 6.5-5s5.6 1.7 6.5 5" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.2 15.4c1.6.8 2.7 2.4 3.3 4.6" /></>, className);
const Play = ({ className }: P) => S(<path d="M8 5.5v13l10.5-6.5L8 5.5Z" />, className, true);
const Save = ({ className }: P) => S(<><path d="M4 5h11M4 10h11M4 15h7" /><path d="M17 13v8M13 17h8" /></>, className);
const Remix = ({ className }: P) => S(<><path d="M4 7h11l-3-3M20 17H9l3 3" /><path d="M20 7v3M4 17v-3" /></>, className);
const Menu = ({ className }: P) => S(<path d="M4 6h16M4 12h16M4 18h16" />, className);
const Bell = ({ className }: P) => S(<><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>, className);
const Compass = ({ className }: P) => S(<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>, className);

// --- Briques communes ------------------------------------------------------

function Avatar({ post, size, ring }: { post: PreviewPost; size: number; ring?: "instagram" | "white" }) {
  const inner = post.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
  ) : (
    <span className="flex h-full w-full items-center justify-center rounded-full bg-[#3a3b3c] font-semibold text-white" style={{ fontSize: size * 0.42 }}>
      {(post.accountName || "N").charAt(0).toUpperCase()}
    </span>
  );
  if (ring === "instagram") {
    return (
      <span className="block shrink-0 rounded-full p-[2px]" style={{ width: size, height: size, background: "linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)" }}>
        <span className="block h-full w-full rounded-full bg-black p-[2px]">{inner}</span>
      </span>
    );
  }
  return (
    <span className={clsx("block shrink-0 rounded-full", ring === "white" && "border-2 border-white")} style={{ width: size, height: size }}>
      {inner}
    </span>
  );
}

function Media({ post, className, controls = false, fit = "cover" }: { post: PreviewPost; className?: string; controls?: boolean; fit?: "cover" | "contain" }) {
  const { asset } = post;
  if (!asset) {
    return (
      <div className={clsx("flex items-center justify-center bg-[#1c1c1e] text-[13px] text-white/40", className)}>
        <span className="px-6 text-center">Votre média apparaîtra ici</span>
      </div>
    );
  }
  const fitClass = fit === "cover" ? "object-cover" : "object-contain";
  return asset.type === "VIDEO" ? (
    <video
      key={asset.id}
      src={asset.previewUrl}
      poster={asset.thumbnailUrl}
      className={clsx("bg-black", fitClass, className)}
      muted={!controls}
      autoPlay={!controls}
      loop={!controls}
      playsInline
      controls={controls}
      onLoadedMetadata={(e) => post.onMediaShape(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={asset.id} src={asset.previewUrl} alt="" className={clsx("bg-black", fitClass, className)} onLoad={(e) => post.onMediaShape(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
  );
}

/** Légende avec #hashtags et @mentions colorés, tronquée façon réseau. */
function Caption({ text, limit, tagClass, moreLabel, prefix }: { text: string; limit: number; tagClass: string; moreLabel: string; prefix?: ReactNode }) {
  const clean = text.trim();
  const truncated = clean.length > limit;
  const shown = truncated ? clean.slice(0, limit).replace(/\s+\S*$/, "") : clean;
  const parts = shown.split(/([#@][\p{L}\p{N}_]+)/u);
  return (
    <span className="whitespace-pre-wrap break-words">
      {prefix}
      {parts.map((part, i) => (/^[#@]/.test(part) ? <span key={i} className={tagClass}>{part}</span> : <span key={i}>{part}</span>))}
      {truncated && <span className="opacity-60">… {moreLabel}</span>}
    </span>
  );
}

const PLACEHOLDER_CAPTION = "Votre légende apparaîtra ici au fil de la saisie…";

// ============================================================================
// INSTAGRAM (mode sombre)
// ============================================================================

function InstagramFeedPost({ post, width }: { post: PreviewPost; width?: number }) {
  const ratio = post.shape === "landscape" ? "aspect-[1.91/1]" : post.shape === "square" ? "aspect-square" : "aspect-[4/5]";
  return (
    <article className="bg-black text-[14px] text-[#f5f5f5]" style={width ? { width } : undefined}>
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar post={post} size={32} ring="instagram" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13.5px] font-semibold">{post.handle}</p>
        </div>
        <Dots className="h-5 w-5" />
      </header>
      <Media post={post} className={clsx("w-full", ratio)} />
      <div className="px-3 pt-2.5">
        <div className="flex items-center gap-4">
          <Heart className="h-[26px] w-[26px]" />
          <Comment className="h-[25px] w-[25px]" />
          <Plane className="h-[24px] w-[24px]" />
          <span className="flex-1" />
          <Bookmark className="h-[25px] w-[25px]" />
        </div>
        <p className="mt-2 text-[13.5px] font-semibold">1 248 J&apos;aime</p>
        <p className="mt-1 text-[13.5px] leading-snug">
          <Caption text={post.caption || PLACEHOLDER_CAPTION} limit={125} tagClass="text-[#e0f1ff]" moreLabel="plus" prefix={<span className="mr-1.5 font-semibold">{post.handle}</span>} />
        </p>
        <p className="mt-1.5 text-[13.5px] text-[#a8a8a8]">Voir les 36 commentaires</p>
        <p className="mt-1 pb-3 text-[11px] uppercase tracking-wide text-[#a8a8a8]">À l&apos;instant</p>
      </div>
    </article>
  );
}

/** Reel : vidéo plein écran 9:16 et commandes superposées. */
function InstagramReel({ post, desktop = false }: { post: PreviewPost; desktop?: boolean }) {
  return (
    <div className={clsx("relative overflow-hidden bg-black text-white", desktop ? "h-full rounded-lg" : "h-full w-full")} style={desktop ? { aspectRatio: "9/16" } : undefined}>
      <Media post={post} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
      {!desktop && (
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-4 pt-3 text-[20px] font-bold">
          Reels <Search className="h-6 w-6" />
        </div>
      )}
      <div className="absolute bottom-4 right-3 flex flex-col items-center gap-5 text-[12px] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">
        <span className="flex flex-col items-center gap-1"><Heart className="h-7 w-7" />12,4 k</span>
        <span className="flex flex-col items-center gap-1"><Comment className="h-7 w-7" />348</span>
        <span className="flex flex-col items-center gap-1"><Plane className="h-7 w-7" />1 024</span>
        <Dots className="h-6 w-6" />
        <span className="h-7 w-7 overflow-hidden rounded-md border-2 border-white"><Avatar post={post} size={24} /></span>
      </div>
      <div className="absolute bottom-4 left-3 right-16 space-y-2 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
        <div className="flex items-center gap-2">
          <Avatar post={post} size={30} />
          <span className="truncate text-[13.5px] font-semibold">{post.handle}</span>
          <span className="rounded-lg border border-white/80 px-2.5 py-0.5 text-[12.5px] font-semibold">Suivre</span>
        </div>
        <p className="text-[13.5px] leading-snug">
          <Caption text={post.caption || PLACEHOLDER_CAPTION} limit={60} tagClass="font-semibold" moreLabel="plus" />
        </p>
        <p className="flex items-center gap-1.5 text-[12.5px]"><Music className="h-3.5 w-3.5" /> <span className="truncate">{post.handle} · Son original</span></p>
      </div>
    </div>
  );
}

function InstagramMobile({ post }: { post: PreviewPost }) {
  const isReel = post.asset?.type === "VIDEO";
  return (
    <div className="flex h-full flex-col bg-black">
      {isReel ? (
        <div className="relative min-h-0 flex-1"><InstagramReel post={post} /></div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-2 text-white">
            <span className="font-['Brush_Script_MT',cursive] text-[28px] italic leading-none">Instagram</span>
            <span className="flex gap-5"><Heart className="h-6 w-6" /><Plane className="h-6 w-6" /></span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto"><InstagramFeedPost post={post} /></div>
        </>
      )}
      <nav className="flex items-center justify-around border-t border-white/10 bg-black py-2.5 text-white">
        <Home className="h-6 w-6" />
        <Search className="h-6 w-6" />
        <PlusSquare className="h-6 w-6" />
        <Reels className="h-6 w-6" />
        <Avatar post={post} size={24} />
      </nav>
    </div>
  );
}

function InstagramDesktop({ post }: { post: PreviewPost }) {
  const isReel = post.asset?.type === "VIDEO";
  const nav: [ReactNode, string][] = [
    [<Home key="h" className="h-6 w-6" />, "Accueil"],
    [<Search key="s" className="h-6 w-6" />, "Recherche"],
    [<Compass key="c" className="h-6 w-6" />, "Découvrir"],
    [<Reels key="r" className="h-6 w-6" />, "Reels"],
    [<Plane key="p" className="h-6 w-6" />, "Messages"],
    [<Heart key="n" className="h-6 w-6" />, "Notifications"],
    [<PlusSquare key="c2" className="h-6 w-6" />, "Créer"]
  ];
  return (
    <div className="flex h-full bg-black text-white">
      <aside className="w-[220px] shrink-0 border-r border-white/10 px-4 py-6">
        <p className="mb-8 px-2 font-['Brush_Script_MT',cursive] text-[28px] italic">Instagram</p>
        <ul className="space-y-1.5">
          {nav.map(([icon, label], i) => (
            <li key={label} className={clsx("flex items-center gap-4 rounded-lg px-2 py-2.5 text-[15px]", i === (isReel ? 3 : 0) && "font-bold")}>
              {icon}
              {label}
            </li>
          ))}
          <li className="flex items-center gap-4 rounded-lg px-2 py-2.5 text-[15px]"><Avatar post={post} size={24} />Profil</li>
        </ul>
      </aside>
      <main className="flex min-w-0 flex-1 justify-center overflow-hidden pt-6">
        {isReel ? (
          <div className="flex h-[calc(100%-24px)] items-end gap-4">
            <InstagramReel post={post} desktop />
          </div>
        ) : (
          <div className="w-[470px] overflow-y-auto">
            <InstagramFeedPost post={post} width={470} />
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// FACEBOOK (mode sombre)
// ============================================================================

function FacebookPostCard({ post, rounded }: { post: PreviewPost; rounded?: boolean }) {
  const ratio = post.shape === "portrait" ? "aspect-[4/5]" : post.shape === "square" ? "aspect-square" : "aspect-video";
  return (
    <article className={clsx("bg-[#242526] text-[15px] text-[#e4e6eb]", rounded && "overflow-hidden rounded-lg")}>
      <header className="flex items-center gap-2.5 px-4 pt-3">
        <Avatar post={post} size={40} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold">{post.accountName}</p>
          <p className="flex items-center gap-1 text-[13px] text-[#b0b3b8]">À l&apos;instant · <Globe className="h-3 w-3" /></p>
        </div>
        <Dots className="h-5 w-5 text-[#b0b3b8]" />
      </header>
      <p className="px-4 py-3 text-[15px] leading-snug">
        <Caption text={post.caption || PLACEHOLDER_CAPTION} limit={260} tagClass="font-semibold text-[#4599ff]" moreLabel="Voir plus" />
      </p>
      <Media post={post} className={clsx("w-full", ratio)} />
      <div className="flex items-center justify-between px-4 py-2.5 text-[13.5px] text-[#b0b3b8]">
        <span className="flex items-center gap-1.5">
          <span className="flex -space-x-1">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#2078f4] ring-2 ring-[#242526]"><ThumbUp className="h-2.5 w-2.5 text-white" fill /></span>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#f33e58] ring-2 ring-[#242526]"><Heart className="h-2.5 w-2.5 text-white" fill /></span>
          </span>
          128
        </span>
        <span>24 commentaires · 5 partages</span>
      </div>
      <div className="mx-4 flex items-center justify-around border-t border-white/10 py-1.5 text-[14.5px] font-semibold text-[#b0b3b8]">
        <span className="flex items-center gap-2 py-1.5"><ThumbUp className="h-5 w-5" /> J&apos;aime</span>
        <span className="flex items-center gap-2 py-1.5"><Comment className="h-5 w-5" /> Commenter</span>
        <span className="flex items-center gap-2 py-1.5"><ShareOut className="h-5 w-5" /> Partager</span>
      </div>
    </article>
  );
}

function FacebookMobile({ post }: { post: PreviewPost }) {
  return (
    <div className="flex h-full flex-col bg-[#18191a]">
      <div className="flex items-center justify-between bg-[#242526] px-4 py-2.5">
        <span className="text-[28px] font-bold tracking-tight text-[#e4e6eb]">facebook</span>
        <span className="flex gap-2 text-[#e4e6eb]">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3a3b3c]"><PlusSquare className="h-5 w-5" /></span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3a3b3c]"><Search className="h-5 w-5" /></span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3a3b3c]"><Comment className="h-5 w-5" /></span>
        </span>
      </div>
      <nav className="flex items-center justify-around border-b border-white/10 bg-[#242526] pb-2 pt-1 text-[#b0b3b8]">
        <Home className="h-6 w-6 text-[#2d88ff]" />
        <Users className="h-6 w-6" />
        <Play className="h-6 w-6" />
        <Bell className="h-6 w-6" />
        <Menu className="h-6 w-6" />
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto pt-2">
        <FacebookPostCard post={post} />
      </div>
    </div>
  );
}

function FacebookDesktop({ post }: { post: PreviewPost }) {
  return (
    <div className="flex h-full flex-col bg-[#18191a] text-[#e4e6eb]">
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#242526] px-4 py-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0866ff] text-[26px] font-bold text-white">f</span>
        <span className="flex h-10 w-60 items-center gap-2 rounded-full bg-[#3a3b3c] px-3 text-[15px] text-[#b0b3b8]"><Search className="h-4 w-4" />Rechercher sur Facebook</span>
        <span className="flex flex-1 justify-center gap-16 text-[#b0b3b8]">
          <Home className="h-7 w-7 text-[#2d88ff]" />
          <Play className="h-7 w-7" />
          <Users className="h-7 w-7" />
        </span>
        <Avatar post={post} size={40} />
      </header>
      <div className="flex min-h-0 flex-1 gap-6 px-4 pt-4">
        <aside className="w-[220px] shrink-0 space-y-3 text-[15px]">
          <p className="flex items-center gap-3 font-semibold"><Avatar post={post} size={32} />{post.accountName}</p>
          {["Amis", "Groupes", "Marketplace", "Vidéos", "Souvenirs"].map((l) => (
            <p key={l} className="flex items-center gap-3"><span className="h-8 w-8 rounded-full bg-[#3a3b3c]" />{l}</p>
          ))}
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-[500px]"><FacebookPostCard post={post} rounded /></div>
        </main>
        <aside className="w-[220px] shrink-0 space-y-3 text-[15px] text-[#b0b3b8]">
          <p className="font-semibold">Sponsorisé</p>
          <div className="h-24 rounded-lg bg-[#242526]" />
          <p className="pt-2 font-semibold">Contacts</p>
          {[1, 2, 3].map((i) => (
            <p key={i} className="flex items-center gap-3"><span className="h-8 w-8 rounded-full bg-[#3a3b3c]" /><span className="h-3 w-24 rounded bg-[#3a3b3c]" /></p>
          ))}
        </aside>
      </div>
    </div>
  );
}

// ============================================================================
// TIKTOK
// ============================================================================

function TikTokActions({ post, big }: { post: PreviewPost; big?: boolean }) {
  const icon = big ? "h-7 w-7" : "h-8 w-8";
  const bubble = big ? "flex h-12 w-12 items-center justify-center rounded-full bg-white/10" : "";
  return (
    <div className={clsx("flex flex-col items-center text-[12px] font-semibold text-white", big ? "gap-4" : "gap-4 [text-shadow:0_1px_3px_rgba(0,0,0,.5)]")}>
      {!big && (
        <span className="relative mb-2">
          <Avatar post={post} size={46} ring="white" />
          <span className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#fe2c55] text-[14px] leading-none">+</span>
        </span>
      )}
      <span className="flex flex-col items-center gap-1"><span className={bubble}><Heart className={icon} fill /></span>12,4 k</span>
      <span className="flex flex-col items-center gap-1"><span className={bubble}><Comment className={icon} /></span>348</span>
      <span className="flex flex-col items-center gap-1"><span className={bubble}><Bookmark className={icon} fill /></span>902</span>
      <span className="flex flex-col items-center gap-1"><span className={bubble}><Share className={icon} /></span>1 024</span>
      {!big && (
        <span className="mt-1 flex h-11 w-11 animate-[spin_6s_linear_infinite] items-center justify-center rounded-full bg-[conic-gradient(#222,#555,#222,#555,#222)]">
          <Avatar post={post} size={22} />
        </span>
      )}
    </div>
  );
}

function TikTokMobile({ post }: { post: PreviewPost }) {
  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Media post={post} className="absolute inset-0 h-full w-full" fit={post.shape === "portrait" ? "cover" : "contain"} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" />
        <div className="absolute left-0 right-0 top-0 flex items-center justify-center gap-5 pt-3 text-[16px] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">
          <span className="text-white/60">Abonnements</span>
          <span className="border-b-2 border-white pb-1">Pour toi</span>
          <Search className="absolute right-4 top-3 h-6 w-6" />
        </div>
        <div className="absolute bottom-4 right-2.5"><TikTokActions post={post} /></div>
        <div className="absolute bottom-4 left-3 right-20 space-y-1.5 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
          <p className="text-[15px] font-semibold">{post.accountName}</p>
          <p className="text-[14px] leading-snug">
            <Caption text={post.caption || PLACEHOLDER_CAPTION} limit={80} tagClass="font-semibold" moreLabel="plus" />
          </p>
          <p className="flex items-center gap-1.5 text-[13px]"><Music className="h-3.5 w-3.5" /> <span className="truncate">son original - {post.accountName}</span></p>
        </div>
      </div>
      <nav className="flex items-center justify-around bg-black pb-2 pt-2 text-[10px]">
        <span className="flex flex-col items-center gap-0.5"><Home className="h-6 w-6" />Accueil</span>
        <span className="flex flex-col items-center gap-0.5 text-white/70"><Users className="h-6 w-6" />Amis</span>
        <span className="flex h-8 w-12 items-center justify-center rounded-lg bg-white text-[22px] font-bold text-black shadow-[-3px_0_0_#25f4ee,3px_0_0_#fe2c55]">+</span>
        <span className="flex flex-col items-center gap-0.5 text-white/70"><Inbox className="h-6 w-6" />Boîte</span>
        <span className="flex flex-col items-center gap-0.5 text-white/70"><User className="h-6 w-6" />Profil</span>
      </nav>
    </div>
  );
}

function TikTokDesktop({ post }: { post: PreviewPost }) {
  const nav: [ReactNode, string][] = [
    [<Home key="h" className="h-6 w-6" />, "Pour toi"],
    [<Compass key="c" className="h-6 w-6" />, "Explorer"],
    [<Users key="u" className="h-6 w-6" />, "Abonnements"],
    [<Play key="l" className="h-6 w-6" />, "LIVE"],
    [<User key="p" className="h-6 w-6" />, "Profil"]
  ];
  return (
    <div className="flex h-full bg-[#121212] text-white">
      <aside className="w-[220px] shrink-0 px-4 py-5">
        <p className="mb-6 text-[26px] font-extrabold tracking-tight">TikTok</p>
        <span className="mb-5 flex h-10 items-center gap-2 rounded-full bg-white/10 px-3 text-[14px] text-white/50"><Search className="h-4 w-4" />Rechercher</span>
        <ul className="space-y-1">
          {nav.map(([icon, label], i) => (
            <li key={label} className={clsx("flex items-center gap-3 rounded-lg px-2 py-2.5 text-[16px] font-semibold", i === 0 && "text-[#fe2c55]")}>
              {icon}
              {label}
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex min-w-0 flex-1 items-center justify-center gap-4 py-5">
        <div className="relative h-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "9/16" }}>
          <Media post={post} className="absolute inset-0 h-full w-full" fit={post.shape === "portrait" ? "cover" : "contain"} />
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-gradient-to-t from-black/70 to-transparent p-4 pt-16">
            <p className="text-[15px] font-semibold">{post.accountName}</p>
            <p className="text-[14px] leading-snug"><Caption text={post.caption || PLACEHOLDER_CAPTION} limit={100} tagClass="font-semibold" moreLabel="plus" /></p>
            <p className="flex items-center gap-1.5 text-[13px]"><Music className="h-3.5 w-3.5" />son original - {post.accountName}</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 self-end pb-2">
          <span className="relative mb-2"><Avatar post={post} size={48} /><span className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#fe2c55] text-[14px] leading-none">+</span></span>
          <TikTokActions post={post} big />
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// YOUTUBE (mode sombre) — Shorts pour les vidéos verticales, page vidéo sinon
// ============================================================================

function YoutubeShorts({ post, desktop }: { post: PreviewPost; desktop?: boolean }) {
  const actions = (
    <div className="flex flex-col items-center gap-5 text-[12px] font-medium text-white">
      {[
        [<ThumbUp key="l" className="h-6 w-6" fill />, "1,2 k"],
        [<ThumbDown key="d" className="h-6 w-6" />, "Je n'aime pas"],
        [<Comment key="c" className="h-6 w-6" />, "48"],
        [<Share key="s" className="h-6 w-6" />, "Partager"],
        [<Remix key="r" className="h-6 w-6" />, "Remix"]
      ].map(([icon, label], i) => (
        <span key={i} className="flex flex-col items-center gap-1">
          <span className={clsx("flex h-12 w-12 items-center justify-center rounded-full", desktop ? "bg-white/10" : "bg-black/30")}>{icon}</span>
          {label}
        </span>
      ))}
      <span className="h-10 w-10 overflow-hidden rounded-lg border-2 border-white/80"><Avatar post={post} size={36} /></span>
    </div>
  );
  const video = (
    <div className={clsx("relative overflow-hidden bg-black text-white", desktop ? "h-full rounded-xl" : "h-full w-full")} style={desktop ? { aspectRatio: "9/16" } : undefined}>
      <Media post={post} className="absolute inset-0 h-full w-full" fit={post.shape === "portrait" ? "cover" : "contain"} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      {!desktop && <div className="absolute bottom-6 right-2">{actions}</div>}
      <div className={clsx("absolute bottom-5 left-3 space-y-2", desktop ? "right-3" : "right-20")}>
        <div className="flex items-center gap-2">
          <Avatar post={post} size={32} />
          <span className="truncate text-[14px] font-semibold">@{post.handle}</span>
          <span className="rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-black">S&apos;abonner</span>
        </div>
        <p className="text-[14px] leading-snug">{post.title || post.caption || "Titre de votre Short"}</p>
      </div>
    </div>
  );
  if (desktop) {
    return (
      <div className="flex h-full items-end justify-center gap-3 py-4">
        {video}
        {actions}
      </div>
    );
  }
  return video;
}

function YoutubeWatchInfo({ post, compact }: { post: PreviewPost; compact?: boolean }) {
  return (
    <div className={clsx("space-y-3 text-[#f1f1f1]", compact ? "px-3 pt-3" : "pt-3")}>
      <h3 className={clsx("font-bold leading-snug", compact ? "text-[18px]" : "text-[20px]")}>{post.title || "Titre de votre vidéo"}</h3>
      {compact && <p className="text-[12px] text-[#aaa]">0 vue · il y a 1 minute <span className="font-semibold text-white">…plus</span></p>}
      <div className="flex items-center gap-3">
        <Avatar post={post} size={40} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold">{post.accountName}</p>
          <p className="text-[12px] text-[#aaa]">12,4 k abonnés</p>
        </div>
        <span className="rounded-full bg-[#f1f1f1] px-4 py-2 text-[14px] font-semibold text-[#0f0f0f]">S&apos;abonner</span>
        {!compact && <span className="flex-1" />}
        {!compact && (
          <span className="flex gap-2 text-[14px] font-semibold">
            <span className="flex items-center overflow-hidden rounded-full bg-white/10">
              <span className="flex items-center gap-2 border-r border-white/20 px-4 py-2"><ThumbUp className="h-5 w-5" />1,2 k</span>
              <span className="px-3 py-2"><ThumbDown className="h-5 w-5" /></span>
            </span>
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><ShareOut className="h-5 w-5" />Partager</span>
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><Save className="h-5 w-5" />Enregistrer</span>
          </span>
        )}
      </div>
      {compact && (
        <div className="flex gap-2 overflow-hidden text-[13px] font-semibold">
          <span className="flex shrink-0 items-center overflow-hidden rounded-full bg-white/10">
            <span className="flex items-center gap-1.5 border-r border-white/20 px-3 py-1.5"><ThumbUp className="h-4 w-4" />1,2 k</span>
            <span className="px-2.5 py-1.5"><ThumbDown className="h-4 w-4" /></span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><ShareOut className="h-4 w-4" />Partager</span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Save className="h-4 w-4" />Enregistrer</span>
        </div>
      )}
      <div className="rounded-xl bg-white/10 p-3 text-[14px]">
        {!compact && <p className="font-semibold">0 vue · il y a 1 minute</p>}
        <p className={clsx("leading-snug", !compact && "mt-1")}>
          <Caption text={post.caption || "La description de votre vidéo apparaîtra ici."} limit={compact ? 90 : 220} tagClass="text-[#3ea6ff]" moreLabel="plus" />
        </p>
      </div>
    </div>
  );
}

function YoutubeMobile({ post }: { post: PreviewPost }) {
  if (post.shape === "portrait" && post.asset?.type === "VIDEO") {
    return (
      <div className="flex h-full flex-col bg-black">
        <div className="relative min-h-0 flex-1"><YoutubeShorts post={post} /></div>
        <YoutubeMobileNav />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col bg-[#0f0f0f]">
      <Media post={post} className="aspect-video w-full" controls fit="contain" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-3"><YoutubeWatchInfo post={post} compact /></div>
      <YoutubeMobileNav />
    </div>
  );
}

function YoutubeMobileNav() {
  return (
    <nav className="flex items-center justify-around border-t border-white/10 bg-[#0f0f0f] py-2 text-[10px] text-white">
      <span className="flex flex-col items-center gap-0.5"><Home className="h-6 w-6" />Accueil</span>
      <span className="flex flex-col items-center gap-0.5"><Play className="h-6 w-6" />Shorts</span>
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 text-[22px] leading-none">+</span>
      <span className="flex flex-col items-center gap-0.5"><Reels className="h-6 w-6" />Abonnements</span>
      <span className="flex flex-col items-center gap-0.5"><User className="h-6 w-6" />Vous</span>
    </nav>
  );
}

function YoutubeDesktop({ post }: { post: PreviewPost }) {
  const isShort = post.shape === "portrait" && post.asset?.type === "VIDEO";
  return (
    <div className="flex h-full flex-col bg-[#0f0f0f] text-white">
      <header className="flex items-center gap-4 px-4 py-2.5">
        <Menu className="h-6 w-6" />
        <span className="flex items-center gap-1 text-[20px] font-bold tracking-tight">
          <span className="flex h-6 w-8 items-center justify-center rounded-md bg-[#ff0000]"><Play className="h-4 w-4 text-white" /></span>
          YouTube
        </span>
        <span className="mx-auto flex h-10 w-[420px] items-center justify-between rounded-full border border-white/20 pl-4 text-[15px] text-white/50">
          Rechercher<span className="flex h-full w-14 items-center justify-center rounded-r-full bg-white/10"><Search className="h-5 w-5 text-white" /></span>
        </span>
        <Avatar post={post} size={32} />
      </header>
      {isShort ? (
        <div className="min-h-0 flex-1"><YoutubeShorts post={post} desktop /></div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-6 overflow-hidden px-6 pt-2">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <Media post={post} className="aspect-video w-full rounded-xl" controls fit="contain" />
            <YoutubeWatchInfo post={post} />
          </div>
          <aside className="w-[300px] shrink-0 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-2">
                <span className="aspect-video w-[150px] shrink-0 rounded-lg bg-white/10" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="block h-3 w-full rounded bg-white/10" />
                  <span className="block h-3 w-2/3 rounded bg-white/10" />
                  <span className="block h-2.5 w-1/2 rounded bg-white/5" />
                </span>
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}

// ============================================================================

export function NetworkPreviewUi({ post, device }: { post: PreviewPost; device: PreviewDevice }) {
  switch (post.network) {
    case "INSTAGRAM":
      return device === "mobile" ? <InstagramMobile post={post} /> : <InstagramDesktop post={post} />;
    case "FACEBOOK":
      return device === "mobile" ? <FacebookMobile post={post} /> : <FacebookDesktop post={post} />;
    case "TIKTOK":
      return device === "mobile" ? <TikTokMobile post={post} /> : <TikTokDesktop post={post} />;
    case "YOUTUBE":
      return device === "mobile" ? <YoutubeMobile post={post} /> : <YoutubeDesktop post={post} />;
  }
}

/** Adresse affichée dans la barre du navigateur (mode ordinateur). */
export const NETWORK_WEB_ADDRESS: Record<Network, string> = {
  INSTAGRAM: "instagram.com",
  FACEBOOK: "facebook.com",
  TIKTOK: "tiktok.com/foryou",
  YOUTUBE: "youtube.com/watch"
};
