"use client";

// Carte « Aperçu » des outils gratuits (29/09/2026) : le MÊME aperçu que la
// page Publier de l'application (preview-network-ui.tsx, cadres de
// preview-frames.tsx), pour voir le texte ou la miniature tels qu'ils
// apparaîtront sur le réseau choisi. Purement visuel, aucun appel réseau.
import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { GlassCard } from "@/components/ui/glass-card";
import { NetworkLogo } from "@/components/ui/network-badge";
import { NETWORK_META, type Network } from "@/lib/types";
import { NETWORK_WEB_ADDRESS, NetworkPreviewUi, PreviewSoundButton, type MediaShape, type PreviewDevice, type PreviewPost } from "@/components/composer/preview-network-ui";
import { BrowserFrame, PhoneFrame, ScaledFrame } from "@/components/composer/preview-frames";
import type { UploadedAsset } from "@/components/composer/composer-types";

const FRAME = { mobile: { width: 390, height: 820 }, desktop: { width: 820, height: 760 } } as const;

export function ToolPreview({
  network,
  networks,
  onPickNetwork,
  title,
  caption,
  asset,
  accountName,
  devices = ["mobile"],
  note
}: {
  network: Network;
  networks: readonly Network[];
  onPickNetwork: (n: Network) => void;
  title: string;
  caption: string;
  asset?: UploadedAsset;
  accountName?: string;
  devices?: PreviewDevice[];
  note?: React.ReactNode;
}) {
  const [shape, setShape] = useState<MediaShape>("portrait");
  const [device, setDevice] = useState<PreviewDevice>(devices[0]);
  const name = accountName?.trim() || "Votre marque";
  const post: PreviewPost = {
    network,
    accountName: name,
    handle: name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9._]+/g, "") || "votremarque",
    avatarUrl: null,
    asset,
    title,
    caption,
    shape,
    onMediaShape: (w, h) => setShape(h > w ? "portrait" : w > h ? "landscape" : "square")
  };
  const dims = FRAME[device];

  return (
    <GlassCard>
      <h2 className="mb-2 font-display text-base font-medium text-white">Aperçu</h2>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Réseau de l'aperçu">
          {networks.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPickNetwork(n)}
              aria-pressed={n === network}
              title={`Aperçu ${NETWORK_META[n].label}`}
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition",
                n === network ? "border-aurora-400/60 bg-white/[0.08] text-white" : "border-transparent text-slate-500 hover:bg-white/[0.05] hover:text-white"
              )}
            >
              <NetworkLogo network={n} className="h-4 w-4" />
              <span className="sr-only">{NETWORK_META[n].label}</span>
            </button>
          ))}
        </div>
        {asset?.type === "VIDEO" && <PreviewSoundButton className="ml-auto" />}
        {devices.length > 1 && (
          <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-[11px]" role="group" aria-label="Format de l'aperçu">
            {devices.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                aria-pressed={device === d}
                className={clsx("rounded-md px-2 py-1 transition", device === d ? "bg-white/10 text-white" : "text-slate-500 hover:text-white")}
              >
                {d === "mobile" ? "Mobile" : "Ordinateur"}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mb-3 mt-1.5 text-[11px] text-slate-500">
        {NETWORK_META[network].label} · {device === "mobile" ? "application mobile" : "sur ordinateur"}
      </p>
      <ScaledFrame width={dims.width} height={dims.height}>
        {device === "mobile" ? (
          <PhoneFrame>
            <NetworkPreviewUi post={post} device="mobile" />
          </PhoneFrame>
        ) : (
          <BrowserFrame address={NETWORK_WEB_ADDRESS[network]}>
            <div className="nb-preview-focus h-full">
              <NetworkPreviewUi post={post} device="desktop" />
            </div>
          </BrowserFrame>
        )}
      </ScaledFrame>
      {note && <div className="mt-3 text-[11px] text-slate-500">{note}</div>}
    </GlassCard>
  );
}
