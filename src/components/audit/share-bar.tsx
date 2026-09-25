"use client";

// Partage du rapport d'audit : copier le lien, X, LinkedIn, WhatsApp (liens
// de partage des réseaux, aucun script tiers chargé).
import { useState } from "react";
import { trackGrowthEvent } from "@/lib/growth-client";

export function ShareBar({ url, subject, score }: { url: string; subject: string; score: number | null }) {
  const [copied, setCopied] = useState(false);
  const text = score === null ? `Audit de présence en ligne de ${subject}` : `Audit de présence en ligne de ${subject} : ${score}/100`;
  const links = [
    { label: "X", href: `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url })}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}` },
    { label: "WhatsApp", href: `https://wa.me/?${new URLSearchParams({ text: `${text} ${url}` })}` }
  ];
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackGrowthEvent("tool_cta_click", { tool: "audit", kind: "copy" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  const pill = "inline-flex min-h-[40px] items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-slate-200 transition hover:border-aurora-400/40 hover:text-white";
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copy} className={pill}>
        {copied ? "Lien copié" : "Copier le lien"}
      </button>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noreferrer noopener" className={pill} onClick={() => trackGrowthEvent("tool_cta_click", { tool: "audit", kind: `share-${l.label.toLowerCase()}` })}>
          {l.label}
        </a>
      ))}
    </div>
  );
}
