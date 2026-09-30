// Graduations des axes de valeurs (30/09/2026) : « 20 k » au lieu de
// « 20000 ». La colonne de l'axe fait 40 à 44 px : au-delà de 4 chiffres,
// recharts coupait le début du nombre (« 20000 » devenait « 0000 » sur la
// courbe des abonnés, en particulier sur mobile). Les infobulles gardent le
// nombre exact.
const COMPACT = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

export function axisTick(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return COMPACT.format(n);
}
