"use client";

// Envoi d'un événement de mesure depuis le navigateur (pages publiques et
// application) vers POST /api/growth — noms sur liste blanche côté serveur
// (voir growth.ts), aucune donnée personnelle, « fire-and-forget » : un
// échec réseau ne perturbe jamais le clic qu'il mesure.

export function trackGrowthEvent(name: string, meta?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ name, meta: meta ?? {} });
  try {
    // sendBeacon survit à une navigation immédiate (clic sur un lien) —
    // exactement le cas du badge et des blocs de conversion.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/growth", blob)) return;
    }
    void fetch("/api/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // rien : la mesure est optionnelle
  }
}
