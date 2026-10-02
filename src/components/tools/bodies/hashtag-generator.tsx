"use client";

// Générateur de hashtags, partagé par /outils/hashtags (public : démo sans
// IA pour les visiteurs) et /tools/hashtags (application : thématique et
// réseau préremplis avec la marque).
import { useEffect, useId, useState } from "react";
import { ToolDemoNotice, ToolQuotaLine } from "@/components/tools/tool-demo-notice";
import { saveToolDraft, takeToolDraft } from "@/components/tools/use-tool-access";
import { useToolGeneration } from "@/components/tools/use-tool-generation";
import { DEMO_HASHTAGS } from "@/lib/tools/demo";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { IconSparkle } from "@/components/dashboard/icons";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { ToolError } from "@/components/tools/tool-error";

type Groups = { label: string; items: string[] }[];

const INPUT = "mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60";

export function HashtagGenerator({ initialNiche = "", initialNetwork = "" }: { initialNiche?: string; initialNetwork?: Network | "" }) {
  const uid = useId();
  const [niche, setNiche] = useState(initialNiche);
  const [network, setNetwork] = useState<Network | "">(initialNetwork);
  const [copied, setCopied] = useState<string | null>(null);
  const gen = useToolGeneration<Groups>("hashtags", DEMO_HASHTAGS.result);
  const member = gen.access.status === "member";

  // Retour après la création du compte : on remet ce qui avait été saisi.
  useEffect(() => {
    const draft = takeToolDraft("hashtags");
    if (!draft) return;
    setNiche(draft.niche ?? "");
    if ((NETWORKS as readonly string[]).includes(draft.network ?? "")) setNetwork(draft.network as Network);
  }, []);

  function run() {
    if (!member) {
      void gen.generate({}, () => []);
      return;
    }
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
    <GlassCard hover={false}>
      <label htmlFor={`${uid}-niche`} className="block text-xs uppercase tracking-wide text-slate-500">
        Votre thématique
      </label>
      <input id={`${uid}-niche`} value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={200} placeholder="Ex : pâtisserie maison, recettes faciles" className={INPUT} />
      <label htmlFor={`${uid}-network`} className="mt-4 block text-xs uppercase tracking-wide text-slate-500">
        Réseau (optionnel)
      </label>
      <select id={`${uid}-network`} value={network} onChange={(e) => setNetwork(e.target.value as Network | "")} className={INPUT}>
        <option value="" className="bg-void-900">
          Tous
        </option>
        {NETWORKS.map((n) => (
          <option key={n} value={n} className="bg-void-900">
            {NETWORK_META[n].label}
          </option>
        ))}
      </select>
      <Button onClick={run} disabled={gen.loading || gen.access.status === "loading" || (member && niche.trim().length < 3)} className="mt-4 w-full">
        <IconSparkle className="h-4 w-4" /> {gen.loading ? "Génération…" : member ? "Générer mes hashtags" : "Voir un exemple (démo sans IA)"}
      </Button>
      <ToolQuotaLine status={gen.access.status} remaining={gen.access.remaining?.text ?? null} kind="text" />
      <ToolError message={gen.error} reason={gen.errorReason} />
      {gen.isDemo && gen.result && <ToolDemoNotice slug="hashtags" input={DEMO_HASHTAGS.input} onBeforeLeave={() => saveToolDraft("hashtags", { niche, network })} />}
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
                  <span key={h} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-200">
                    {h}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
