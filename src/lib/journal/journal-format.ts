// Journal des mises à jour (02/10/2026) : regroupement par jour, recherche
// et copie en Markdown. Sans les données (importable par la page).
import type { JournalEntry } from "./journal-types";

export interface JournalDay {
  date: string;
  entries: JournalEntry[];
}

export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Entrées regroupées par jour, du plus récent au plus ancien (ordre d'origine dans un jour). */
export function journalByDay(entries: JournalEntry[]): JournalDay[] {
  const days = new Map<string, JournalEntry[]>();
  for (const e of entries) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  return Array.from(days.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, entries: list }));
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Recherche sans accents ni majuscules, sur le titre, le résultat, la modification et les pages. */
export function filterJournal(entries: JournalEntry[], query: string, category: string | null): JournalEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (category && e.category !== category) return false;
    if (words.length === 0) return true;
    const hay = fold([e.title, e.result, e.change, e.category, ...e.links.map((l) => `${l.label} ${l.href}`), e.readme ? `readme ${e.readme}` : "", ...e.migrations].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

/** Texte en Markdown (pour un message, un document ou un ticket). */
export function journalMarkdown(entries: JournalEntry[], siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const lines: string[] = ["# Journal des mises à jour de Nebula", ""];
  for (const day of journalByDay(entries)) {
    lines.push(`## ${dayLabel(day.date)}`, "");
    for (const e of day.entries) {
      lines.push(`### ${e.title} (${e.category})`);
      lines.push(`Pages : ${e.links.map((l) => `[${l.label}](${base}${l.href})`).join(", ")}`);
      lines.push(`Résultat : ${e.result}`);
      lines.push(`Modification : ${e.change}`, "");
    }
  }
  return lines.join("\n");
}
