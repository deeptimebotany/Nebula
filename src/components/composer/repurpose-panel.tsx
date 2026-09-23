"use client";

// Panneau « Recyclage de contenu » (IA) de la page Publier : trois
// déclinaisons du texte (Reel Instagram, post Facebook, script TikTok) à
// appliquer d'un clic au réseau correspondant. Extrait de composer/page.tsx
// au Lot 4.
import { motion, AnimatePresence } from "framer-motion";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { SkeletonText } from "@/components/ui/skeleton";
import { IconSparkle } from "@/components/dashboard/icons";
import { NETWORK_META, type Network } from "@/lib/types";
import { networkInkStyle } from "@/components/ui/network-badge";
import type { RepurposedContent } from "@/lib/ai/gemini";

interface RepurposePanelProps {
  open: boolean;
  loading: boolean;
  result: RepurposedContent | null;
  onClose: () => void;
  onApply: (network: Network, text: string) => void;
}

export function RepurposePanel({ open, loading, result, onClose, onApply }: RepurposePanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
          <MotionGlassCard glow className="border-aurora-400/25 bg-nebula-700/[0.08]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-base font-medium text-white">
                <IconSparkle className="h-4 w-4 text-aurora-300" /> Recyclage de contenu
              </h2>
              <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-white">
                Fermer
              </button>
            </div>
            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy="true">
                <SkeletonText lines={4} />
                <SkeletonText lines={4} />
                <SkeletonText lines={4} />
                <span className="sr-only">Génération des trois déclinaisons</span>
              </div>
            ) : result ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { network: "INSTAGRAM" as Network, label: "Reel Instagram", text: result.instagramReel },
                  { network: "FACEBOOK" as Network, label: "Post Facebook", text: result.facebookPost },
                  { network: "TIKTOK" as Network, label: "Script TikTok", text: result.tiktokScript }
                ].map((v) => (
                  <div key={v.network} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="network-ink text-xs font-medium" style={networkInkStyle(v.network)}>
                      {v.label}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-300">{v.text || "—"}</p>
                    {v.text && (
                      <button type="button" onClick={() => onApply(v.network, v.text)} className="mt-2 text-xs text-aurora-300 hover:underline">
                        Utiliser pour {NETWORK_META[v.network].label}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">La génération a échoué — réessayez dans un instant.</p>
            )}
          </MotionGlassCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
