"use client";

import { useEffect, useState } from "react";

export interface PremiumReactionDef {
  id: string;
  key: string;
  label: string;
  imageUrl: string;
}

interface State {
  reactions: PremiumReactionDef[];
  isPremium: boolean;
  isAdmin: boolean;
  loaded: boolean;
}

// Petit cache mémoire partagé entre toutes les instances de ReactionBar
// affichées sur une même page (ex : une discussion avec 30 réponses) pour
// n'appeler les deux endpoints qu'une seule fois par navigation, plutôt
// qu'une fois par barre de réactions.
let cache: { reactions: PremiumReactionDef[]; isPremium: boolean; isAdmin: boolean } | null = null;
let inFlight: Promise<{ reactions: PremiumReactionDef[]; isPremium: boolean; isAdmin: boolean }> | null = null;

async function load() {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = Promise.all([
      fetch("/api/premium/reactions").then((r) => (r.ok ? r.json() : { reactions: [] })),
      fetch("/api/billing/plan").then((r) => (r.ok ? r.json() : { plan: "FREE", isAdmin: false }))
    ]).then(([reactionsData, planData]) => {
      cache = {
        reactions: reactionsData.reactions ?? [],
        isPremium: planData.plan !== "FREE",
        isAdmin: Boolean(planData.isAdmin)
      };
      return cache;
    });
  }
  return inFlight;
}

/** Réinitialise le cache — utile juste après avoir déclenché une nouvelle
 * génération du pack (voir bouton admin dans community/page.tsx). */
export function invalidatePremiumReactionsCache() {
  cache = null;
  inFlight = null;
}

export function usePremiumReactions(): State {
  const [state, setState] = useState<State>({ reactions: [], isPremium: false, isAdmin: false, loaded: false });

  useEffect(() => {
    let cancelled = false;
    load().then((d) => {
      if (!cancelled) setState({ reactions: d.reactions, isPremium: d.isPremium, isAdmin: d.isAdmin, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
