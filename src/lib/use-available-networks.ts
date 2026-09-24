"use client";

// Réseaux proposés dans l'application, côté navigateur (25/09/2026) : la
// liste vient du bootstrap /api/me (clés configurées, voir
// src/lib/network-availability.ts). Tant qu'elle n'est pas chargée, on se
// limite aux réseaux lancés, pour ne jamais faire apparaître puis
// disparaître un réseau pas encore disponible.
import { useMemo } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";
import { LAUNCHED_NETWORKS, NETWORKS, type Network } from "@/lib/types";

export function useAvailableNetworks(): Network[] {
  const { data } = useBootstrap();
  const list = (data as { networks?: Network[] } | null)?.networks;
  return useMemo(() => {
    const allowed = new Set<Network>(list && list.length ? list : LAUNCHED_NETWORKS);
    return NETWORKS.filter((n) => allowed.has(n));
  }, [list]);
}
