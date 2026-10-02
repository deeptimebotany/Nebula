"use client";

// Journal des mises à jour (02/10/2026) : toutes les mises à jour du site,
// de la plus récente à la plus ancienne, regroupées par jour. Pour chacune :
// liens directs vers les pages concernées, résultat visible, modification
// apportée. Recherche (sans accents), filtre par catégorie, copie en
// Markdown. Complété à chaque envoi du zip (voir src/lib/journal).
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useToast } from "@/components/dashboard/toast";
import { JOURNAL_CATEGORIES, type JournalCategory, type JournalEntry } from "@/lib/journal/journal-types";
import { dayLabel, filterJournal, journalByDay, journalMarkdown } from "@/lib/journal/journal-format";

const CATEGORY_TONE: Partial<Record<JournalCategory, BadgeTone>> = {
  Sécurité: "danger",
  Fiabilité: "warning",
  Performance: "info",
  Réussites: "premium",
  Administration: "neutral",
  IA: "premium"
};

/** Texte avec `code` rendu en police à chasse fixe. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="rounded bg-white/[0.06] px-1 py-0.5 text-[0.85em] text-slate-200">
            {p.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}

function EntryCard({ e }: { e: JournalEntry }) {
  return (
    <article id={e.id} aria-labelledby={`${e.id}-titre`} className="scroll-mt-24 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={CATEGORY_TONE[e.category] ?? "info"}>{e.category}</Badge>
        {e.readme !== undefined && <span className="text-[11px] tabular-nums text-slate-500">README n° {e.readme}</span>}
        {e.migrations.length > 0 && <span className="text-[11px] text-slate-500">Migration : {e.migrations.join(", ")}</span>}
      </div>
      <h3 id={`${e.id}-titre`} className="mt-2 font-display text-base font-semibold text-white">
        {e.title}
      </h3>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Pages concernées">
        {e.links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="inline-flex items-center gap-1 rounded-full border border-aurora-400/30 bg-aurora-400/[0.08] px-2.5 py-1 text-xs font-medium text-aurora-200 transition hover:border-aurora-400/60 hover:text-white">
              {l.label}
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Résultat</dt>
          <dd className="mt-1 leading-relaxed text-slate-200">
            <RichText text={e.result} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Modification apportée</dt>
          <dd className="mt-1 leading-relaxed text-slate-300">
            <RichText text={e.change} />
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function JournalView({ entries, updatedAt }: { entries: JournalEntry[]; updatedAt: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const toast = useToast();
  const shown = useMemo(() => filterJournal(entries, query, category || null), [entries, query, category]);
  const days = useMemo(() => journalByDay(shown), [shown]);
  const allDays = useMemo(() => journalByDay(entries), [entries]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(journalMarkdown(shown, window.location.origin));
      toast.success(`${shown.length} mise${shown.length > 1 ? "s" : ""} à jour copiée${shown.length > 1 ? "s" : ""} en Markdown.`);
    } catch {
      toast.error("Copie impossible dans ce navigateur.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal des mises à jour"
        description="Toutes les mises à jour du site, de la première version à aujourd'hui : les pages concernées, le résultat et ce qui a été modifié. Complété à chaque envoi du zip."
        actions={
          <Button type="button" variant="outline" onClick={() => void copyMarkdown()}>
            Copier en Markdown
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Mises à jour", value: String(entries.length) },
          { label: "Journées de travail", value: String(allDays.length) },
          { label: "Dernière mise à jour du journal", value: dayLabel(updatedAt) }
        ].map((k) => (
          <GlassCard key={k.label} hover={false} className="!p-4">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums text-white">{k.value}</p>
          </GlassCard>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-slate-400">
          Rechercher dans le journal
          <input
            type="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="ex. TikTok, carte, Réussites, migration…"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Catégorie
          <select
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
          >
            <option value="">Toutes</option>
            {JOURNAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c} ({entries.filter((e) => e.category === c).length})
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500" aria-live="polite">
        {shown.length === entries.length ? `${entries.length} mises à jour` : `${shown.length} sur ${entries.length} mises à jour`}
      </p>

      {days.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune mise à jour ne correspond à cette recherche.</p>
      ) : (
        <ol className="space-y-8" aria-label="Mises à jour par jour">
          {days.map((d) => (
            <li key={d.date} className="space-y-3">
              <h2 className="sticky top-14 z-10 -mx-1 rounded-lg bg-void-950/90 px-1 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-aurora-300 backdrop-blur">
                {dayLabel(d.date)} <span className="font-normal normal-case tracking-normal text-slate-500">· {d.entries.length} mise{d.entries.length > 1 ? "s" : ""} à jour</span>
              </h2>
              <div className="space-y-3">
                {d.entries.map((e) => (
                  <EntryCard key={e.id} e={e} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
