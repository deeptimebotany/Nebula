"use client";

// Carte « Aperçu » de la page Publier : rendu indicatif du média, du titre
// et de la légende pour le réseau sélectionné, avec le simulateur
// d'interface TikTok et l'aperçu de grille Instagram. Extrait de
// composer/page.tsx au Lot 4 — purement présentationnel, tout l'état vit
// dans la page.
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "@/lib/clsx";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { NetworkDot } from "@/components/ui/network-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NETWORK_META, type Network } from "@/lib/types";
import { IconAvatar, IconHeart, IconMessage, IconSend } from "@/components/dashboard/icons";
import type { UploadedAsset } from "./composer-types";

interface ComposerPreviewProps {
  brandName: string;
  network: Network | null;
  selectedNetworks: Network[];
  onPickNetwork: (network: Network) => void;
  asset: UploadedAsset | undefined;
  title: string;
  caption: string;
  aspectClass: string;
  onAspectClass: (cls: string) => void;
  showTiktokUi: boolean;
  onToggleTiktokUi: () => void;
  showInstagramGrid: boolean;
  onToggleInstagramGrid: () => void;
  instagramGridTiles: { imageUrl: string }[];
  gridLoading: boolean;
}

function aspectFor(w: number, h: number): string {
  return h > w ? "aspect-[9/16]" : w > h ? "aspect-video" : "aspect-square";
}

export function ComposerPreview({
  brandName,
  network,
  selectedNetworks,
  onPickNetwork,
  asset,
  title,
  caption,
  aspectClass,
  onAspectClass,
  showTiktokUi,
  onToggleTiktokUi,
  showInstagramGrid,
  onToggleInstagramGrid,
  instagramGridTiles,
  gridLoading
}: ComposerPreviewProps) {
  return (
    <MotionGlassCard glow>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-medium text-white">Aperçu</h2>
        <div className="flex items-center gap-2">
          {network === "TIKTOK" && asset && (
            <button
              type="button"
              onClick={onToggleTiktokUi}
              aria-pressed={showTiktokUi}
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                showTiktokUi ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300" : "border-white/10 text-slate-500 hover:text-white"
              )}
            >
              Interface TikTok
            </button>
          )}
          {network === "INSTAGRAM" && asset && (
            <button
              type="button"
              onClick={onToggleInstagramGrid}
              aria-pressed={showInstagramGrid}
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                showInstagramGrid ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300" : "border-white/10 text-slate-500 hover:text-white"
              )}
            >
              Grille Instagram
            </button>
          )}
          {selectedNetworks.length > 1 && (
            <div className="flex gap-1" role="group" aria-label="Réseau affiché dans l'aperçu">
              {selectedNetworks.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onPickNetwork(n)}
                  aria-pressed={network === n}
                  className={clsx("rounded-full p-0.5 transition", network === n ? "ring-2 ring-aurora-400" : "opacity-50 hover:opacity-80")}
                  title={`Aperçu ${NETWORK_META[n].label}`}
                >
                  <NetworkDot network={n} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-void-950/60">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
            {(brandName || "N").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{brandName || "Votre marque"}</p>
            {network && <p className="text-[10px] text-slate-500">{NETWORK_META[network].label}</p>}
          </div>
          {network && <NetworkDot network={network} />}
        </div>

        <div className={clsx("relative flex w-full items-center justify-center bg-void-950/60", aspectClass)}>
          {asset ? (
            asset.type === "VIDEO" ? (
              <video
                key={asset.id}
                src={asset.previewUrl}
                poster={asset.thumbnailUrl}
                className="h-full w-full object-cover"
                controls
                onLoadedMetadata={(e) => onAspectClass(aspectFor(e.currentTarget.videoWidth, e.currentTarget.videoHeight))}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={asset.id}
                src={asset.previewUrl}
                alt=""
                className="h-full w-full object-cover"
                onLoad={(e) => onAspectClass(aspectFor(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight))}
              />
            )
          ) : (
            <p className="px-4 text-center text-xs text-slate-500">Votre média apparaîtra ici dès que vous en importerez un.</p>
          )}

          {/* Simulateur d'interface TikTok — purement visuel. */}
          {showTiktokUi && network === "TIKTOK" && asset && (
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <div className="absolute bottom-3 right-2.5 flex flex-col items-center gap-4 text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white/20 backdrop-blur">
                  <IconAvatar className="h-4 w-4" />
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <IconHeart className="h-6 w-6" />
                  <span className="text-[10px] font-semibold">12,4k</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <IconMessage className="h-6 w-6" />
                  <span className="text-[10px] font-semibold">348</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <IconSend className="h-6 w-6" />
                  <span className="text-[10px] font-semibold">Partager</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {showInstagramGrid && network === "INSTAGRAM" && asset && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: "hidden" }}
              className="border-t border-white/[0.06] p-3"
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
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="aspect-square overflow-hidden rounded"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img loading="lazy" decoding="async" src={tile.imageUrl} alt="" className="h-full w-full object-cover" />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-1 px-3 py-2.5">
          {title && <p className="truncate text-xs font-semibold text-white">{title}</p>}
          <p className="line-clamp-4 whitespace-pre-wrap text-xs text-slate-300">{caption || "Votre légende apparaîtra ici au fil de la saisie…"}</p>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">Rendu indicatif — la mise en page réelle varie selon la plateforme.</p>
    </MotionGlassCard>
  );
}
