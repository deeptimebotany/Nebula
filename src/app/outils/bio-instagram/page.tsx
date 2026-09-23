"use client";

// Générateur de bio Instagram (brief growth, lot G4.c) — IA, quota public.
import { useState } from "react";
import { ToolPage } from "@/components/tools/tool-page";
import { ToolLeadCapture } from "@/components/tools/tool-lead-capture";
import { useToolGeneration } from "@/components/tools/use-tool-generation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { IconAvatar, IconSparkle } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";

const TONES = [
  ["chaleureux", "Chaleureux"],
  ["pro", "Professionnel"],
  ["fun", "Fun"],
  ["inspirant", "Inspirant"]
] as const;

const FAQ = [
  { q: "Combien de caractères pour une bio Instagram ?", a: "150 caractères maximum, sauts de ligne compris. Chaque proposition générée respecte cette limite ; les émojis comptent pour un ou deux caractères selon les cas." },
  { q: "Que mettre dans une bio Instagram efficace ?", a: "Ce que vous faites, pour qui, et une raison d'agir (lien, offre, nouveauté). Un mot-clé sur votre activité aide la recherche Instagram ; l'appel à l'action pointe vers le lien de votre bio." },
  { q: "Où mettre plusieurs liens dans ma bio ?", a: "Instagram n'affiche qu'un lien principal. Une page « link in bio » regroupe tous vos liens sur une page : Nebula en propose une, gratuite, avec le suivi des clics." },
  { q: "Ces bios sont-elles uniques ?", a: "Elles sont générées à la demande à partir de votre description : deux personnes n'obtiennent pas la même. Relisez et adaptez avant de publier." }
];

export default function BioInstagramPage() {
  const [activity, setActivity] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number][0]>("chaleureux");
  const [keywords, setKeywords] = useState("");
  const [cta, setCta] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const gen = useToolGeneration<string[]>("bio-instagram");

  function run() {
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
    <ToolPage
      icon={<IconAvatar className="h-6 w-6" />}
      title="Générateur de bio Instagram"
      intro={
        <p>
          Votre bio Instagram est lue en une seconde : elle doit dire ce que vous faites, pour qui, et donner une raison de cliquer. Décrivez votre activité, choisissez un ton, ajoutez éventuellement des mots-clés et un appel à l&apos;action : l&apos;IA propose cinq bios de 150 caractères maximum, prêtes à coller. Gratuit et sans compte, avec quelques générations par jour. Et si votre bio mérite plusieurs liens, Nebula vous offre une page « link in bio » gratuite avec suivi des clics.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/hashtags", title: "Générateur de hashtags" },
        { href: "/outils/legendes", title: "Générateur de légendes" },
        { href: "/decouvrir/page-bio", title: "Créer une page bio" }
      ]}
      ctaLabel="Créer ma page bio gratuite"
    >
      <GlassCard hover={false}>
        <label className="block text-xs uppercase tracking-wide text-slate-500">Votre activité</label>
        <input value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={200} placeholder="Ex : coach sportif à Lyon, spécialisé remise en forme après 40 ans" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60" />
        <label className="mt-4 block text-xs uppercase tracking-wide text-slate-500">Ton</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {TONES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTone(id)} aria-pressed={tone === id} className={clsx("rounded-xl border-2 px-3.5 py-2 text-sm font-medium transition", tone === id ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-slate-500">Mots-clés (optionnel)</span>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} maxLength={200} placeholder="Ex : nutrition, motivation" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-slate-500">Appel à l&apos;action (optionnel)</span>
            <input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={120} placeholder="Ex : Programme gratuit ci-dessous" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60" />
          </label>
        </div>
        <Button onClick={run} disabled={gen.loading || activity.trim().length < 3} className="mt-4 w-full">
          <IconSparkle className="h-4 w-4" /> {gen.loading ? "Génération…" : "Générer 5 bios"}
        </Button>
        {gen.error && <p className="mt-3 text-sm text-red-300">{gen.error}</p>}
        {gen.leadStep === "ask" && <ToolLeadCapture {...gen.leadProps} />}
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
        {gen.remaining !== null && <p className="mt-3 text-right text-[11px] text-slate-500">{gen.remaining} génération(s) gratuite(s) restante(s) aujourd&apos;hui</p>}
      </GlassCard>
    </ToolPage>
  );
}
