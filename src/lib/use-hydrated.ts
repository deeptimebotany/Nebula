"use client";

// Vrai une fois l'application hydratée dans le navigateur (lot 10).
//
// Depuis que les pages arrivent déjà remplies par le serveur, tout ce qui
// dépend de l'heure locale, du fuseau du navigateur ou du hasard doit
// attendre l'hydratation : le serveur (UTC) et le navigateur (Europe/Paris…)
// n'afficheraient pas la même chose, et React devrait tout redessiner.
// Pendant le rendu serveur et l'hydratation : faux ; juste après : vrai.
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
