"use client";

// Carte « Aperçu » de la page Publier — refonte du 24/09/2026 : rendu
// immersif et fidèle au réseau choisi.
//   - En haut à gauche : tous les réseaux (Instagram, Facebook, TikTok,
//     YouTube, Bluesky), pour passer instantanément de l'un à l'autre — même ceux qui
//     ne sont pas cochés pour la publication (signalé sous la barre).
//   - En haut à droite : bascule Mobile / Ordinateur, et « Agrandir ».
//   - Dans le cadre : une imitation de l'interface native du réseau (voir
//     preview-network-ui.tsx), dans un téléphone ou une fenêtre de
//     navigateur. Le cadre est dessiné à sa taille réelle puis réduit pour
//     tenir dans la colonne (ScaledFrame), comme une vraie capture d'écran.
// Purement présentationnel : tout l'état de la publication vit dans la page.

import { useAvailableNetworks } from "@/lib/use-available-networks";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "@/lib/clsx";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { Modal } from "@/components/ui/modal";
import { NetworkLogo } from "@/components/ui/network-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import type { UploadedAsset } from "./composer-types";
import { NETWORK_WEB_ADDRESS, NetworkPreviewUi, type MediaShape, type PreviewDevice, type PreviewPost } from "./preview-network-ui";

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
}

function aspectFor(w: number, h: number): string {
  return h > w ? "aspect-[9/16]" : w > h ? "aspect-video" : "aspect-square";
}

function shapeOf(aspectClass: string): MediaShape {
  return aspectClass === "aspect-[9/16]" ? "portrait" : aspectClass === "aspect-video" ? "landscape" : "square";
}

const DEVICE_KEY = "nebula:composer-preview-device";

// Dimensions « réelles » des cadres, avant réduction.
const FRAME = {
  mobile: { width: 390, height: 820 },
  desktop: { width: 1200, height: 760 }
} as const;

