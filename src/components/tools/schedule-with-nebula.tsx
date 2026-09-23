"use client";

// « Programmer cette publication avec Nebula » (brief growth, lot G4.a) —
// bouton principal sous chaque résultat des outils gratuits. Crée un
// PublicDraft puis envoie vers l'inscription (ou directement vers le
// Composer si une session existe), qui le lira via ?draft=<id>.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconUpload } from "@/components/dashboard/icons";
import { trackGrowthEvent } from "@/lib/growth-client";

export interface DraftPayload {
  kind: "CAPTION" | "THUMBNAIL";
  tool: string;
  network?: string;
  content: { title?: string; caption?: string; imageBase64?: string; imageMimeType?: string };
}

export function ScheduleWithNebula({ payload, className, label = "Programmer cette publication avec Nebula" }: { payload: DraftPayload; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    trackGrowthEvent("tool_cta_click", { tool: payload.tool, kind: payload.kind });
    try {
      const res = await fetch("/api/public/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.next) throw new Error(d.error ?? "Impossible de préparer le brouillon.");
      // Session déjà ouverte ? Direct vers le Composer ; sinon inscription
      // avec retour vers le brouillon. Le cookie d'attribution est posé par
      // le middleware grâce aux paramètres utm_* du lien.
      const me = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
      if (me?.ok) {
        window.location.assign(d.next);
      } else {
        const params = new URLSearchParams({ next: d.next, utm_source: "outils", utm_medium: "cta", utm_campaign: payload.tool });
        window.location.assign(`/register?${params.toString()}`);
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button onClick={go} disabled={busy} className="w-full">
        <IconUpload className="h-4 w-4" /> {busy ? "Préparation…" : label}
      </Button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <p className="mt-2 text-center text-[11px] text-slate-500">Gratuit, sans carte bancaire — le texte arrive pré-rempli dans votre espace.</p>
    </div>
  );
}
