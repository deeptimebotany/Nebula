"use client";

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { THEMES, canUseTheme } from "@/lib/themes";
import { BACKGROUNDS, canUseBackground } from "@/lib/backgrounds";
import { useTheme } from "@/components/theme-provider";
import { useBackground } from "@/components/background-provider";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { IconGift, IconSettings, IconLock, IconUpload } from "@/components/dashboard/icons";
import { BackgroundCarousel } from "@/components/settings/background-carousel";
import { AccountPrivacyCard } from "@/components/settings/account-privacy-card";
import { useStarfield } from "@/components/starfield-provider";
import { useCosmetics } from "@/components/cosmetics-provider";
import { COSMETICS, type CosmeticCategory } from "@/lib/cosmetics";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { EASTER_EGG_KEYS } from "@/lib/easter-eggs-registry";
import type { Plan } from "@/lib/plans";

const COSMETIC_CATEGORIES: { key: CosmeticCategory; label: string }[] = [
  { key: "decor", label: "Décor" },
  { key: "son", label: "Son" },
  { key: "profil", label: "Profil" }
];

interface ReferralInfo {
  code: string;
  referredByCode: string | null;
  aiTrialActive: boolean;
  aiTrialUntil: string | null;
}

function swatchPreview(vars: Record<string, string>) {
  const nebula500 = `rgb(${vars["--c-nebula-500"]})`;
  const aurora400 = `rgb(${vars["--c-aurora-400"]})`;
  const accentCyan = `rgb(${vars["--c-accent-cyan"]})`;
  return `linear-gradient(135deg, ${nebula500}, ${aurora400} 55%, ${accentCyan})`;
}

// Easter egg : le thème caché "Nova" (voir src/lib/themes.ts, hidden: true)
// se révèle en tapant ce mot n'importe où sur cette page (hors champ de
// saisie) — persistant en localStorage pour qu'il reste visible aux
// prochaines visites une fois trouvé.
const NOVA_UNLOCK_WORD = "nova";
const NOVA_UNLOCK_STORAGE_KEY = "nebula:theme-nova-unlocked";

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable || tag === "SELECT";
}

