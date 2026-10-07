"use client";

// Testeur de titre YouTube, partagé par /outils/titre-youtube (public) et
// /tools/titre-youtube (application : `suggestions` = les derniers titres
// YouTube relevés, à tester d'un clic). Score local sans IA ; trois
// reformulations par l'IA avec un compte (démo sans IA pour les visiteurs).
import { useEffect, useId, useMemo, useState } from "react";
import { markToolExplored } from "@/lib/tools-explored";
import { ToolDemoNotice, ToolQuotaLine } from "@/components/tools/tool-demo-notice";
import { saveToolDraft, takeToolDraft } from "@/components/tools/use-tool-access";
import { useToolGeneration } from "@/components/tools/use-tool-generation";
import { DEMO_TITRE_YOUTUBE } from "@/lib/tools/demo";
import { scoreTitle } from "@/lib/tools/title-score";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

import { clsx } from "@/lib/clsx";
import { ToolError } from "@/components/tools/tool-error";
import { AiIcon } from "@/components/ai/ai-icon";

const INPUT = "mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60";

export function TitleTester({ suggestions = [] }: { suggestions?: string[] }) {
  const uid = useId();
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
    <GlassCard hover={false}>
      {suggestions.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Vos derniers titres YouTube</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setTitle(s)}
                  aria-pressed={title === s}
                  className={clsx("flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition", title === s ? "border-aurora-400/60 bg-white/[0.04] text-white" : "border-white/10 text-slate-300 hover:border-white/25")}
                >
                  <span className="min-w-0 truncate">{s}</span>
                  <span className="shrink-0 text-xs text-slate-500">{scoreTitle(s).score} / 100</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label htmlFor={`${uid}-title`} className="block text-xs uppercase tracking-wide text-slate-500">
        Votre titre
      </label>
      <input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex : J'ai testé 30 jours sans sucre, voici ce qui a changé" className={INPUT} />
      <label htmlFor={`${uid}-topic`} className="mt-3 block text-xs uppercase tracking-wide text-slate-500">
        Sujet de la vidéo (optionnel, pour l&apos;IA)
      </label>
      <input id={`${uid}-topic`} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} placeholder="Ex : vlog santé, résultats et conseils pratiques" className={INPUT} />

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
                  <span className="sr-only">{c.ok ? " : validé" : " : à améliorer"}</span>
                  {!c.ok && <span className="block text-xs text-slate-500">{c.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={run} disabled={gen.loading || gen.access.status === "loading" || (member && title.trim().length < 3)} className="mt-4 w-full">
        <AiIcon className="h-4 w-4" tone="onAccent" /> {gen.loading ? "Reformulation…" : member ? "Proposer 3 reformulations (IA)" : "Voir un exemple de reformulations (démo sans IA)"}
      </Button>
      <ToolQuotaLine status={gen.access.status} remaining={gen.access.remaining?.text ?? null} kind="text" />
      <ToolError message={gen.error} reason={gen.errorReason} />
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
  );
}
