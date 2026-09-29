"use client";

// Testeur de titre YouTube (brief growth, lot G4.c) : score heuristique
// LOCAL (longueur, chiffre, mot fort, question, majuscules) toujours
// disponible, même sans compte, et trois reformulations IA. 29/09/2026 :
// reformulations réservées aux comptes (quota par compte) ; sans compte,
// démo préparée à l'avance, sans IA.
import { useEffect, useMemo, useState } from "react";
import { markToolExplored } from "@/lib/tools-explored";
import { ToolPage } from "@/components/tools/tool-page";
import { ToolDemoNotice, ToolQuotaLine } from "@/components/tools/tool-demo-notice";
import { saveToolDraft, takeToolDraft } from "@/components/tools/use-tool-access";
import { useToolGeneration } from "@/components/tools/use-tool-generation";
import { DEMO_TITRE_YOUTUBE } from "@/lib/tools/demo";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { IconYouTube, IconSparkle } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";

const POWER_WORDS = ["secret", "erreur", "erreurs", "vérité", "jamais", "enfin", "pourquoi", "comment", "gratuit", "simple", "rapide", "meilleur", "pire", "incroyable", "avant", "après", "sans", "règle", "règles", "astuce", "astuces", "méthode", "guide", "complet", "ultime", "test", "testé", "vs", "contre"];

