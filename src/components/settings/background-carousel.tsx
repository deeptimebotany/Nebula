"use client";

import { useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { IconChevron } from "@/components/dashboard/icons";

const CARD_WIDTH = 108; // largeur d'une vignette + espace (voir gap-3 = 12px, w-24 = 96px)

/**
 * Carrousel horizontal des 30 fonds d'écran : défilement à la molette/tactile
 * normal, plus deux flèches (± une vignette) et un glisser-déposer à la
 * souris (on "attrape" la bande et on la tire à gauche/droite).
 */
export function BackgroundCarousel({ selected, onSelect }: { selected: string; onSelect: (key: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startScroll: number;
    dragging: boolean;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function scrollByAmount(amount: number) {
    trackRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!trackRef.current) return;
    // On ne capture PAS le pointeur ici : le faire dès le pointerdown
    // empêche le navigateur d'émettre le "click" sur la vignette (bouton)
    // en dessous, donc un simple clic ne sélectionnait plus jamais de fond.
    // On ne capture qu'une fois qu'un vrai glissement est détecté (voir
    // onPointerMove), ce qui laisse le clic simple fonctionner normalement.
    dragState.current = {
      startX: e.clientX,
      startScroll: trackRef.current.scrollLeft,
      dragging: true,
      moved: false,
      pointerId: e.pointerId
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const state = dragState.current;
    if (!state?.dragging || !trackRef.current) return;
    const delta = e.clientX - state.startX;
    if (Math.abs(delta) > 4) {
      if (!state.moved) trackRef.current.setPointerCapture(state.pointerId);
      state.moved = true;
    }
    if (state.moved) {
      trackRef.current.scrollLeft = state.startScroll - delta;
      setIsDragging(true);
    }
  }

  function endDrag(e: React.PointerEvent) {
    // On ne relâche la capture que si un glissement a effectivement eu lieu
    // (c'est seulement dans ce cas qu'on l'a prise, voir onPointerMove) —
    // sinon releasePointerCapture peut lever une erreur pour un pointeur
    // jamais capturé.
    if (dragState.current?.moved && trackRef.current?.hasPointerCapture(e.pointerId)) {
      trackRef.current.releasePointerCapture(e.pointerId);
    }
    dragState.current = dragState.current ? { ...dragState.current, dragging: false } : null;
    setIsDragging(false);
  }

  // Un clic qui a fait glisser la bande ne doit pas aussi sélectionner la
  // vignette sous le curseur au relâchement.
  function onCardClick(key: string) {
    if (dragState.current?.moved) return;
    onSelect(key);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scrollByAmount(-CARD_WIDTH * 3)}
        className="absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-void-950/90 text-slate-300 shadow-lg transition hover:border-aurora-400/40 hover:text-white"
        aria-label="Fonds précédents"
      >
        <IconChevron className="h-4 w-4 rotate-90" />
      </button>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className={clsx(
          "flex gap-3 overflow-x-auto scroll-smooth px-9 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
      >
        {BACKGROUNDS.map((bg) => (
          <button
            key={bg.key}
            type="button"
            onClick={() => onCardClick(bg.key)}
            className={clsx(
              "flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-xl border-2 p-1.5 transition",
              selected === bg.key ? "border-aurora-400 bg-white/[0.04]" : "border-white/10 hover:border-white/25"
            )}
          >
            <span className="h-16 w-full rounded-lg shadow-inner" style={{ background: bg.css }} />
            <span className="line-clamp-1 text-[10px] text-slate-400">{bg.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scrollByAmount(CARD_WIDTH * 3)}
        className="absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-void-950/90 text-slate-300 shadow-lg transition hover:border-aurora-400/40 hover:text-white"
        aria-label="Fonds suivants"
      >
        <IconChevron className="h-4 w-4 -rotate-90" />
      </button>
    </div>
  );
}
