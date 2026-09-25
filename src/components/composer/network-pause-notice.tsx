"use client";

// Réseau suspendu (lot 5, résilience des API) : si un des réseaux choisis
// est en pause (incident chez le réseau, maintenance), on le dit avant
// l'envoi — la publication partira toute seule à la reprise.
import { useEffect, useState } from "react";
import { NETWORK_META, type Network } from "@/lib/types";

interface PausedNetwork {
  network: Network;
  publishPaused: boolean;
  reason: "manual" | "incident" | null;
  until: string | null;
  message: string | null;
}

let cached: { at: number; list: PausedNetwork[] } | null = null;

async function loadPaused(): Promise<PausedNetwork[]> {
  if (cached && Date.now() - cached.at < 60_000) return cached.list;
  const res = await fetch("/api/network-status").catch(() => null);
  const data = res && res.ok ? ((await res.json().catch(() => ({}))) as { paused?: PausedNetwork[] }) : {};
  cached = { at: Date.now(), list: data.paused ?? [] };
  return cached.list;
}

export function NetworkPauseNotice({ networks }: { networks: Network[] }) {
  const [paused, setPaused] = useState<PausedNetwork[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadPaused().then((list) => {
      if (!cancelled) setPaused(list.filter((p) => p.publishPaused));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const concerned = paused.filter((p) => networks.includes(p.network));
  if (concerned.length === 0) return null;
  return (
    <div role="status" className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
      {concerned.map((p) => {
        const label = NETWORK_META[p.network]?.label ?? p.network;
        const until = p.until ? new Date(p.until).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;
        return (
          <p key={p.network}>
            {p.reason === "incident"
              ? `${label} rencontre un incident${until ? ` (nouvel essai vers ${until})` : ""}`
              : `Publication sur ${label} suspendue temporairement`}
            {" : "}votre publication partira automatiquement dès la reprise.{p.message ? ` ${p.message}` : ""}
          </p>
        );
      })}
    </div>
  );
}
