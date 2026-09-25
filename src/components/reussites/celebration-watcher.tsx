"use client";

// Célébrations des Réussites (accomplissement débloqué, défi réussi, niveau
// atteint) : récupère les déblocages pas encore fêtés à l'écran et les
// confie à la carte animée existante (confettis + son n° 3, voir
// achievement-toast-listener.tsx) via l'événement « nebula:reussite ».
//
// Monté par <FocusGate /> : rien en Mode focus (les réussites restent
// annoncées dans la cloche). Vérifie à l'ouverture, au retour sur l'onglet,
// quand la cloche reçoit du nouveau, après une action qui peut débloquer
// quelque chose (« nebula:reussites-check »), et toutes les 5 minutes en
// filet de sécurité (la cloche prévient déjà dès qu'une réussite arrive).
import { useCallback, useEffect, useRef } from "react";
import type { CelebrationDTO } from "@/lib/reussites/types";

const POLL_MS = 5 * 60_000;
const MIN_GAP_MS = 10_000;

export function ReussitesCelebrationWatcher() {
  const last = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async (force = false) => {
    if (busy.current || document.visibilityState !== "visible") return;
    if (!force && Date.now() - last.current < MIN_GAP_MS) return;
    busy.current = true;
    last.current = Date.now();
    try {
      const res = await fetch("/api/reussites/celebrations", { method: "POST", cache: "no-store" });
      if (!res.ok) return;
      const { items } = (await res.json()) as { items: CelebrationDTO[] };
      for (const item of items) window.dispatchEvent(new CustomEvent<CelebrationDTO>("nebula:reussite", { detail: item }));
    } catch {
      // hors ligne : on réessaiera
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => check(true), 1500);
    const timer = window.setInterval(() => check(), POLL_MS);
    const onCheck = () => window.setTimeout(() => check(true), 400);
    const onFocus = () => check();
    window.addEventListener("nebula:reussites-check", onCheck);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("nebula:reussites-check", onCheck);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  return null;
}
