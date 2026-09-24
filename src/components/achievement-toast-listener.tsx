"use client";

// Célébration « Succès débloqué » (refonte du 24/09/2026, proposition n° 3
// retenue par Lucas) : écoute l'événement "nebula:achievement" diffusé par
// reportEasterEggFound() (voir src/lib/report-easter-egg.ts) et affiche, au
// centre de l'écran, une carte qui surgit en rebondissant dans une gerbe de
// confettis violets et dorés, avec un petit arpège joyeux (voir
// playAchievementArpeggio dans cosmic-audio.ts — désactivable dans
// Paramètres). Remplace l'ancien simple toast.
//
// Monté par <FocusGate /> : rien ne s'affiche en Mode focus (les succès
// restent enregistrés sur la page Succès). Plusieurs succès d'un coup
// s'enchaînent l'un après l'autre. Un clic ferme la carte ; le mouvement est
// réduit si le système le demande.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { EasterEggUnlockedDetail } from "@/lib/report-easter-egg";
import { findEasterEgg } from "@/lib/easter-eggs-registry";
import { isAchievementSoundOn, playAchievementArpeggio } from "@/lib/cosmic-audio";
import type { CelebrationDTO } from "@/lib/reussites/types";

const SHOW_MS = 3600;
// Couleurs de la marque (logo R4 : violet, lilas, cyan, rose) + or des récompenses.
const CONFETTI_COLORS = ["#a066ff", "#d6beff", "#f2cf6b", "#fff3c4", "#5fe0f0", "#f062d0"];

interface Shown extends EasterEggUnlockedDetail {
  id: number;
  reward?: string;
  /** Bandeau au-dessus du titre (« Succès débloqué » par défaut). */
  label?: string;
  /** Réussites : pastille dorée (niveau) ou violette. */
  tone?: "egg" | "level" | "reussite";
  /** Cible sur /reussites (?focus=…). */
  focus?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function AchievementToastListener() {
  const [queue, setQueue] = useState<Shown[]>([]);
  const [current, setCurrent] = useState<Shown | null>(null);
  const [mounted, setMounted] = useState(false);
  const burstRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onAchievement(e: Event) {
      const detail = (e as CustomEvent<EasterEggUnlockedDetail>).detail;
      if (!detail) return;
      const reward = findEasterEgg(detail.key)?.reward;
      setQueue((q) => [...q, { ...detail, reward, id: Date.now() + Math.random() }]);
    }
    // Réussites (accomplissement, défi, niveau — voir celebration-watcher.tsx).
    function onReussite(e: Event) {
      const d = (e as CustomEvent<CelebrationDTO>).detail;
      if (!d) return;
      setQueue((q) => [
        ...q,
        { key: d.id, title: d.title, emoji: d.emoji, reward: d.reward ?? undefined, label: d.label, tone: d.kind === "level" ? "level" : "reussite", focus: d.focus, id: Date.now() + Math.random() }
      ]);
    }
    window.addEventListener("nebula:achievement", onAchievement);
    window.addEventListener("nebula:reussite", onReussite);
    return () => {
      window.removeEventListener("nebula:achievement", onAchievement);
      window.removeEventListener("nebula:reussite", onReussite);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setCurrent(null);
  }, []);

  // File d'attente : un succès à la fois.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
  }, [queue, current]);

  // Son + confettis + fermeture automatique à l'apparition d'une carte.
  useEffect(() => {
    if (!current) return;
    if (isAchievementSoundOn()) {
      try {
        playAchievementArpeggio();
      } catch {
        // audio bloqué par le navigateur : l'animation suffit
      }
    }
    if (!prefersReducedMotion()) burst(burstRef.current);
    timer.current = window.setTimeout(dismiss, SHOW_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [current, dismiss]);

  if (!mounted || !current) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center" aria-live="polite">
      <div ref={burstRef} className="absolute left-1/2 top-1/2 h-0 w-0" aria-hidden="true" />
      <div
        key={current.id}
        role="status"
        onClick={dismiss}
        className="nebula-achievement-card pointer-events-auto relative flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-[#1b1b20] py-3 pl-3 pr-5 shadow-[0_18px_50px_rgba(0,0,0,.55)]"
      >
        <span
          className={
            current.tone === "level"
              ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff3c4,#c99a2e)] text-2xl"
              : "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#e2d2ff,#8646ff)] text-2xl"
          }
          aria-hidden="true"
        >
          {current.tone && current.tone !== "egg" ? current.emoji : "🎉"}
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#f2cf6b]">{current.label ?? "Succès débloqué"}</span>
          <span className="block truncate text-[15px] font-semibold text-white">
            {current.tone && current.tone !== "egg" ? current.title : `${current.emoji} ${current.title}`}
          </span>
          {current.reward && <span className="block truncate text-xs text-slate-400">Récompense : {current.reward}</span>}
          <Link
            href={`/reussites?focus=${encodeURIComponent(current.tone === "egg" || !current.tone ? "succes" : current.focus ?? "")}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 inline-block text-[11px] text-aurora-300 hover:underline"
          >
            {current.tone === "egg" || !current.tone ? "Voir mes succès →" : "Voir ce succès →"}
          </Link>
        </span>
      </div>
    </div>,
    document.body
  );
}

/** Gerbe de confettis autour du centre de l'écran (animations Web natives). */
function burst(origin: HTMLDivElement | null) {
  if (!origin) return;
  for (let i = 0; i < 48; i++) {
    const p = document.createElement("span");
    const size = 6 + Math.random() * 4;
    Object.assign(p.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: `${size}px`,
      height: `${size * (Math.random() > 0.5 ? 1 : 0.5)}px`,
      marginLeft: `${-size / 2}px`,
      marginTop: `${-size / 2}px`,
      borderRadius: "2px",
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    });
    const angle = Math.random() * Math.PI * 2;
    const dist = 110 + Math.random() * 170;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.75 - 30;
    const anim = p.animate(
      [
        { transform: "translate(0px, 0px) scale(0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx * 1.1}px, ${dy + 110}px) scale(.8) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ],
      { duration: 1400 + Math.random() * 600, delay: 120, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }
    );
    origin.appendChild(p);
    anim.onfinish = () => p.remove();
  }
}