/** Dessine son contenu à sa taille réelle, puis le réduit pour tenir dans la largeur disponible. */
function ScaledFrame({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setAvailable(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = available ? Math.min(1, available / width) : 0;
  return (
    <div ref={ref} className="w-full">
      <div className="mx-auto" style={{ width: width * scale, height: height * scale, visibility: available ? "visible" : "hidden" }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-full rounded-[54px] bg-[#1b1b1e] p-[10px] shadow-[0_0_0_2px_#2c2c30,0_30px_60px_rgba(0,0,0,.45)]">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[44px] bg-black">
        <div className="relative flex h-[46px] shrink-0 items-center justify-between px-8 text-[15px] font-semibold text-white">
          <span>9:41</span>
          <span className="absolute left-1/2 top-[10px] h-[30px] w-[110px] -translate-x-1/2 rounded-full bg-black shadow-[0_0_0_1px_#111]" />
          <span className="flex items-center gap-1.5" aria-hidden="true">
            <svg viewBox="0 0 18 12" className="h-3 w-[18px]" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
            <svg viewBox="0 0 26 12" className="h-3 w-[26px]" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="22" height="11" rx="3" /><rect x="2.5" y="2.5" width="16" height="7" rx="1.5" fill="currentColor" /><path d="M24.5 4v4" strokeLinecap="round" /></svg>
          </span>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
        <div className="flex h-[26px] shrink-0 items-center justify-center bg-black">
          <span className="h-[5px] w-[130px] rounded-full bg-white/80" />
        </div>
      </div>
    </div>
  );
}

function BrowserFrame({ address, children }: { address: string; children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-[#2c2c30] bg-[#1b1b1e] shadow-[0_30px_60px_rgba(0,0,0,.45)]">
      <div className="flex h-11 shrink-0 items-center gap-3 px-4">
        <span className="flex gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto flex h-7 w-[460px] items-center justify-center gap-2 rounded-md bg-[#2a2a2e] text-[13px] text-white/60">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 1 1 8 0v3" /></svg>
          {address}
        </span>
        <span className="w-[52px]" />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

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
  gridLoading
}: ComposerPreviewProps) {
  const offeredNetworks = useAvailableNetworks();
  const [device, setDevice] = useState<PreviewDevice>("mobile");
  const [expanded, setExpanded] = useState(false);

  // Dernier mode choisi (Mobile / Ordinateur), mémorisé dans ce navigateur.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DEVICE_KEY);
      if (saved === "mobile" || saved === "desktop") setDevice(saved);
    } catch {
      // stockage indisponible : on reste en mobile
    }
  }, []);
  function pickDevice(next: PreviewDevice) {
    setDevice(next);
    try {
      localStorage.setItem(DEVICE_KEY, next);
    } catch {
      // sans gravité
    }
  }

  const account = accountFor(network);
  const post: PreviewPost = {
    network,
    accountName: account.name,
    handle: account.handle,
    avatarUrl: account.avatarUrl,
    asset,
    title,
    caption,
    shape: shapeOf(aspectClass),
    onMediaShape: (w, h) => onAspectClass(aspectFor(w, h))
  };

  const renderFrame = () => (
    <ScaledFrame width={FRAME[device].width} height={FRAME[device].height}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${network}-${device}`} className="h-full w-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {device === "mobile" ? (
            <PhoneFrame>
              <NetworkPreviewUi post={post} device="mobile" />
            </PhoneFrame>
          ) : (
            <BrowserFrame address={NETWORK_WEB_ADDRESS[network]}>
              <NetworkPreviewUi post={post} device="desktop" />
            </BrowserFrame>
          )}
        </motion.div>
      </AnimatePresence>
    </ScaledFrame>
  );

  const toolbar = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 gap-1 overflow-x-auto" role="group" aria-label="Réseau affiché dans l'aperçu">
        {NETWORKS.filter((n) => offeredNetworks.includes(n) || selectedNetworks.includes(n) || n === network).map((n) => {
          const active = n === network;
          const selected = selectedNetworks.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onPickNetwork(n)}
              aria-pressed={active}
              title={`Aperçu ${NETWORK_META[n].label}${selected ? "" : " (non sélectionné pour cette publication)"}`}
              className={clsx(
                "relative flex h-8 w-8 items-center justify-center rounded-lg border transition",
                active ? "border-aurora-400/60 bg-white/[0.08] text-white" : "border-transparent text-slate-500 hover:bg-white/[0.05] hover:text-white",
                !selected && !active && "opacity-60"
              )}
            >
              <NetworkLogo network={n} className="h-4 w-4" />
              {selected && <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-aurora-400" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Format de l'aperçu">
          {(
            [
              ["mobile", "Mobile", PhoneIcon],
              ["desktop", "Ordinateur", DesktopIcon]
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => pickDevice(key)}
              aria-pressed={device === key}
              title={`Aperçu ${label.toLowerCase()}`}
              className={clsx("flex h-7 w-8 items-center justify-center rounded-md transition", device === key ? "bg-white/10 text-white" : "text-slate-500 hover:text-white")}
            >
              <Icon className="h-4 w-4" />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Agrandir l'aperçu"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
        >
          <ExpandIcon className="h-4 w-4" />
          <span className="sr-only">Agrandir l&apos;aperçu</span>
        </button>
      </div>
    </div>
  );

  const notSelected = !selectedNetworks.includes(network);

  return (
    <MotionGlassCard glow>
      <h2 className="mb-2 font-display text-base font-medium text-white">Aperçu</h2>
      {toolbar}
      <p className="mb-3 mt-1.5 min-h-4 text-[11px] text-slate-500">
        {notSelected
          ? `${NETWORK_META[network].label} n'est pas coché pour cette publication — aperçu seulement.`
          : `${NETWORK_META[network].label} · ${device === "mobile" ? "application mobile" : "sur ordinateur"}`}
      </p>

      {!expanded && renderFrame()}

      {network === "INSTAGRAM" && asset && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={onToggleInstagramGrid}
            aria-pressed={showInstagramGrid}
            className={clsx(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
              showInstagramGrid ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300" : "border-white/10 text-slate-400 hover:text-white"
            )}
          >
            {showInstagramGrid ? "Masquer ma grille Instagram" : "Voir dans ma grille Instagram"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {showInstagramGrid && network === "INSTAGRAM" && asset && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
            className="mt-3"
          >
            <p className="mb-2 text-[11px] text-slate-500">
              Votre nouveau post (en surbrillance) intégré à vos {instagramGridTiles.length} dernières publications Instagram réelles.
            </p>
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
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></svg>
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-3 text-center text-[11px] text-slate-500">Rendu indicatif (compteurs d&apos;exemple) — la mise en page réelle peut varier légèrement.</p>

      <Modal open={expanded} onClose={() => setExpanded(false)} title="Aperçu" maxWidthClassName={device === "mobile" ? "max-w-md" : "max-w-6xl"}>
        {toolbar}
        <div className="mt-4">{expanded && renderFrame()}</div>
      </Modal>
    </MotionGlassCard>
  );
}
