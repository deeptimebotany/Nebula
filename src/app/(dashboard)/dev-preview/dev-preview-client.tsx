"use client";

// Contenu de l'onglet privé /dev-preview (voir page.tsx pour le garde-fou
// serveur) : un sélecteur "Aperçu de palier" tout en haut, puis trois
// listes — Cosmétiques, Fonds d'écran, Easter eggs — avec pour chacune une
// explication et, pour les deux premières, un bouton pour l'activer/la
// sélectionner directement depuis cette page.
//
// Deux modes, pilotés par /api/dev-preview/plan (voir dev-preview.ts) :
// - "Tout déverrouillé" (par défaut) : chaque cosmétique/fond est
//   sélectionnable sans condition, pour vérifier son RENDU une fois activé.
// - "Aperçu Gratuit/Pro/Agence" : le site se comporte EXACTEMENT comme pour
//   un vrai compte sur ce palier — cadenas, boutons désactivés, tout ce qui
//   serait verrouillé le reste vraiment ici aussi (côté serveur, pas
//   seulement visuellement) — pour vérifier le rendu de ce qui est BLOQUÉ,
//   pas seulement de ce qui est débloqué. Ça s'applique aussi en dehors de
//   cette page : Paramètres (cosmétiques, fonds, thèmes, thème étoilé)
//   reflète le même aperçu tant qu'il reste actif.
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { clsx } from "@/lib/clsx";
import { useCosmetics } from "@/components/cosmetics-provider";
import { useBackground } from "@/components/background-provider";
import { IconFlask, IconTrophy, IconLock } from "@/components/dashboard/icons";
import { canUseBackground, type BackgroundDefinition } from "@/lib/backgrounds";
import type { CosmeticDefinition } from "@/lib/cosmetics";
import type { EasterEggDef } from "@/lib/easter-eggs-registry";
import type { Plan } from "@/lib/plans";

// Où observer chaque cosmétique sur le site — absent du catalogue lui-même
// (src/lib/cosmetics.ts) qui n'a pas besoin de cette info pour fonctionner,
// donc renseigné ici, uniquement pour cette page de référence.
const COSMETIC_LOCATION: Record<string, string> = {
  "constellation-calendrier": "Fond derrière la grille du Calendrier.",
  "ciel-nocturne-composer": "Fond derrière la page Importation.",
  "anneau-saturne-avatar": "Pastille de marque active, en haut à gauche (barre du haut).",
  "halo-dore-avatar": "Pastille de marque active, en haut à gauche (barre du haut) — cumulable avec l'anneau de Saturne.",
  "eclat-dore-statcard": "Contour des cartes de statistiques, sur Analytics, une fois le palier d'abonnés dépassé.",
  "police-cosmique": "Tous les titres de page (h1) du site.",
  "papier-peint-succes": "Fond de la page Succès.",
  "son-pulsar": "Son joué à l'apparition d'une notification de succès.",
  "message-accueil-perso": "Texte d'accueil en haut de la Vue d'ensemble.",
  "sidebar-poussiere-etoiles": "Fond du menu latéral (icône ☰ en haut à gauche).",
  "icone-app-retro": "Icône de l'onglet du navigateur (favicon)."
};

const PLAN_OPTIONS: { value: Plan | null; label: string }[] = [
  { value: null, label: "Tout déverrouillé" },
  { value: "FREE", label: "Aperçu Gratuit" },
  { value: "PRO", label: "Aperçu Pro" },
  { value: "AGENCY", label: "Aperçu Agence" }
];

interface DevPreviewClientProps {
  cosmetics: CosmeticDefinition[];
  backgrounds: BackgroundDefinition[];
  eggs: EasterEggDef[];
}

