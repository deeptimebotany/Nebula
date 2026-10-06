"use client";

// Aperçu de l'e-mail « bilan du mois » d'une marque (page propriétaire).
import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";

export function SummaryPreview({ month, brands }: { month: string; brands: { id: string; label: string }[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [value, setValue] = useState(month);
  const src = brandId ? `/api/admin/monthly-summary?brandId=${encodeURIComponent(brandId)}&month=${encodeURIComponent(value)}` : "";
  return (
    <GlassCard hover={false}>
      <h2 className="font-display text-base font-medium text-white">Aperçu de l&apos;e-mail</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs text-slate-400">
          Marque
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white">
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Mois
          <input type="month" value={value} onChange={(e) => setValue(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white" />
        </label>
        {src && (
          <a href={src} target="_blank" rel="noreferrer" className="text-sm text-aurora-300 underline-offset-2 hover:underline">
            Ouvrir dans un onglet
          </a>
        )}
      </div>
      {src ? (
        <iframe title="Aperçu du bilan du mois" src={src} className="mt-4 h-[900px] w-full rounded-xl border border-white/10 bg-white" />
      ) : (
        <p className="mt-4 text-sm text-slate-400">Aucune marque avec un compte connecté.</p>
      )}
    </GlassCard>
  );
}
