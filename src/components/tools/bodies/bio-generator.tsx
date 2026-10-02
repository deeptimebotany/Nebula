"use client";

// Générateur de bio Instagram, partagé par /outils/bio-instagram (public :
// démo sans IA pour les visiteurs) et /tools/bio-instagram (application :
// activité préremplie avec l'accroche du media kit ou la bio de la Page bio).
import { useEffect, useId, useState } from "react";
import { ToolDemoNotice, ToolQuotaLine } from "@/components/tools/tool-demo-notice";
import { saveToolDraft, takeToolDraft } from "@/components/tools/use-tool-access";
import { useToolGeneration } from "@/components/tools/use-tool-generation";
import { DEMO_BIO_INSTAGRAM } from "@/lib/tools/demo";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { IconSparkle } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";
import { ToolError } from "@/components/tools/tool-error";

const TONES = [
  ["chaleureux", "Chaleureux"],
  ["pro", "Professionnel"],
  ["fun", "Fun"],
  ["inspirant", "Inspirant"]
] as const;
type Tone = (typeof TONES)[number][0];

const INPUT = "mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60";

export function BioGenerator({ initialActivity = "" }: { initialActivity?: string }) {
  const uid = useId();
  const [activity, setActivity] = useState(initialActivity);
  const [tone, setTone] = useState<Tone>("chaleureux");
  const [keywords, setKeywords] = useState("");
  const [cta, setCta] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const gen = useToolGeneration<string[]>("bio-instagram", DEMO_BIO_INSTAGRAM.result);
  const member = gen.access.status === "member";

  // Retour après la création du compte : on remet ce qui avait été saisi.
  useEffect(() => {
    const draft = takeToolDraft("bio-instagram");
    if (!draft) return;
    setActivity(draft.activity ?? "");
    setKeywords(draft.keywords ?? "");
    setCta(draft.cta ?? "");
    if (TONES.some(([id]) => id === draft.tone)) setTone(draft.tone as Tone);
  }, []);

  function run() {
    if (!member) {
      void gen.generate({}, () => []);
      return;
    }
    if (activity.trim().length < 3) {
      gen.setError("Décrivez votre activité en quelques mots.");
      return;
    }
    void gen.generate({ activity: activity.trim(), tone, keywords: keywords.trim() || undefined, cta: cta.trim() || undefined }, (d) => (Array.isArray(d.items) ? (d.items as string[]) : []));
  }

  async function copy(i: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(i);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <GlassCard hover={false}>
      <label htmlFor={`${uid}-activity`} className="block text-xs uppercase tracking-wide text-slate-500">
        Votre activité
      </label>
      <input id={`${uid}-activity`} value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={200} placeholder="Ex : coach sportif à Lyon, spécialisé remise en forme après 40 ans" className={INPUT} />
      <p id={`${uid}-tone`} className="mt-4 block text-xs uppercase tracking-wide text-slate-500">
        Ton
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-labelledby={`${uid}-tone`}>
        {TONES.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTone(id)} aria-pressed={tone === id} className={clsx("rounded-xl border-2 px-3.5 py-2 text-sm font-medium transition", tone === id ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-slate-500">Mots-clés (optionnel)</span>
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} maxLength={200} placeholder="Ex : nutrition, motivation" className={INPUT} />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-slate-500">Appel à l&apos;action (optionnel)</span>
          <input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={120} placeholder="Ex : Programme gratuit ci-dessous" className={INPUT} />
        </label>
      </div>
      <Button onClick={run} disabled={gen.loading || gen.access.status === "loading" || (member && activity.trim().length < 3)} className="mt-4 w-full">
        <IconSparkle className="h-4 w-4" /> {gen.loading ? "Génération…" : member ? "Générer 5 bios" : "Voir un exemple (démo sans IA)"}
      </Button>
      <ToolQuotaLine status={gen.access.status} remaining={gen.access.remaining?.text ?? null} kind="text" />
      <ToolError message={gen.error} reason={gen.errorReason} />
      {gen.isDemo && gen.result && <ToolDemoNotice slug="bio-instagram" input={DEMO_BIO_INSTAGRAM.input} onBeforeLeave={() => saveToolDraft("bio-instagram", { activity, tone, keywords, cta })} />}
      {gen.result && (
        <ul className="mt-4 space-y-2">
          {gen.result.map((bio, i) => (
            <li key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="whitespace-pre-line text-sm text-white">{bio}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <button type="button" onClick={() => copy(i, bio)} className="font-medium text-aurora-300 hover:underline">
                  {copied === i ? "Copié !" : "Copier"}
                </button>
                <span>{bio.length} / 150</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
