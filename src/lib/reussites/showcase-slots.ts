// Choix des badges de la vitrine (10/10/2026, retour de Lucas : vitrine
// pleine = impossible de changer de badge, il fallait deviner qu'on devait
// d'abord en retirer un). On touche une place, puis le badge à y mettre ;
// vitrine pleine, le badge choisi remplace celui de la place active (la
// dernière par défaut). Règles pures, lues par showcase-section.tsx et les tests.

/** Met `key` dans la place active, ou le retire s'il est déjà dans la vitrine. */
export function placeBadge(slots: (string | null)[], active: number, key: string): { slots: (string | null)[]; active: number } {
  const next = [...slots];
  const already = next.indexOf(key);
  // Badge déjà dans la vitrine : on le retire, sa place devient la place active.
  if (already !== -1) {
    next[already] = null;
    return { slots: next, active: already };
  }
  next[active] = key;
  const empty = next.indexOf(null);
  // Place suivante : la première encore vide, sinon on reste sur celle-ci.
  return { slots: next, active: empty === -1 ? active : empty };
}

export function initialSlots(selected: string[], max: number, slot?: number): { slots: (string | null)[]; active: number } {
  const slots: (string | null)[] = Array.from({ length: max }, (_, i) => selected[i] ?? null);
  if (slot !== undefined && slot >= 0 && slot < max) return { slots, active: slot };
  const empty = slots.indexOf(null);
  return { slots, active: empty === -1 ? max - 1 : empty };
}
