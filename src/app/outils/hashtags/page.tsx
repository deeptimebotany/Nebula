"use client";

// Générateur de hashtags (brief growth, lot G4.c) — IA, quota public.
import { useState } from "react";
import { ToolPage } from "@/components/tools/tool-page";
import { ToolLeadCapture } from "@/components/tools/tool-lead-capture";
import { useToolGeneration } from "@/components/tools/use-tool-generation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { IconHash, IconSparkle } from "@/components/dashboard/icons";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";

type Groups = { label: string; items: string[] }[];

const FAQ = [
  { q: "Combien de hashtags utiliser ?", a: "Instagram en accepte 30, mais 5 à 10 bien choisis suffisent souvent ; TikTok et YouTube en utilisent 3 à 5 ; Facebook 1 ou 2. Mélangez des hashtags larges, moyens et de niche plutôt que d'empiler les plus populaires." },
  { q: "Pourquoi trois groupes ?", a: "Les hashtags larges donnent de la visibilité mais beaucoup de concurrence ; les moyens touchent une communauté engagée ; les hashtags de niche sont précis et peu disputés — c'est souvent là que se trouvent vos futurs abonnés." },
  { q: "Les hashtags générés sont-ils vérifiés ?", a: "Ils sont proposés par l'IA à partir de votre thématique : vérifiez rapidement qu'ils existent bien et qu'ils ne sont pas détournés avant de publier." },
  { q: "Nebula peut-il retenir mes hashtags ?", a: "Le Composer de Nebula insère vos hashtags dans vos publications et l'assistant IA en propose d'adaptés à chaque réseau, à partir de vos vraies publications." }
];

export default function HashtagsPage() {
  const [niche, setNiche] = useState("");
  const [network, setNetwork] = useState<Network | "">("");
  const [copied, setCopied] = useState<string | null>(null);
  const gen = useToolGeneration<Groups>("hashtags");

  function run() {
    if (niche.trim().length < 3) {
      gen.setError("Indiquez votre thématique en quelques mots.");
      return;
    }
    void gen.generate({ niche: niche.trim(), network: network || undefined }, (d) => (Array.isArray(d.groups) ? (d.groups as Groups) : []));
  }

  async function copy(label: string, items: string[]) {
    await navigator.clipboard.writeText(items.join(" "));
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <ToolPage
      icon={<IconHash className="h-6 w-6" />}
      title="Générateur de hashtags"
      intro={
        <p>
          Les bons hashtags ne sont pas les plus gros : ce sont ceux où votre publication a une chance d&apos;être vue par les bonnes personnes. Indiquez votre thématique et, si vous voulez, le réseau visé : l&apos;IA propose trois groupes — larges pour la visibilité, moyens pour la communauté, de niche pour se démarquer — à copier en un clic. Gratuit, sans compte, quelques générations par jour. Dans Nebula, l&apos;assistant fait la même chose à partir de vos vraies publications, et le Composer les insère directement.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/legendes", title: "Générateur de légendes" },
        { href: "/outils/bio-instagram", title: "Générateur de bio Instagram" },
        { href: "/outils/meilleur-moment", title: "Meilleur moment pour publier" }
      ]}
    >
      <GlassCard hover={false}>
        <label className="block text-xs uppercase tracking-wide text-slate-500">Votre thématique</label>
        <input value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={200} placeholder="Ex : pâtisserie maison, recettes faciles" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60" />
        <label htmlFor="ht-network" className="mt-4 block text-xs uppercase tracking-wide text-slate-500">Réseau (optionnel)</label>
        <select id="ht-network" value={network} onChange={(e) => setNetwork(e.target.value as Network | "")} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60">
          <option value="" className="bg-void-900">Tous</option>
          {NETWORKS.map((n) => (
            <option key={n} value={n} className="bg-void-900">
              {NETWORK_META[n].label}
            </option>
          ))}
        </select>
        <Button onClick={run} disabled={gen.loading || niche.trim().length < 3} className="mt-4 w-full">
          <IconSparkle className="h-4 w-4" /> {gen.loading ? "Génération…" : "Générer mes hashtags"}
        </Button>
        {gen.error && <p className="mt-3 text-sm text-red-300">{gen.error}</p>}
        {gen.leadStep === "ask" && <ToolLeadCapture {...gen.leadProps} />}
        {gen.result && (
          <div className="mt-4 space-y-3">
            {gen.result.map((g) => (
              <div key={g.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                  <button type="button" onClick={() => copy(g.label, g.items)} className="text-[11px] font-medium text-aurora-300 hover:underline">
                    {copied === g.label ? "Copié !" : "Copier le groupe"}
                  </button>
                </div>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {g.items.map((h) => (
                    <span key={h} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-200">{h}</span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        )}
        {gen.remaining !== null && <p className="mt-3 text-right text-[11px] text-slate-500">{gen.remaining} génération(s) gratuite(s) restante(s) aujourd&apos;hui</p>}
      </GlassCard>
    </ToolPage>
  );
}
