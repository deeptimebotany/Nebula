// Mise en forme des chiffres de l'onglet Publicité (fr-FR).
export function money(value: number | null | undefined, currency: string | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })} ${currency ?? ""}`.trim();
  }
}

export function moneyCompact(value: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR", notation: "compact", maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

export const int = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("fr-FR"));
export const dec = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${dec(n, 2)} %`);

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}