function scoreTitle(title: string): { score: number; checks: { label: string; ok: boolean; hint: string }[] } {
  const t = title.trim();
  const len = t.length;
  const words = t.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const checks = [
    { label: "Longueur 40–60 caractères", ok: len >= 40 && len <= 60, hint: len < 40 ? "Un peu court : ajoutez le bénéfice ou le contexte." : len > 60 ? "Trop long : YouTube coupe après ~60 caractères." : "Bonne longueur." },
    { label: "Contient un chiffre", ok: /\d/.test(t), hint: "Un chiffre (3 erreurs, 7 jours, 10 kg) rend la promesse concrète." },
    { label: "Contient un mot fort", ok: words.some((w) => POWER_WORDS.includes(w)), hint: "Un mot comme « erreur », « secret », « enfin », « sans » crée l'enjeu." },
    { label: "Question ou promesse", ok: /\?$/.test(t) || /^(comment|pourquoi|combien)\b/i.test(t), hint: "Une question ou un « comment… » ouvre une boucle de curiosité." },
    { label: "Pas tout en majuscules", ok: !(len > 8 && t === t.toUpperCase()), hint: "Les majuscules partout se lisent comme un cri : gardez-les pour un mot." }
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  return { score, checks };
}

const FAQ = [
  { q: "Quelle longueur pour un titre YouTube ?", a: "Environ 40 à 60 caractères : au-delà, YouTube tronque le titre dans la plupart des emplacements (recherche, suggestions, mobile), et l'idée principale doit tenir dans les premiers mots." },
  { q: "Le score garantit-il des clics ?", a: "Non. C'est un repère heuristique sur des critères connus (longueur, chiffre, mot fort, question). Le taux de clics dépend surtout du couple titre + miniature et de la promesse tenue dans la vidéo." },
  { q: "Que fait l'IA ici ?", a: "Avec un compte (gratuit), elle propose trois reformulations différentes (avec un chiffre, sous forme de question, avec un mot fort) à partir de votre titre et du sujet — sans clickbait mensonger. Sans compte, vous voyez un exemple préparé à l'avance. Le score, lui, se calcule dans votre navigateur, sans IA et sans compte." },
  { q: "Et pour la miniature ?", a: "Nebula analyse la rétention de vos vidéos YouTube et son assistant explique le pourquoi de chaque choix de miniature (accroche, composition, couleurs). Un générateur de miniatures gratuit est aussi disponible dans ces outils." }
];

export default function TitreYoutubePage() {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const gen = useToolGeneration<string[]>("titre-youtube", DEMO_TITRE_YOUTUBE.result);
  const member = gen.access.status === "member";

  // Retour après la création du compte : on remet ce qui avait été saisi.
  useEffect(() => {
    const draft = takeToolDraft("titre-youtube");
    if (!draft) return;
    setTitle(draft.title ?? "");
    setTopic(draft.topic ?? "");
  }, []);
  const result = useMemo(() => (title.trim().length >= 3 ? scoreTitle(title) : null), [title]);
  // Badge Explorateur (Réussites, lot C) : un vrai titre testé.
  const tested = title.trim().length >= 10;
  useEffect(() => {
    if (tested) markToolExplored();
  }, [tested]);

  function run() {
    if (!member) {
      void gen.generate({}, () => []);
      return;
    }
    if (title.trim().length < 3) {
      gen.setError("Saisissez d'abord votre titre.");
      return;
    }
    void gen.generate({ title: title.trim(), topic: topic.trim() || undefined }, (d) => (Array.isArray(d.items) ? (d.items as string[]) : []));
  }

  return (
    <ToolPage
      icon={<IconYouTube className="h-6 w-6" />}
      title="Testeur de titre YouTube"
      intro={
        <p>
          Un bon titre YouTube tient en une ligne, contient une promesse concrète et donne envie de savoir la suite. Collez votre titre : le testeur le note en direct sur cinq critères (longueur, chiffre, mot fort, question ou promesse, majuscules) et vous dit quoi corriger. Ensuite, avec un compte gratuit, l&apos;IA propose trois reformulations plus accrocheuses, sans tomber dans le clickbait (sans compte : une démo préparée à l&apos;avance). Le score se calcule dans votre navigateur, sans compte et sans limite.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/audit", title: "Audit de présence en ligne" },
        { href: "/outils/miniatures", title: "Générateur de miniatures" },
        { href: "/outils/legendes", title: "Générateur de légendes" },
        { href: "/outils/meilleur-moment", title: "Meilleur moment pour publier" }
      ]}
    >
      <GlassCard hover={false}>
        <label className="block text-xs uppercase tracking-wide text-slate-500">Votre titre</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex : J'ai testé 30 jours sans sucre, voici ce qui a changé" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60" />
        <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500">Sujet de la vidéo (optionnel, pour l&apos;IA)</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} placeholder="Ex : vlog santé, résultats et conseils pratiques" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60" />

        {result && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4" aria-live="polite">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-500">Score</p>
              <p className={clsx("text-2xl font-semibold", result.score >= 80 ? "text-emerald-300" : result.score >= 60 ? "text-aurora-200" : "text-amber-300")}>{result.score} / 100</p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {result.checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  <span className={clsx("mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]", c.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.06] text-slate-500")} aria-hidden="true">
                    {c.ok ? "✓" : "–"}
                  </span>
                  <span className={c.ok ? "text-slate-200" : "text-slate-400"}>
                    {c.label}
                    {!c.ok && <span className="block text-xs text-slate-500">{c.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button onClick={run} disabled={gen.loading || gen.access.status === "loading" || (member && title.trim().length < 3)} className="mt-4 w-full">
          <IconSparkle className="h-4 w-4" /> {gen.loading ? "Reformulation…" : member ? "Proposer 3 reformulations (IA)" : "Voir un exemple de reformulations (démo sans IA)"}
        </Button>
        <ToolQuotaLine status={gen.access.status} remaining={gen.access.remaining?.text ?? null} kind="text" />
        {gen.error && <p className="mt-3 text-sm text-red-300">{gen.error}</p>}
        {gen.isDemo && gen.result && <ToolDemoNotice slug="titre-youtube" input={DEMO_TITRE_YOUTUBE.input} onBeforeLeave={() => saveToolDraft("titre-youtube", { title, topic })} />}
        {gen.result && (
          <ul className="mt-4 space-y-2">
            {gen.result.map((t, i) => {
              const s = scoreTitle(t);
              return (
                <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <button type="button" onClick={() => setTitle(t)} className="min-w-0 flex-1 text-left text-sm text-white hover:underline" title="Utiliser ce titre">
                    {t}
                  </button>
                  <span className="shrink-0 text-xs text-slate-500">{s.score} / 100</span>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </ToolPage>
  );
}