export function DevPreviewClient({ cosmetics, backgrounds, eggs }: DevPreviewClientProps) {
  const cosmeticsCtx = useCosmetics();
  const { backgroundKey, setBackgroundKey } = useBackground();
  const [eggFound, setEggFound] = useState<Map<string, string>>(new Map());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<Plan | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [switchingPlan, setSwitchingPlan] = useState(false);

  useEffect(() => {
    fetch("/api/easter-eggs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.eggs) return;
        const map = new Map<string, string>();
        for (const e of d.eggs as { key?: string; found: boolean; foundAt?: string }[]) {
          if (e.found && e.key) map.set(e.key, e.foundAt ?? "");
        }
        setEggFound(map);
      })
      .catch(() => undefined);
    fetch("/api/dev-preview/plan", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlanPreview((d?.plan as Plan | null) ?? null))
      .finally(() => setPlanLoaded(true))
      .catch(() => undefined);
  }, []);

  async function choosePlanPreview(next: Plan | null) {
    setSwitchingPlan(true);
    const res = await fetch("/api/dev-preview/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: next })
    }).catch(() => null);
    // Rechargement complet plutôt qu'un simple re-fetch : Cosmétiques, Fonds
    // d'écran, Thèmes et Thème étoilé ont chacun leur propre provider monté
    // une seule fois tout en haut de l'appli (voir providers.tsx) — le
    // rechargement garantit que les quatre repartent bien du nouvel aperçu,
    // plutôt que de devoir tous les rafraîchir un par un depuis ici.
    if (res?.ok) window.location.reload();
    else setSwitchingPlan(false);
  }

  async function toggleCosmetic(key: string, next: boolean) {
    setSavingKey(key);
    await cosmeticsCtx.setEnabled(key, next);
    setSavingKey(null);
  }

  function backgroundLocked(bg: BackgroundDefinition): boolean {
    if (!planPreview) return false; // mode "tout déverrouillé"
    if (bg.requiresPlan) return !canUseBackground(bg, planPreview);
    if (bg.requiresEgg) return !eggFound.has(bg.requiresEgg);
    return false;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
          <IconFlask className="h-6 w-6 text-aurora-300" /> Test / QA
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Onglet privé, visible uniquement sur ce compte : tout ce qui a été ajouté ou modifié récemment
          (cosmétiques, fonds d&apos;écran, easter eggs), avec ce que ça fait, où le voir, et un aperçu de ce que
          voit réellement un compte Gratuit/Pro/Agence.
        </p>
      </div>

      <GlassCard>
        <h2 className="font-display text-base font-medium text-white">Aperçu de palier</h2>
        <p className="mt-1 text-sm text-slate-400">
          S&apos;applique à tout le site pendant que c&apos;est actif (Cosmétiques, Fonds d&apos;écran, Thèmes,
          Thème étoilé, ici comme dans Paramètres) : en aperçu, les items réservés à un palier supérieur sont
          vraiment verrouillés — cadenas, sélection refusée — comme pour un vrai compte sur ce palier. Les easter
          eggs restent basés sur ceux réellement trouvés par ce compte, aperçu ou non.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PLAN_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              disabled={!planLoaded || switchingPlan}
              onClick={() => choosePlanPreview(opt.value)}
              className={clsx(
                "rounded-full border px-3.5 py-2 text-sm font-medium transition disabled:opacity-50",
                planPreview === opt.value
                  ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300"
                  : "border-white/10 text-slate-300 hover:border-white/25"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {switchingPlan && <p className="mt-2 text-xs text-slate-500">Changement d&apos;aperçu, rechargement...</p>}
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-base font-medium text-white">Cosmétiques</h2>
        <p className="mt-1 text-sm text-slate-400">
          Les mêmes réglages que Paramètres → Cosmétiques, avec le même verrouillage que l&apos;aperçu de palier
          choisi ci-dessus.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {cosmetics.map((c) => {
            const on = cosmeticsCtx.enabled.has(c.key);
            const locked = planLoaded && cosmeticsCtx.loaded && !cosmeticsCtx.allowedKeys.has(c.key);
            return (
              <div
                key={c.key}
                className={clsx(
                  "flex items-start justify-between gap-3 rounded-xl border p-3 transition",
                  locked ? "border-white/5 opacity-60" : "border-white/10"
                )}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm text-slate-200">
                    {c.label}
                    <span
                      className={clsx(
                        "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                        locked ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-300" : "border-white/10 bg-white/[0.03] text-slate-500"
                      )}
                    >
                      {locked && <IconLock className="h-2.5 w-2.5" />}
                      {c.requiresEgg ? `Easter egg : ${c.requiresEgg}` : c.requiresPlan ? `Palier ${c.requiresPlan}` : "Gratuit"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
                  {COSMETIC_LOCATION[c.key] && (
                    <p className="mt-1 text-xs text-aurora-300/80">Où : {COSMETIC_LOCATION[c.key]}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={locked || savingKey === c.key || !cosmeticsCtx.loaded}
                  onClick={() => toggleCosmetic(c.key, !on)}
                  className={clsx(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50",
                    on
                      ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300"
                      : "border-white/10 text-slate-300 hover:border-white/25"
                  )}
                >
                  {on ? "Activé" : "Désactivé"}
                </button>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-base font-medium text-white">Fonds d&apos;écran</h2>
        <p className="mt-1 text-sm text-slate-400">
          Cliquez pour appliquer instantanément un fond à tout le site. Verrouillés (cadenas) selon le même aperçu
          de palier.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {backgrounds.map((bg) => {
            const locked = backgroundLocked(bg);
            return (
              <button
                key={bg.key}
                type="button"
                onClick={() => setBackgroundKey(bg.key)}
                className={clsx(
                  "relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 text-center transition",
                  backgroundKey === bg.key
                    ? "border-aurora-400 bg-white/[0.04]"
                    : locked
                      ? "border-white/5 opacity-60 hover:opacity-90"
                      : "border-white/10 hover:border-white/25"
                )}
              >
                {locked && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-void-950/90 text-slate-300">
                    <IconLock className="h-2.5 w-2.5" />
                  </span>
                )}
                <span className="h-12 w-full rounded-lg shadow-inner" style={{ background: bg.css }} />
                <span className="line-clamp-1 text-[11px] text-slate-300">{bg.label}</span>
                <span className="text-[10px] text-slate-500">
                  {bg.animationClass ? "Animé" : "Statique"}
                  {bg.requiresEgg ? ` · egg : ${bg.requiresEgg}` : bg.requiresPlan ? ` · Palier ${bg.requiresPlan}` : " · Gratuit"}
                </span>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="flex items-center gap-2 font-display text-base font-medium text-white">
          <IconTrophy className="h-4 w-4 text-amber-300" /> Easter eggs ({eggs.length})
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Indices en clair — jamais révélés ailleurs avant d&apos;être trouvés (voir la page Succès pour la version
          publique).
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {eggs.map((e) => {
            const foundAt = eggFound.get(e.key);
            return (
              <div
                key={e.key}
                className={clsx(
                  "rounded-xl border p-3",
                  foundAt ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-white/10"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{e.emoji}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">#{e.number}</span>
                  <span className="text-sm font-medium text-white">{e.title}</span>
                  {foundAt && <span className="ml-auto text-[10px] text-emerald-300">Trouvé</span>}
                </div>
                <p className="mt-1 text-xs text-slate-400">{e.hint}</p>
                {e.reward && <p className="mt-1 text-[11px] text-aurora-300/80">Récompense : {e.reward}</p>}
                <p className="mt-0.5 text-[10px] text-slate-600">Clé : {e.key}</p>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
