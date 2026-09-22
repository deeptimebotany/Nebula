"use client";

// Fonction "fire-and-forget" appelée depuis n'importe quel composant client
// au moment où un easter egg se déclenche réellement (pas besoin de contexte
// React — juste une fonction). Envoie la découverte à /api/easter-eggs/found ;
// si c'est la toute première fois pour ce compte, diffuse un événement
// "nebula:achievement" que <AchievementToastListener /> (monté dans le
// layout du tableau de bord) écoute pour afficher un toast "succès débloqué".
//
// Ne fait jamais planter l'appelant : un echec réseau ici ne doit jamais
// perturber l'easter egg lui-même (confettis, animation...), qui a déjà eu
// lieu de toute façon.

import { findEasterEgg } from "@/lib/easter-eggs-registry";

export interface EasterEggUnlockedDetail {
  key: string;
  title: string;
  emoji: string;
}

export function reportEasterEggFound(key: string) {
  fetch("/api/easter-eggs/found", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key })
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d?.isNew) return;
      const egg = findEasterEgg(key);
      if (!egg) return;
      const detail: EasterEggUnlockedDetail = { key: egg.key, title: egg.title, emoji: egg.emoji };
      window.dispatchEvent(new CustomEvent("nebula:achievement", { detail }));
    })
    .catch(() => {
      // Pas grave : l'easter egg a quand même eu lieu pour la personne, il
      // sera juste marqué "trouvé" une prochaine fois qu'il se déclenche.
    });
}
