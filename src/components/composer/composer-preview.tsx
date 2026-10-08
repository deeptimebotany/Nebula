"use client";

// Aperçu de la page Publier — refonte V2 (07/10/2026, maquettes A, B, D, E
// de Lucas) : le téléphone reste le seul bloc « encadré » de la page.
//   - En haut : « APERÇU » puis un onglet par réseau choisi, et à droite
//     « masquer ». Depuis le 08/10/2026 (demande de Lucas), chaque onglet
//     montre le logo du réseau (officiel quand ses règles le permettent, voir
//     NetworkTile) au lieu de son nom : l'onglet actif est souligné en
//     violet, le nom reste lu par les lecteurs d'écran et affiché au survol.
//   - Dans le cadre : l'imitation de l'interface du réseau (voir
//     preview-network-ui.tsx), dans un téléphone plus petit qu'avant
//     (300 px de large au plus) ou une fenêtre de navigateur.
//   - Deux présentations : « docked » (colonne de droite, collée en haut
//     pendant qu'on rédige) et « floating » (carte flottante des petits
//     écrans, maquette E, ouverte par le bouton « Aperçu »).
// Purement présentationnel : tout l'état de la publication vit dans la page.

import { useAvailableNetworks } from "@/lib/use-available-networks";
import { useEffect, useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { clsx } from "@/lib/clsx";
import { createPortal } from "react-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { NetworkTile } from "@/components/ui/network-badge";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { FORMAT_LABEL, type PostFormat } from "@/lib/social/post-format";
import type { UploadedAsset } from "./composer-types";
import { NETWORK_WEB_ADDRESS, NetworkPreviewUi, PreviewSoundButton, type MediaShape, type PreviewDevice, type PreviewPost } from "./preview-network-ui";
import { MotionRoot } from "@/components/motion/motion-root";
import { BrowserFrame, PhoneFrame, ScaledFrame } from "./preview-frames";
import { getPref, setPref } from "@/lib/ui-prefs-client";
import { IconClose, IconEyeOff } from "@/components/dashboard/icons";

export interface PreviewAccount {
  name: string;
  handle: string;
  avatarUrl: string | null;
}

interface ComposerPreviewProps {
  network: Network;
  selectedNetworks: Network[];
  onPickNetwork: (network: Network) => void;
  /** Compte affiché pour chaque réseau (compte connecté choisi, sinon la marque). */
  accountFor: (network: Network) => PreviewAccount;
  asset: UploadedAsset | undefined;
  title: string;
  caption: string;
  aspectClass: string;
  onAspectClass: (cls: string) => void;
  showInstagramGrid: boolean;
  onToggleInstagramGrid: () => void;
  instagramGridTiles: { imageUrl: string | null }[];
  gridLoading: boolean;
  /** Aperçu collé en haut de la colonne : le cadre tient dans la hauteur de la fenêtre. */
  sticky?: boolean;
  /** Collaborateurs Instagram choisis dans Publier (01/10/2026). */
  instagramCollaborators?: string[];
  /** Format choisi par réseau (Publication, Reel, Story — 07/10/2026). */
  formatFor?: (network: Network) => PostFormat | null;
  /** Présentation : colonne de droite (défaut) ou carte flottante (petit écran). */
  variant?: "docked" | "floating";
  /** « Masquer l'aperçu » (colonne) ou fermer la carte flottante. */
  onHide?: () => void;
  /** Format affiché sous le téléphone quand le réseau le décide (ex. « Short »). */
  kindLabel?: string | null;
  /** Proportions du média (« 9:16 »), lues par la page. */
  ratioLabel?: string | null;
}

function aspectFor(w: number, h: number): string {
  return h > w ? "aspect-[9/16]" : w > h ? "aspect-video" : "aspect-square";
}

function shapeOf(aspectClass: string): MediaShape {
  return aspectClass === "aspect-[9/16]" ? "portrait" : aspectClass === "aspect-video" ? "landscape" : "square";
}

const RATIO_LABEL: Record<MediaShape, string> = { portrait: "9:16", landscape: "16:9", square: "1:1" };

const DEVICE_KEY = "nebula:composer-preview-device";

// Dimensions « réelles » des cadres, avant réduction.
const FRAME = {
  mobile: { width: 390, height: 820 },
  desktop: { width: 1200, height: 760 },
  // Vue Ordinateur dans la colonne (hors plein écran) : seulement l'écran du
  // lecteur et ses éléments (titre, compte, actions), sans les menus et
  // colonnes latérales du site — voir .nb-preview-focus dans globals.css.
  desktopFocus: { width: 820, height: 760 }
} as const;

// Ordre des onglets quand aucun réseau n'est choisi : TikTok en premier.
const PREVIEW_ORDER: Network[] = ["TIKTOK", ...NETWORKS.filter((n) => n !== "TIKTOK")];

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" strokeLinecap="round" />
    </svg>
  );
}

function DesktopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </svg>
  );
}

const ICON_BUTTON = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[color:var(--nb-hover)] hover:text-white";

export function ComposerPreview({
  network,
  selectedNetworks,
  onPickNetwork,
  accountFor,
  asset,
  title,
  caption,
  aspectClass,
  onAspectClass,
  showInstagramGrid,
  onToggleInstagramGrid,
  instagramGridTiles,
  gridLoading,
  sticky = false,
  instagramCollaborators,
  formatFor,
  variant = "docked",
  onHide,
  kindLabel,
  ratioLabel
}: ComposerPreviewProps) {
  const offeredNetworks = useAvailableNetworks();
  const [device, setDevice] = useState<PreviewDevice>("mobile");
  const [expanded, setExpanded] = useState(false);
  const floating = variant === "floating";

  // Dernier mode choisi (Mobile / Ordinateur), mémorisé dans ce navigateur.
  useEffect(() => {
    try {
      const saved = getPref(DEVICE_KEY);
      if (saved === "mobile" || saved === "desktop") setDevice(saved);
    } catch {
      // stockage indisponible : on reste en mobile
    }
  }, []);
  function pickDevice(next: PreviewDevice) {
    setDevice(next);
    try {
      setPref(DEVICE_KEY, next);
    } catch {
      // sans gravité
    }
  }

  const account = accountFor(network);
  const format = formatFor?.(network) ?? null;
  const post: PreviewPost = {
    network,
    accountName: account.name,
    handle: account.handle,
    avatarUrl: account.avatarUrl,
    asset,
    title,
    caption,
    shape: shapeOf(aspectClass),
    onMediaShape: (w, h) => onAspectClass(aspectFor(w, h)),
    ...(network === "INSTAGRAM" && instagramCollaborators?.length ? { coAuthors: instagramCollaborators } : {}),
    format
  };

  // Plein écran : fermeture avec Échap, défilement de la page bloqué.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const renderFrame = (fullscreen = false) => {
    const focus = device === "desktop" && !fullscreen;
    const dims = focus ? FRAME.desktopFocus : FRAME[device];
    return (
      <ScaledFrame width={dims.width} height={dims.height} reservedHeight={fullscreen ? 120 : floating ? 260 : sticky ? 230 : undefined} maxScale={fullscreen ? 1.35 : 1}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${network}-${device}`} className="h-full w-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {device === "mobile" ? (
              <PhoneFrame>
                <NetworkPreviewUi post={post} device="mobile" />
              </PhoneFrame>
            ) : (
              <BrowserFrame address={NETWORK_WEB_ADDRESS[network]}>
                <div className={clsx("h-full", focus && "nb-preview-focus")}>
                  <NetworkPreviewUi post={post} device="desktop" />
                </div>
              </BrowserFrame>
            )}
          </motion.div>
        </AnimatePresence>
      </ScaledFrame>
    );
  };

  // Onglets : les réseaux choisis ; sans choix, ceux proposés (aperçu seulement).
  const tabs = selectedNetworks.length > 0 ? PREVIEW_ORDER.filter((n) => selectedNetworks.includes(n)) : PREVIEW_ORDER.filter((n) => offeredNetworks.includes(n));
  if (!tabs.includes(network)) tabs.push(network);

  const hideButton = onHide && (
    <button type="button" onClick={onHide} aria-label={floating ? "Fermer l'aperçu" : "Masquer l'aperçu"} title={floating ? "Fermer l'aperçu" : "Masquer l'aperçu"} className={ICON_BUTTON}>
      {floating ? <IconClose className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
    </button>
  );

  const tools = (
    <div className="flex shrink-0 items-center">
      {asset?.type === "VIDEO" && <PreviewSoundButton className="!h-8 !w-8 !rounded-lg" />}
      <button
        type="button"
        onClick={() => pickDevice(device === "mobile" ? "desktop" : "mobile")}
        aria-label={device === "mobile" ? "Aperçu sur ordinateur" : "Aperçu sur mobile"}
        title={device === "mobile" ? "Voir sur ordinateur" : "Voir sur mobile"}
        className={ICON_BUTTON}
      >
        {device === "mobile" ? <DesktopIcon className="h-4 w-4" /> : <PhoneIcon className="h-4 w-4" />}
      </button>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Quitter le plein écran" : "Agrandir l'aperçu en plein écran"} title="Plein écran" className={ICON_BUTTON}>
        <ExpandIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const tabBar = (
    <div className="flex min-w-0 items-center gap-2">
      <span className="nb-section-label shrink-0">Aperçu</span>
      <div role="tablist" aria-label="Réseau affiché dans l'aperçu" className="flex min-w-0 flex-1 overflow-x-auto">
        {tabs.map((n) => {
          const active = n === network;
          return (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onPickNetwork(n)}
              aria-label={NETWORK_META[n].label}
              title={selectedNetworks.includes(n) ? `Aperçu ${NETWORK_META[n].label}` : `Aperçu ${NETWORK_META[n].label} (non choisi pour cette publication)`}
              className={clsx("nb-preview-tab", active && "nb-preview-tab-active")}
            >
              <NetworkTile network={n} size={22} />
            </button>
          );
        })}
      </div>
    </div>
  );

  const notSelected = !selectedNetworks.includes(network);
  const shape = shapeOf(aspectClass);
  const footnote = notSelected
    ? `${NETWORK_META[network].label} n'est pas choisi pour cette publication : aperçu seulement.`
    : [kindLabel ?? (format ? FORMAT_LABEL[format] : null), asset ? (ratioLabel ?? RATIO_LABEL[shape]) : null, device === "mobile" ? "mobile" : "ordinateur"].filter(Boolean).join(" · ");

  return (
    <MotionRoot>
      <section aria-label="Aperçu de la publication" className={clsx(floating && "nb-popover rounded-2xl p-4")}>
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--nb-sep)]">
          {tabBar}
          {hideButton}
        </div>

        <div className={clsx("mx-auto mt-5", floating ? "max-w-[260px]" : "max-w-[300px]")}>{!expanded && renderFrame()}</div>

        {/* Sous le téléphone : format, et les réglages de l'aperçu (son, ordinateur, plein écran). */}
        <div className={clsx("mx-auto mt-3 flex items-center justify-between gap-2", floating ? "max-w-[260px]" : "max-w-[300px]")}>
          <p className="min-w-0 text-[12px] leading-snug text-slate-500">{footnote}</p>
          {tools}
        </div>

        {network === "INSTAGRAM" && asset && (
          <div className="mt-2 flex justify-center">
            <button type="button" onClick={onToggleInstagramGrid} aria-pressed={showInstagramGrid} className="text-[12px] text-slate-400 underline-offset-2 transition hover:text-white hover:underline">
              {showInstagramGrid ? "Masquer ma grille Instagram" : "Voir dans ma grille Instagram"}
            </button>
          </div>
        )}

        <AnimatePresence>
          {showInstagramGrid && network === "INSTAGRAM" && asset && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }} className="mx-auto mt-3 max-w-[300px]">
              <p className="mb-2 text-[11px] text-slate-500">Votre nouveau post (en surbrillance) intégré à vos {instagramGridTiles.length} dernières publications Instagram réelles.</p>
              {gridLoading ? (
                <div className="grid grid-cols-3 gap-1" aria-busy="true">
                  {Array.from({ length: 9 }, (_, i) => (
                    <Skeleton key={i} className="aspect-square rounded" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  <div className="relative aspect-square overflow-hidden rounded ring-2 ring-aurora-400">
                    {asset.type === "VIDEO" ? (
                      <video src={asset.previewUrl} className="h-full w-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={asset.previewUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  {instagramGridTiles.slice(0, 8).map((tile, i) => (
                    <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="aspect-square overflow-hidden rounded">
                      {tile.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={tile.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-white/[0.06] text-white/50" aria-label="Vidéo">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                            <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
                          </svg>
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!floating && <p className="mt-3 text-center text-[11px] text-slate-500">Rendu indicatif (compteurs d&apos;exemple) : la mise en page réelle peut varier légèrement.</p>}

        {/* Plein écran : le cadre occupe tout l'écran disponible, agrandi
            jusqu'à 135 % si la place le permet. */}
        {expanded &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b0b0d]/95 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Aperçu en plein écran">
              <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-6">
                <span className="hidden font-display text-sm font-medium text-white sm:block">Aperçu · {NETWORK_META[network].label}</span>
                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="group" aria-label="Réseau affiché dans l'aperçu">
                  {tabs.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onPickNetwork(n)}
                      aria-pressed={n === network}
                      className={clsx("flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition", n === network ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/[0.05] hover:text-white")}
                    >
                      {/* Bandeau toujours sombre : le dessin de Nebula reste lisible (un logo officiel noir disparaîtrait). */}
                      <NetworkTile network={n} size={20} drawn />
                      {NETWORK_META[n].label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => pickDevice(device === "mobile" ? "desktop" : "mobile")}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-sm text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
                >
                  {device === "mobile" ? "Ordinateur" : "Mobile"}
                </button>
                <button type="button" onClick={() => setExpanded(false)} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-sm text-slate-200 transition hover:bg-white/[0.06] hover:text-white">
                  Fermer <span className="hidden text-xs text-slate-500 sm:inline">Échap</span>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-8">{renderFrame(true)}</div>
            </div>,
            document.body
          )}
      </section>
    </MotionRoot>
  );
}
