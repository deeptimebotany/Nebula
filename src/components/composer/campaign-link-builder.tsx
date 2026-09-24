"use client";

// Générateur de liens de campagne (paramètres UTM), intégré à Nebula pour
// ne pas passer par un outil externe. Utilisé dans le Composer (insertion
// dans la description ou le premier commentaire) et dans la Page bio (URL
// d'un nouveau lien). Tout se passe dans le navigateur : aucun appel réseau.
//
// Champs, dans le vocabulaire de Google Analytics :
//   URL du site (obligatoire) · source (utm_source, obligatoire) ·
//   support (utm_medium) · campagne (utm_campaign) · mots-clés (utm_term) ·
//   contenu (utm_content).
// Les campagnes récentes sont mémorisées dans ce navigateur, par marque,
// pour les réutiliser en un clic.

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { clsx } from "@/lib/clsx";

export interface CampaignFields {
  url: string;
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
}

const EMPTY: CampaignFields = { url: "", source: "", medium: "social", campaign: "", term: "", content: "" };

const SOURCE_PRESETS = ["instagram", "facebook", "tiktok", "youtube", "linkinbio", "newsletter"];
const MEDIUM_PRESETS = ["social", "paid_social", "bio", "email", "video"];

const FIELD_HELP: Record<keyof CampaignFields, string> = {
  url: "L'adresse de la page où vous voulez envoyer les visiteurs (votre site, une page produit, une inscription…).",
  source: "D'où vient le visiteur : le réseau ou le site qui affiche le lien (instagram, tiktok, newsletter…). Obligatoire pour que la campagne soit reconnue par Google Analytics.",
  medium: "Le type de canal : social pour une publication, paid_social pour une publicité, email pour une newsletter, bio pour la Page bio…",
  campaign: "Le nom de votre opération, pour regrouper tous ses liens dans vos statistiques (ex. soldes_ete, lancement_produit).",
  term: "Facultatif. Les mots-clés associés, surtout utiles pour les publicités payantes.",
  content: "Facultatif. Pour distinguer deux liens d'une même campagne (ex. story vs publication, bouton A vs bouton B)."
};

const LABELS: Record<keyof CampaignFields, string> = {
  url: "URL du site web",
  source: "Source",
  medium: "Support",
  campaign: "Nom de la campagne",
  term: "Mots-clés",
  content: "Contenu"
};

const PARAM: Record<Exclude<keyof CampaignFields, "url">, string> = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  term: "utm_term",
  content: "utm_content"
};

/** « Soldes Été 2026 » → « soldes_ete_2026 » (minuscules, sans accents ni espaces). */
export function normalizeUtmValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Construit l'URL finale ; null si l'URL de départ est invalide. */
export function buildCampaignUrl(fields: CampaignFields, normalize = true): string | null {
  const raw = fields.url.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!url.hostname.includes(".")) return null;
  for (const key of Object.keys(PARAM) as (keyof typeof PARAM)[]) {
    const value = normalize ? normalizeUtmValue(fields[key]) : fields[key].trim();
    if (value) url.searchParams.set(PARAM[key], value);
    else url.searchParams.delete(PARAM[key]);
  }
  return url.toString();
}

const RECENT_PREFIX = "nebula:utm-recent:";

