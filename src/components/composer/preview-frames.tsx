"use client";

// Cadres de l'aperçu « fidèle » (téléphone, fenêtre de navigateur, mise à
// l'échelle) : sortis de composer-preview.tsx le 29/09/2026 pour servir
// aussi aux outils gratuits de /outils, qui montrent le même aperçu que la
// page Publier.
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Dessine son contenu à sa taille réelle, puis le met à l'échelle pour tenir
 * dans la largeur disponible — et, si `reservedHeight` est donné, dans la
 * hauteur de la fenêtre moins cette réserve (aperçu collé en haut, plein
 * écran). `maxScale` > 1 autorise l'agrandissement (plein écran).
 */
export function ScaledFrame({ width, height, reservedHeight, maxScale = 1, children }: { width: number; height: number; reservedHeight?: number; maxScale?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [viewportH, setViewportH] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setAvailable(el.clientWidth);
      setViewportH(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined") return () => window.removeEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  // Hauteur : jamais moins de 360 px, même sur un petit écran.
  const heightLimit = reservedHeight !== undefined && viewportH ? Math.max(360, viewportH - reservedHeight) / height : Infinity;
  const scale = available ? Math.min(maxScale, available / width, heightLimit) : 0;
  return (
    <div ref={ref} className="w-full">
      <div className="mx-auto" style={{ width: width * scale, height: height * scale, visibility: available ? "visible" : "hidden" }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
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

export function BrowserFrame({ address, children }: { address: string; children: ReactNode }) {
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