export default function SettingsPage() {
  const { themeKey, setThemeKey } = useTheme();
  const { backgroundKey, setBackgroundKey } = useBackground();
  const {
    enabled: starfieldEnabled,
    allowed: starfieldAllowed,
    loaded: starfieldLoaded,
    setEnabled: setStarfieldEnabled,
    refresh: refreshStarfield
  } = useStarfield();
  const [savingStarfield, setSavingStarfield] = useState(false);
  const cosmetics = useCosmetics();
  const [cosmeticsSaving, setCosmeticsSaving] = useState<string | null>(null);
  // Easter egg "Son Décollage" (voir /api/settings/publish-sound) : contrairement
  // aux cosmétiques ci-dessus, réservés par palier, cette option se débloque
  // en JOUANT (10ᵉ post personnel publié) — d'où un état à part, chargé une
  // seule fois au montage plutôt que via CosmeticsProvider.
  const [publishSound, setPublishSound] = useState({ enabled: false, unlocked: false, loaded: false });
  const [savingPublishSound, setSavingPublishSound] = useState(false);
  // Easter eggs qui débloquent un FOND D'ÉCRAN plutôt qu'un cosmétique de la
  // liste Cosmétiques (voir requiresEgg dans src/lib/backgrounds.ts) : la clé
  // n'apparaît dans /api/easter-eggs QUE si trouvée (jamais dévoilée sinon),
  // donc ce Set fait exactement ce qu'il faut sans rien exposer de plus.
  const [foundEggKeys, setFoundEggKeys] = useState<Set<string>>(new Set());
  // Compte propriétaire (voir dev-preview.ts) : /api/easter-eggs renvoie
  // isOwner=true pour lui seul — sert ici à ne plus bloquer côté client la
  // sélection d'un fond d'écran réservé (le serveur, lui, l'autorise déjà
  // sans condition pour ce compte, voir /api/settings/background).
  const [isOwner, setIsOwner] = useState(false);
  // "Aperçu de palier" (voir dev-preview.ts et le bouton plus bas) : null =
  // aucun aperçu choisi (mode "tout déverrouillé" pour ce compte, comportement
  // par défaut), sinon simule exactement ce que verrait un compte sur ce
  // palier — y compris les cosmétiques/fonds/thèmes VERROUILLÉS.
  const [planPreview, setPlanPreview] = useState<Plan | null>(null);
  const { activeBrand, renameBrand } = useBrand();
  const toast = useToast();
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [plan, setPlan] = useState<Plan>("FREE");
  const [pseudo, setPseudo] = useState("");
  const [savingPseudo, setSavingPseudo] = useState(false);
  // Voir isOwner/planPreview ci-dessus : ce compte voit tout comme débloqué
  // par défaut (fonds d'écran réservés par palier OU par easter egg), sauf
  // si un aperçu de palier précis est actif, auquel cas les items de PALIER
  // suivent ce palier simulé — les items à easter egg, eux, restent basés
  // sur les eggs RÉELLEMENT trouvés par ce compte, aperçu ou non.
  const effectivePlan: Plan = planPreview ?? (isOwner ? "AGENCY" : plan);
  const effectiveFoundEggKeys = isOwner && !planPreview ? new Set(EASTER_EGG_KEYS) : foundEggKeys;

  // Revérifie systématiquement le droit d'accès au thème étoilé à chaque
  // affichage de cette page (voir refresh() dans starfield-provider.tsx) :
  // le montage initial de <Providers>, tout en haut de l'appli, ne se refait
  // pas à chaque navigation interne, donc sans ça un palier qui vient de
  // changer resterait affiché comme verrouillé jusqu'au rechargement complet
  // de l'onglet.
  useEffect(() => {
    refreshStarfield();
    cosmetics.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshStarfield]);

  async function onToggleCosmetic(key: string, next: boolean) {
    setCosmeticsSaving(key);
    const ok = await cosmetics.setEnabled(key, next);
    setCosmeticsSaving(null);
    if (!ok) {
      toast.error("Échec de l'enregistrement du cosmétique.");
      return;
    }
    toast.success(next ? "Cosmétique activé." : "Cosmétique désactivé.");
  }

  // Easter egg thème "Nova" — voir NOVA_UNLOCK_WORD ci-dessus.
  const [novaUnlocked, setNovaUnlocked] = useState(false);
  const novaProgress = useRef(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(NOVA_UNLOCK_STORAGE_KEY) === "1") setNovaUnlocked(true);
    } catch {
      // stockage indisponible — l'egg reste simplement à retrouver à chaque visite
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.key.length !== 1) return;
      const key = e.key.toLowerCase();
      const expected = NOVA_UNLOCK_WORD[novaProgress.current];
      if (key === expected) {
        novaProgress.current += 1;
        if (novaProgress.current === NOVA_UNLOCK_WORD.length) {
          novaProgress.current = 0;
          setNovaUnlocked(true);
          toast.success("✨ Thème caché débloqué : Nova !");
          reportEasterEggFound("nova-theme");
          try {
            localStorage.setItem(NOVA_UNLOCK_STORAGE_KEY, "1");
          } catch {
            // tant pis, il faudra le retaper la prochaine fois
          }
        }
      } else {
        novaProgress.current = key === NOVA_UNLOCK_WORD[0] ? 1 : 0;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toast]);

  // Marque blanche (palier Agence) — voir carte dédiée plus bas.
  const [wlName, setWlName] = useState("");
  const [wlLogoUrl, setWlLogoUrl] = useState<string | null>(null);
  const [wlUploading, setWlUploading] = useState(false);
  const [wlSaving, setWlSaving] = useState(false);
  const wlFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPseudo(activeBrand?.name ?? "");
  }, [activeBrand?.id, activeBrand?.name]);

  async function onSavePseudo() {
    if (!activeBrand || !pseudo.trim() || pseudo.trim() === activeBrand.name) return;
    setSavingPseudo(true);
    const res = await renameBrand(activeBrand.id, pseudo.trim());
    setSavingPseudo(false);
    if (!res.ok) {
      toast.error(res.error ?? "Erreur lors du renommage.");
      return;
    }
    toast.success("Pseudo de la marque mis à jour.");
  }

  useEffect(() => {
    fetch("/api/referral")
      .then((r) => (r.ok ? r.json() : null))
      .then(setReferral)
      .catch(() => undefined);
    fetch("/api/billing/plan")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.plan && setPlan(d.plan))
      .catch(() => undefined);
    fetch("/api/settings/white-label")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setWlName(d.brandName ?? "");
        setWlLogoUrl(d.logoUrl ?? null);
      })
      .catch(() => undefined);
    fetch("/api/settings/publish-sound")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setPublishSound({ enabled: Boolean(d.enabled), unlocked: Boolean(d.unlocked), loaded: true });
      })
      .catch(() => undefined);
    fetch("/api/easter-eggs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.eggs) return;
        const keys = (d.eggs as { found: boolean; key?: string }[]).filter((e) => e.found && e.key).map((e) => e.key as string);
        setFoundEggKeys(new Set(keys));
        setIsOwner(Boolean(d.isOwner));
      })
      .catch(() => undefined);
    // Aperçu de palier (voir dev-preview.ts) : toujours { plan: null } pour
    // qui n'est pas le compte propriétaire, donc sans effet pour tout le
    // monde d'autre.
    fetch("/api/dev-preview/plan", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlanPreview((d?.plan as Plan | null) ?? null))
      .catch(() => undefined);
  }, []);

  async function onTogglePublishSound() {
    if (!publishSound.unlocked) return;
    setSavingPublishSound(true);
    const next = !publishSound.enabled;
    const res = await fetch("/api/settings/publish-sound", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next })
    }).catch(() => null);
    setSavingPublishSound(false);
    if (!res || !res.ok) {
      toast.error("Échec de l'enregistrement.");
      return;
    }
    setPublishSound((prev) => ({ ...prev, enabled: next }));
    toast.success(next ? "Son de décollage activé." : "Son de décollage désactivé.");
  }

  async function saveWhiteLabel(next: { brandName?: string | null; logoUrl?: string | null }) {
    setWlSaving(true);
    const res = await fetch("/api/settings/white-label", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    });
    setWlSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    toast.success("Marque blanche mise à jour.");
  }

  async function onWlLogoChosen(file: File) {
    setWlUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/media/thumbnails/upload", { method: "POST", body: form });
    const data = await res.json();
    setWlUploading(false);
    if (!res.ok) {
      toast.error(data.error ?? "Échec de l'envoi du logo.");
      return;
    }
    setWlLogoUrl(data.url);
    saveWhiteLabel({ logoUrl: data.url });
  }

  // Les deux fonctions ci-dessous passent par `effectivePlan`/
  // `effectiveFoundEggKeys` plutôt que par un simple `if (isOwner) return`
  // : ça reste correct qu'un aperçu de palier (voir planPreview plus haut)
  // soit actif ou non, sans dupliquer cette logique ici.
  function onPickTheme(themeKeyToPick: string) {
    const theme = THEMES.find((t) => t.key === themeKeyToPick);
    if (theme && !canUseTheme(theme, effectivePlan)) {
      toast.error(`Le thème "${theme.label}" nécessite le palier ${theme.requiresPlan}. Débloquez-le dans Facturation.`);
      return;
    }
    setThemeKey(themeKeyToPick);
  }

  function onPickBackground(backgroundKeyToPick: string) {
    const bg = BACKGROUNDS.find((b) => b.key === backgroundKeyToPick);
    if (bg?.requiresPlan && !canUseBackground(bg, effectivePlan)) {
      toast.error(`Le fond "${bg.label}" nécessite le palier ${bg.requiresPlan}. Débloquez-le dans Facturation.`);
      return;
    }
    if (bg?.requiresEgg && !effectiveFoundEggKeys.has(bg.requiresEgg)) {
      toast.error(`Le fond "${bg.label}" doit d'abord être débloqué (easter egg) — voir la page Succès.`);
      return;
    }
    setBackgroundKey(backgroundKeyToPick);
  }

  async function onToggleStarfield() {
    if (!starfieldAllowed) {
      toast.error("Le thème étoilé animé nécessite le palier Pro ou Agence. Débloquez-le dans Facturation.");
      return;
    }
    setSavingStarfield(true);
    const ok = await setStarfieldEnabled(!starfieldEnabled);
    setSavingStarfield(false);
    if (!ok) {
      toast.error("Échec de l'enregistrement du thème étoilé.");
      return;
    }
    toast.success(starfieldEnabled ? "Thème étoilé désactivé." : "✨ Thème étoilé activé — Maj + clic pour dessiner une constellation !");
    if (!starfieldEnabled) reportEasterEggFound("starfield-theme");
  }

  const referralUrl = referral ? `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${referral.code}` : "";

  async function copyReferral() {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    toast.success("Lien de parrainage copié.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
          <IconSettings className="h-5 w-5 text-slate-400" /> Paramètres
        </h1>
        <p className="mt-1 text-sm text-slate-400">Personnalisez votre espace Nebula.</p>
      </div>

      <GlassCard>
        <h2 className="font-display text-base font-medium text-white">Pseudo de la marque</h2>
        <p className="mt-1 text-sm text-slate-400">
          Le nom affiché pour <strong className="text-slate-300">{activeBrand?.name ?? "cette marque"}</strong>{" "}
          dans l&apos;aperçu d&apos;Importation, le sélecteur de marque, etc.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSavePseudo()}
            disabled={!activeBrand}
            placeholder="Pseudo de la marque"
            className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60 disabled:opacity-50"
          />
          <Button
            onClick={onSavePseudo}
            disabled={!activeBrand || savingPseudo || !pseudo.trim() || pseudo.trim() === activeBrand?.name}
          >
            {savingPseudo ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-base font-medium text-white">Thème de couleurs</h2>
        <p className="mt-1 text-sm text-slate-400">
          Change l&apos;accent de couleur dans toute l&apos;application. Votre choix est mémorisé sur cet
          appareil et sur votre compte.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {THEMES.filter((t) => !t.hidden || novaUnlocked).map((t) => {
            const locked = !canUseTheme(t, effectivePlan);
            return (
              <button
                key={t.key}
                onClick={() => onPickTheme(t.key)}
                className={clsx(
                  "relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition",
                  themeKey === t.key
                    ? "border-aurora-400 bg-white/[0.04]"
                    : locked
                      ? "border-white/5 opacity-60 hover:opacity-90"
                      : "border-white/10 hover:border-white/25"
                )}
              >
                {locked && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-void-950/90 text-slate-300">
                    <IconLock className="h-3 w-3" />
                  </span>
                )}
                <span
                  className="h-10 w-full rounded-lg shadow-inner"
                  style={{ background: swatchPreview(t.vars) }}
                />
                <span className="text-xs text-slate-300">{t.label}</span>
                {locked && <span className="text-[10px] text-amber-400">Palier {t.requiresPlan}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Les thèmes verrouillés se débloquent avec un abonnement — voir{" "}
          <Link href="/billing" className="text-aurora-300 hover:underline">
            Facturation
          </Link>
          .
        </p>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-base font-medium text-white">Fond d&apos;écran</h2>
        <p className="mt-1 text-sm text-slate-400">
          34 fonds qui s&apos;accordent avec votre thème de couleurs, dont 4 fonds animés : deux réservés aux paliers
          Pro, un gratuit pour tout le monde, et un dernier à débloquer en trouvant l&apos;easter egg correspondant.
          Faites défiler avec les flèches ou en glissant à la souris.
        </p>
        <div className="mt-4">
          <BackgroundCarousel
            selected={backgroundKey}
            onSelect={onPickBackground}
            plan={effectivePlan}
            unlockedEggKeys={effectiveFoundEggKeys}
          />
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-medium text-white">Thème étoilé animé</h2>
          {!starfieldAllowed && (
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-amber-300">
              <IconLock className="h-3 w-3" /> Palier Pro
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Remplace le fond habituel par un vrai ciel étoilé qui défile en continu derrière toute l&apos;interface,
          avec un léger effet de profondeur. Réservé aux paliers Pro et Agence.
        </p>
        {!starfieldAllowed ? (
          <p className="mt-3 text-sm text-slate-500">
            Disponible avec le palier Pro ou Agence.{" "}
            <Link href="/billing" className="text-aurora-300 hover:underline">
              Voir Facturation
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleStarfield}
              disabled={savingStarfield || !starfieldLoaded}
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-medium transition disabled:opacity-60",
                starfieldEnabled
                  ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300"
                  : "border-white/10 text-slate-300 hover:border-white/25"
              )}
            >
              Thème étoilé {starfieldEnabled ? "activé" : "désactivé"}
            </button>
            <p className="text-xs text-slate-500">Une fois activé : Maj (Shift) + clic dessine une constellation.</p>
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-base font-medium text-white">Cosmétiques</h2>
        <p className="mt-1 text-sm text-slate-400">
          Petits effets visuels et sonores facultatifs — certains sont réservés aux paliers Pro/Agence, d&apos;autres
          se débloquent en trouvant l&apos;easter egg correspondant (voir la page Succès), tous activables/désactivables
          à volonté une fois débloqués.
        </p>
        <div className="mt-4 space-y-4">
          {COSMETIC_CATEGORIES.map(({ key: catKey, label: catLabel }) => {
            const items = COSMETICS.filter((c) => c.category === catKey);
            if (items.length === 0) return null;
            return (
              <div key={catKey}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{catLabel}</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {items.map((c) => {
                    const locked = !cosmetics.allowedKeys.has(c.key);
                    const on = cosmetics.enabled.has(c.key);
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
                            {locked && (
                              <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-amber-300">
                                <IconLock className="h-2.5 w-2.5" /> {c.requiresEgg ? "Easter egg" : `Palier ${c.requiresPlan}`}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
                        </div>
                        <button
                          type="button"
                          disabled={locked || cosmeticsSaving === c.key || !cosmetics.loaded}
                          onClick={() => onToggleCosmetic(c.key, !on)}
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
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Les cosmétiques marqués d&apos;un palier se débloquent avec un abonnement — voir{" "}
          <Link href="/billing" className="text-aurora-300 hover:underline">
            Facturation
          </Link>
          . Ceux marqués « Easter egg » se débloquent en jouant — voir la page{" "}
          <Link href="/succes" className="text-aurora-300 hover:underline">
            Succès
          </Link>
          .
        </p>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-medium text-white">Son Décollage</h2>
          {!publishSound.unlocked && (
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-amber-300">
              <IconLock className="h-3 w-3" /> À débloquer
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Un petit son de décollage accompagne chaque publication immédiate réussie. Se débloque en publiant votre
          10ᵉ post personnel (immédiat ou programmé).
        </p>
        {publishSound.unlocked && (
          <div className="mt-4">
            <button
              type="button"
              onClick={onTogglePublishSound}
              disabled={savingPublishSound || !publishSound.loaded}
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-medium transition disabled:opacity-60",
                publishSound.enabled
                  ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300"
                  : "border-white/10 text-slate-300 hover:border-white/25"
              )}
            >
              Son de décollage {publishSound.enabled ? "activé" : "désactivé"}
            </button>
          </div>
        )}
      </GlassCard>


      <GlassCard>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-medium text-white">Marque blanche</h2>
          {plan !== "AGENCY" && (
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-amber-300">
              <IconLock className="h-3 w-3" /> Palier Agence
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Remplacez &laquo; Nebula &raquo; par votre propre nom et logo dans la barre de navigation, ainsi que sur
          toutes les pages publiques que vos clients consultent sans se connecter (liens de validation, pages
          &laquo; link in bio &raquo;) — le crédit &laquo; Propulsé par Nebula &raquo; y disparaît automatiquement dès
          que c&apos;est configuré ici.
        </p>
        {plan !== "AGENCY" ? (
          <p className="mt-3 text-sm text-slate-500">
            Disponible avec le palier Agence.{" "}
            <Link href="/billing" className="text-aurora-300 hover:underline">
              Voir Facturation
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              {wlLogoUrl ? (
                <img src={wlLogoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <IconUpload className="h-5 w-5 text-slate-500" />
              )}
            </div>
            <input
              ref={wlFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onWlLogoChosen(e.target.files[0])}
            />
            <Button variant="outline" onClick={() => wlFileInputRef.current?.click()} disabled={wlUploading}>
              {wlUploading ? "Envoi..." : "Changer le logo"}
            </Button>
            <input
              value={wlName}
              onChange={(e) => setWlName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveWhiteLabel({ brandName: wlName.trim() })}
              placeholder="Nom affiché (ex : Studio Martin)"
              className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
            />
            <Button onClick={() => saveWhiteLabel({ brandName: wlName.trim() })} disabled={wlSaving}>
              {wlSaving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="flex items-center gap-2 font-display text-base font-medium text-white">
          <IconGift className="h-4 w-4 text-aurora-300" /> Parrainage
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Partagez votre code : toute personne qui l&apos;utilise à son inscription reçoit l&apos;assistant IA
          gratuitement pendant 14 jours, même sur le palier Gratuit.
        </p>

        {referral ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 font-display text-lg tracking-widest text-white">
                {referral.code}
              </span>
              <Button variant="outline" onClick={copyReferral}>
                {copied ? "Copié !" : "Copier le lien d'invitation"}
              </Button>
            </div>
            <p className="break-all text-xs text-slate-500">{referralUrl}</p>
            {referral.aiTrialActive && referral.aiTrialUntil && (
              <p className="text-xs text-emerald-300">
                IA offerte via parrainage jusqu&apos;au{" "}
                {new Date(referral.aiTrialUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Chargement...</p>
        )}
      </GlassCard>

      <AccountPrivacyCard />
    </div>
  );
}