function loadRecent(brandId: string): CampaignFields[] {
  try {
    const raw = localStorage.getItem(RECENT_PREFIX + brandId);
    const list = raw ? (JSON.parse(raw) as CampaignFields[]) : [];
    return Array.isArray(list) ? list.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(brandId: string, fields: CampaignFields) {
  try {
    const list = loadRecent(brandId).filter((f) => !(f.url === fields.url && f.campaign === fields.campaign && f.source === fields.source));
    localStorage.setItem(RECENT_PREFIX + brandId, JSON.stringify([fields, ...list].slice(0, 5)));
  } catch {
    // stockage indisponible : pas de mémoire des campagnes, sans gravité
  }
}

export interface CampaignLinkAction {
  label: string;
  onApply: (url: string) => void;
  /** Bouton principal (mis en avant). */
  primary?: boolean;
}

export function CampaignLinkBuilder({
  open,
  onClose,
  brandId,
  defaultSource,
  defaultMedium,
  actions,
  tip,
  initialUrl
}: {
  open: boolean;
  onClose: () => void;
  brandId: string | undefined;
  defaultSource?: string;
  defaultMedium?: string;
  actions: CampaignLinkAction[];
  /** Conseil affiché sous l'aperçu (ex. liens non cliquables sur Instagram). */
  tip?: string;
  /** URL déjà saisie ailleurs (ex. champ de la Page bio), reprise à l'ouverture. */
  initialUrl?: string;
}) {
  const [fields, setFields] = useState<CampaignFields>(EMPTY);
  const [normalize, setNormalize] = useState(true);
  const [recent, setRecent] = useState<CampaignFields[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRecent(brandId ? loadRecent(brandId) : []);
    setCopied(false);
    setFields((prev) => ({
      ...prev,
      url: initialUrl?.trim() ? initialUrl.trim() : prev.url,
      source: prev.source || defaultSource || "",
      medium: prev.medium || defaultMedium || EMPTY.medium
    }));
    // On ne relit ces valeurs qu'à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const finalUrl = useMemo(() => buildCampaignUrl(fields, normalize), [fields, normalize]);
  const urlInvalid = fields.url.trim().length > 0 && !finalUrl;
  const missingSource = !fields.source.trim();
  const ready = Boolean(finalUrl) && !missingSource;

  function set<K extends keyof CampaignFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function apply(action: CampaignLinkAction) {
    if (!finalUrl || !ready) return;
    if (brandId) saveRecent(brandId, fields);
    action.onApply(finalUrl);
    onClose();
  }

  async function copy() {
    if (!finalUrl || !ready) return;
    try {
      await navigator.clipboard.writeText(finalUrl);
      if (brandId) saveRecent(brandId, fields);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible : l'URL reste sélectionnable à la main
    }
  }

  const field = (key: keyof CampaignFields, options: { placeholder: string; required?: boolean; presets?: string[] }) => (
    <div>
      <label htmlFor={`utm-${key}`} className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
        {LABELS[key]}
        {options.required && <span className="text-aurora-300">*</span>}
        {key !== "url" && <span className="font-mono text-[10px] text-slate-600">{PARAM[key as keyof typeof PARAM]}</span>}
        <InfoTip label={`À quoi sert « ${LABELS[key]} » ?`}>{FIELD_HELP[key]}</InfoTip>
      </label>
      <input
        id={`utm-${key}`}
        value={fields[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={options.placeholder}
        inputMode={key === "url" ? "url" : undefined}
        className={clsx(
          "w-full rounded-lg border bg-white/[0.03] px-3 py-2 text-sm text-white outline-none transition focus:border-aurora-400/60",
          key === "url" && urlInvalid ? "border-red-400/50" : "border-white/10"
        )}
      />
      {options.presets && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {options.presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set(key, p)}
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[11px] transition",
                normalizeUtmValue(fields[key]) === p ? "border-aurora-400/60 bg-aurora-400/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25 hover:text-white"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Lien de campagne" maxWidthClassName="max-w-xl">
      <p className="text-sm text-slate-400">
        Ajoutez des paramètres de suivi (UTM) à votre lien pour savoir, dans Google Analytics ou votre outil de statistiques, quelles publications amènent des visiteurs et des ventes.
      </p>

      {recent.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Campagnes récentes</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {recent.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setFields(r)}
                title={buildCampaignUrl(r) ?? r.url}
                className="max-w-full truncate rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1 text-xs text-slate-300 transition hover:border-aurora-400/40 hover:text-white"
              >
                {r.campaign || r.url.replace(/^https?:\/\//, "")} · {r.source}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {field("url", { placeholder: "https://monsite.fr/offre", required: true })}
        {urlInvalid && <p className="-mt-2 text-xs text-red-300">Adresse non valide (ex. https://monsite.fr/page).</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("source", { placeholder: "instagram", required: true, presets: SOURCE_PRESETS })}
          {field("medium", { placeholder: "social", presets: MEDIUM_PRESETS })}
        </div>
        {field("campaign", { placeholder: "soldes_ete_2026" })}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("term", { placeholder: "chaussures running" })}
          {field("content", { placeholder: "story_1" })}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} className="h-3.5 w-3.5 rounded border-white/20 bg-white/[0.03]" />
          Nettoyer les valeurs (minuscules, sans accents ni espaces) — recommandé pour des statistiques propres
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Lien généré</p>
        <p className={clsx("mt-1 break-all font-mono text-xs", ready ? "text-white" : "text-slate-500")}>
          {finalUrl ? finalUrl : "Renseignez l'URL du site et la source pour obtenir le lien."}
        </p>
        {finalUrl && missingSource && <p className="mt-1 text-xs text-amber-300">Ajoutez une source : sans elle, la campagne n&apos;est pas reconnue.</p>}
        {tip && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{tip}</p>}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={copy} disabled={!ready}>
          {copied ? "Copié !" : "Copier"}
        </Button>
        {actions.map((a) => (
          <Button key={a.label} variant={a.primary ? "glow" : "outline"} onClick={() => apply(a)} disabled={!ready}>
            {a.label}
          </Button>
        ))}
      </div>
    </Modal>
  );
}
