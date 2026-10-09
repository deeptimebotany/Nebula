"use client";

// Fenêtre « Paramètres » (10/10/2026, demande de Lucas : « refaire toute
// l'UI des paramètres pour que ce soit plus joli ; pas une page sur le site,
// un cadre au milieu de l'écran avec tout le site qui devient flou, avec des
// onglets et des paramètres »).
//   - Fond : le site reste derrière, flouté et assombri ; clic à côté, Échap
//     ou la croix ferment la fenêtre (le focus revient où il était).
//   - Onglets à gauche (en haut sur téléphone, la fenêtre prend alors tout
//     l'écran) : Marque, Apparence, Focus et réussites, Sons, Notifications,
//     Parrainage, Compte. Raccourcis vers Facturation et Automatisations en
//     bas de la colonne.
//   - Chaque réglage est une ligne : nom et explication à gauche, interrupteur
//     ou bouton à droite, lignes séparées par un trait fin. Les interrupteurs
//     remplacent les boutons « … activé / désactivé ».
// Mêmes réglages et mêmes API qu'avant (ex-page /settings, qui ouvre
// maintenant cette fenêtre) ; rien ne change côté serveur.
import { ALL_REWARD_KEYS, isReussiteRewardKey } from "@/lib/reussites/catalog";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { RemoteImage } from "@/components/ui/remote-image";
import { Button, ButtonLink } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { MonthlySummarySettings } from "@/components/monthly-summary/summary-settings";
import { Input, Select } from "@/components/ui/input";
import { DEFAULT_TIMEZONE, timeZoneLabel, timeZoneOptions } from "@/lib/timezone";
import { Skeleton } from "@/components/ui/skeleton";
import { useFocusMode, useBootstrap } from "@/components/bootstrap-provider";
import { clsx } from "@/lib/clsx";
import { THEMES, canUseTheme } from "@/lib/themes";
import { ThemeCard } from "@/components/settings/theme-card";
import { BACKGROUNDS, canUseBackground } from "@/lib/backgrounds";
import { useTheme } from "@/components/theme-provider";
import { useBackground } from "@/components/background-provider";
import { useBrand } from "@/components/brand-context";
import { useMode } from "@/components/mode-provider";
import { useToast } from "@/components/dashboard/toast";
import { IconBell, IconCard, IconChevronRight, IconClose, IconFocus, IconGift, IconLock, IconPlug, IconShield, IconUpload, IconSun, IconMoon } from "@/components/dashboard/icons";
import { BackgroundCarousel } from "@/components/settings/background-carousel";
import { AccountPrivacyCard } from "@/components/settings/account-privacy-card";
import { StatsConsentCard } from "@/components/settings/stats-consent-card";
import { useStarfield } from "@/components/starfield-provider";
import { useCosmetics } from "@/components/cosmetics-provider";
import { COSMETICS, type CosmeticCategory } from "@/lib/cosmetics";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { EASTER_EGG_KEYS } from "@/lib/easter-eggs-registry";
import { isAchievementSoundOn, playAchievementArpeggio, setAchievementSoundOn } from "@/lib/cosmic-audio";
import type { Plan } from "@/lib/plans";
import { getPref, setPref } from "@/lib/ui-prefs-client";
import { PLAN_LIMITS } from "@/lib/plans";
import { restartGuidedTour } from "@/lib/tour-events";
import { SETTINGS_TABS, type SettingsTab } from "./settings-events";

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

// Easter egg : le thème caché "Nova" (voir src/lib/themes.ts, hidden: true)
// se révèle en tapant ce mot n'importe où dans les Paramètres (hors champ de
// saisie) — persistant pour qu'il reste visible une fois trouvé.
const NOVA_UNLOCK_WORD = "nova";
const NOVA_UNLOCK_STORAGE_KEY = "nebula:theme-nova-unlocked";

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable || tag === "SELECT";
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// --- Icônes des onglets (24 px, traits de 1,8, dessins propres à Nebula) ---
function TabSvg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}
function IconTag({ className }: { className?: string }) {
  return (
    <TabSvg className={className}>
      <path d="M3.5 12V5A1.5 1.5 0 0 1 5 3.5h7l8.5 8.5-8.5 8.5Z" />
      <circle cx="8.2" cy="8.2" r="1.5" />
    </TabSvg>
  );
}
function IconPalette({ className }: { className?: string }) {
  return (
    <TabSvg className={className}>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.9-1 1.5-2.1-.5-1.3.3-2.4 1.7-2.4h2.1a3.2 3.2 0 0 0 3.2-3.2C20.5 7.6 16.7 3.5 12 3.5Z" />
      <circle cx="7.8" cy="11" r="1" fill="currentColor" />
      <circle cx="10.5" cy="7.4" r="1" fill="currentColor" />
      <circle cx="15" cy="7.6" r="1" fill="currentColor" />
    </TabSvg>
  );
}
function IconSpeaker({ className }: { className?: string }) {
  return (
    <TabSvg className={className}>
      <path d="M4 9.5v5h3.5l4.5 4V5.5l-4.5 4Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.5a7.5 7.5 0 0 1 0 11" />
    </TabSvg>
  );
}

const TAB_ICONS: Record<SettingsTab, (p: { className?: string }) => JSX.Element> = {
  marque: IconTag,
  apparence: IconPalette,
  focus: IconFocus,
  sons: IconSpeaker,
  notifications: IconBell,
  parrainage: IconGift,
  compte: IconShield
};

// --- Briques de mise en page ------------------------------------------------

/** Une ligne de réglage : nom et explication à gauche, commande à droite. */
function Row({ title, badge, description, children, testId }: { title: ReactNode; badge?: ReactNode; description?: ReactNode; children?: ReactNode; testId?: string }) {
  return (
    <div className="nb-settings-row flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6" data-testid={testId}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-white">
          {title}
          {badge}
        </p>
        {description && <div className="mt-1 text-[13px] leading-relaxed text-slate-400">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Un bloc large (grille de thèmes, fonds, liste) : titre et explication au-dessus. */
function Block({ title, badge, description, children }: { title: ReactNode; badge?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="nb-settings-row py-5">
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-white">
        {title}
        {badge}
      </p>
      {description && <div className="mt-1 text-[13px] leading-relaxed text-slate-400">{description}</div>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function LockBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
      <IconLock className="h-3 w-3" /> {children}
    </span>
  );
}

interface SettingsDialogProps {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
}

export function SettingsDialog({ tab, onTabChange, onClose }: SettingsDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Focus : entre dans la fenêtre à l'ouverture, revient où il était à la
  // fermeture ; Tab reste dans la fenêtre ; Échap ferme. La page derrière ne
  // défile plus.
  useEffect(() => {
    if (!mounted) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [mounted]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      // Une autre fenêtre (confirmation…) par-dessus : elle gère son clavier.
      const otherDialog = active instanceof Element ? active.closest('[role="dialog"],[role="alertdialog"]') : null;
      if (otherDialog && otherDialog !== panel) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Nouvel onglet : on repart du haut.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const { focusMode, loaded: focusLoaded, setFocusMode } = useFocusMode();
  const [savingFocus, setSavingFocus] = useState(false);
  const bootstrap = useBootstrap();
  const { mode, setMode } = useMode();

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
  // Easter egg "Son Décollage" (voir /api/settings/publish-sound) : se
  // débloque en JOUANT (10ᵉ post personnel publié) — état à part, chargé à
  // l'ouverture.
  const [publishSound, setPublishSound] = useState({ enabled: false, unlocked: false, loaded: false });
  const [savingPublishSound, setSavingPublishSound] = useState(false);
  // Sons de l'interface (lot U5) : réglage du compte, servi par /api/me.
  const uiSoundsOn = bootstrap.data?.uiSounds !== false;
  const [savingUiSounds, setSavingUiSounds] = useState(false);
  async function onToggleUiSounds() {
    const next = !uiSoundsOn;
    setSavingUiSounds(true);
    const res = await fetch("/api/settings/ui-sounds", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) }).catch(() => null);
    setSavingUiSounds(false);
    if (res?.ok) bootstrap.patch({ uiSounds: next });
    else toast.error("Échec de l'enregistrement.");
  }
  // Son joué avec la célébration « Succès débloqué » (réglage de cet appareil).
  const [achievementSound, setAchievementSound] = useState(true);
  useEffect(() => setAchievementSound(isAchievementSoundOn()), []);
  function onToggleAchievementSound() {
    const next = !achievementSound;
    setAchievementSound(next);
    setAchievementSoundOn(next);
    if (next) playArpeggio();
  }
  function playArpeggio() {
    try {
      playAchievementArpeggio();
    } catch {
      // audio indisponible
    }
  }
  // Easter eggs qui débloquent un FOND D'ÉCRAN (requiresEgg dans
  // src/lib/backgrounds.ts) : la clé n'apparaît dans /api/easter-eggs QUE si
  // trouvée, donc ce Set n'expose rien de plus.
  const [foundEggKeys, setFoundEggKeys] = useState<Set<string>>(new Set());
  // Compte propriétaire (voir dev-preview.ts) : tout débloqué côté client.
  const [isOwner, setIsOwner] = useState(false);
  // « Aperçu de palier » (dev-preview.ts) : null = aucun aperçu.
  const [planPreview, setPlanPreview] = useState<Plan | null>(null);
  const { activeBrand, renameBrand, updateBrand } = useBrand();
  // Fuseau horaire de programmation de la marque (Lot 4, voir src/lib/timezone.ts).
  const [tzOptions] = useState<string[]>(() => timeZoneOptions());
  const [savingTimezone, setSavingTimezone] = useState(false);
  async function onChangeTimezone(next: string) {
    if (!activeBrand || next === activeBrand.timezone) return;
    setSavingTimezone(true);
    const res = await updateBrand(activeBrand.id, { timezone: next });
    setSavingTimezone(false);
    if (!res.ok) {
      toast.error(res.error ?? "Impossible d'enregistrer le fuseau horaire.");
      return;
    }
    toast.success(`Fuseau horaire : ${next.replace(/_/g, " ")}.`);
  }
  // Notifications du compte (Lot 4, voir User.notifyOnFailure).
  const [savingNotify, setSavingNotify] = useState(false);
  async function onToggleNotify(next: boolean) {
    setSavingNotify(true);
    const res = await fetch("/api/settings/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyOnFailure: next })
    }).catch(() => null);
    setSavingNotify(false);
    if (!res || !res.ok) {
      toast.error("Échec de l'enregistrement.");
      return;
    }
    bootstrap.patch({ notifyOnFailure: next });
    toast.success(next ? "Vous serez prévenu·e par email en cas d'échec." : "Emails d'échec désactivés.");
  }
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  async function onToggleLifecycle(next: boolean) {
    setSavingLifecycle(true);
    const res = await fetch("/api/settings/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lifecycleEmails: next })
    }).catch(() => null);
    setSavingLifecycle(false);
    if (!res || !res.ok) {
      toast.error("Échec de l'enregistrement.");
      return;
    }
    bootstrap.patch({ lifecycleEmails: next });
    toast.success(next ? "Conseils par email réactivés." : "Vous ne recevrez plus les conseils par email.");
  }
  const toast = useToast();
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [plan, setPlan] = useState<Plan>("FREE");
  const [pseudo, setPseudo] = useState("");
  const [savingPseudo, setSavingPseudo] = useState(false);
  // Compte propriétaire : tout débloqué, sauf si un aperçu de palier est actif.
  const effectivePlan: Plan = planPreview ?? (isOwner ? "AGENCY" : plan);
  const effectiveFoundEggKeys = isOwner && !planPreview ? new Set([...EASTER_EGG_KEYS, ...ALL_REWARD_KEYS]) : foundEggKeys;

  // Droit au thème étoilé et cosmétiques revérifiés à chaque ouverture (un
  // palier qui vient de changer ne reste pas affiché comme verrouillé).
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
      if (getPref(NOVA_UNLOCK_STORAGE_KEY) === "1") setNovaUnlocked(true);
    } catch {
      // stockage indisponible — l'egg reste simplement à retrouver
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
            setPref(NOVA_UNLOCK_STORAGE_KEY, "1");
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

  // Marque blanche (palier Agence).
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
    toast.success("Nom de la marque mis à jour.");
  }

  useEffect(() => {
    fetch("/api/referral")
      .then((r) => (r.ok ? r.json() : null))
      .then(setReferral)
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
        // + récompenses Réussites (« ach:* ») et easter eggs devenus
        // accomplissements : mêmes verrous (requiresEgg) côté fonds/anneaux.
        setFoundEggKeys(new Set([...keys, ...((d.rewardKeys as string[] | undefined) ?? []), ...((d.linkedFound as string[] | undefined) ?? [])]));
        setIsOwner(Boolean(d.isOwner));
      })
      .catch(() => undefined);
    // Aperçu de palier (voir dev-preview.ts) : toujours { plan: null } pour
    // qui n'est pas le compte propriétaire.
    fetch("/api/dev-preview/plan", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlanPreview((d?.plan as Plan | null) ?? null))
      .catch(() => undefined);
  }, []);

  // Palier et marque blanche : lus dans le bootstrap (/api/me).
  useEffect(() => {
    if (!bootstrap.data) return;
    setPlan(bootstrap.data.plan);
    setWlName(bootstrap.data.whiteLabel.brandName ?? "");
    setWlLogoUrl(bootstrap.data.whiteLabel.logoUrl ?? null);
  }, [bootstrap.data]);

  async function onToggleFocusMode() {
    setSavingFocus(true);
    const next = !focusMode;
    const ok = await setFocusMode(next);
    setSavingFocus(false);
    if (!ok) {
      toast.error("Échec de l'enregistrement.");
      return;
    }
    toast.success(next ? "Mode focus activé : interface épurée, sans récompenses ni sons." : "Mode focus désactivé : les Réussites sont de retour.");
  }

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
    bootstrap.patch({
      whiteLabel: {
        brandName: next.brandName !== undefined ? next.brandName : (bootstrap.data?.whiteLabel.brandName ?? null),
        logoUrl: next.logoUrl !== undefined ? next.logoUrl : (bootstrap.data?.whiteLabel.logoUrl ?? null)
      }
    });
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
      toast.error(`Le fond "${bg.label}" doit d'abord être débloqué — voir la page Réussites.`);
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

  const current = SETTINGS_TABS.find((t) => t.value === tab) ?? SETTINGS_TABS[0];
  const whiteLabelOk = PLAN_LIMITS[plan].whiteLabelEnabled;
  const inlineLink = "text-aurora-300 underline-offset-2 hover:underline";

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center sm:p-6" data-testid="settings-dialog">
      {/* Le site derrière : flouté et assombri (clic : fermer). */}
      <div className="nb-settings-backdrop absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="nb-settings-panel relative flex h-full w-full flex-col overflow-hidden outline-none sm:h-[min(740px,calc(100dvh-48px))] sm:max-w-[1000px] sm:flex-row sm:rounded-[24px]"
      >
        {/* ---------- Onglets ---------- */}
        <div className="nb-settings-nav flex shrink-0 flex-col sm:w-[248px]">
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
            <h2 id={titleId} className="font-display text-[20px] font-semibold text-white">
              Paramètres
            </h2>
            <button type="button" onClick={onClose} aria-label="Fermer les paramètres" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-[color:var(--nb-hover)] hover:text-white sm:hidden">
              <IconClose className="h-5 w-5" />
            </button>
          </div>
          <div role="tablist" aria-orientation="vertical" aria-label="Sections des paramètres" className="nb-thin-scroll flex gap-1 overflow-x-auto px-3 pb-3 sm:flex-col sm:overflow-visible sm:pb-0">
            {SETTINGS_TABS.map((t) => {
              const Icon = TAB_ICONS[t.value];
              const active = t.value === tab;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  id={`settings-tab-${t.value}`}
                  aria-selected={active}
                  aria-controls="settings-panel"
                  onClick={() => onTabChange(t.value)}
                  className={clsx(
                    "nb-settings-tab flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition",
                    active ? "nb-settings-tab-active font-semibold text-white" : "text-slate-300 hover:text-white"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="whitespace-nowrap">{t.label}</span>
                </button>
              );
            })}
          </div>
          {/* Raccourcis du compte, en bas de la colonne. */}
          <div className="mt-auto hidden space-y-0.5 px-3 pb-5 pt-4 sm:block">
            <Link href="/billing" onClick={onClose} className="nb-settings-tab flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-slate-400 transition hover:text-white">
              <IconCard className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1">Facturation</span>
              <IconChevronRight className="h-4 w-4" />
            </Link>
            <Link href="/automatisations" onClick={onClose} className="nb-settings-tab flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-slate-400 transition hover:text-white">
              <IconPlug className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1">Automatisations</span>
              <IconChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* ---------- Réglages de l'onglet ---------- */}
        <section id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${current.value}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--nb-sep)] px-5 pb-4 pt-4 sm:px-8 sm:pt-6">
            <div className="min-w-0">
              <h3 className="text-[19px] font-semibold text-white sm:text-[21px]">{current.label}</h3>
              <p className="mt-0.5 text-[13px] text-slate-400">{current.description}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer les paramètres" title="Fermer (Échap)" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-[color:var(--nb-hover)] hover:text-white sm:flex">
              <IconClose className="h-5 w-5" />
            </button>
          </header>

          <div ref={contentRef} className="nb-thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-10 sm:px-8">
            {tab === "marque" && (
              <div className="nb-settings-list">
                <Row
                  title="Nom de la marque"
                  description={
                    <>
                      Le nom affiché pour <strong className="text-slate-200">{activeBrand?.name ?? "cette marque"}</strong> dans l&apos;aperçu de Publier, le sélecteur de marque, etc.
                    </>
                  }
                >
                  <Input
                    aria-label="Nom de la marque"
                    value={pseudo}
                    onChange={(e) => setPseudo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSavePseudo()}
                    disabled={!activeBrand}
                    placeholder="Nom de la marque"
                    wrapperClassName="w-full sm:w-[220px]"
                  />
                  <Button onClick={onSavePseudo} disabled={!activeBrand || savingPseudo || !pseudo.trim() || pseudo.trim() === activeBrand?.name}>
                    {savingPseudo ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </Row>

                <Row
                  title="Fuseau horaire de programmation"
                  description={
                    <>
                      Les heures saisies dans Publier et le calendrier sont celles de ce fuseau, quel que soit l&apos;appareil. Actuellement {timeZoneLabel(activeBrand?.timezone ?? DEFAULT_TIMEZONE)} · il est{" "}
                      {new Date().toLocaleTimeString("fr-FR", { timeZone: activeBrand?.timezone ?? DEFAULT_TIMEZONE, hour: "2-digit", minute: "2-digit" })}.
                    </>
                  }
                >
                  <Select
                    aria-label="Fuseau horaire de la marque"
                    value={activeBrand?.timezone ?? DEFAULT_TIMEZONE}
                    onChange={(e) => onChangeTimezone(e.target.value)}
                    disabled={!activeBrand || savingTimezone}
                    wrapperClassName="w-full sm:w-[240px]"
                  >
                    {tzOptions.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </option>
                    ))}
                  </Select>
                </Row>

                <BrandImpactRow brandId={activeBrand?.id} />

                <Block
                  title="Marque blanche"
                  badge={!whiteLabelOk ? <LockBadge>Palier Agence</LockBadge> : null}
                  description="Remplacez « Nebula » par votre nom et votre logo dans le menu et l'en-tête de votre espace. Les pages publiques envoyées à vos clients gardent la mention « Propulsé par Nebula »."
                >
                  {!whiteLabelOk ? (
                    <p className="text-[13px] text-slate-500">
                      Disponible avec le palier Agence.{" "}
                      <Link href="/billing" onClick={onClose} className={inlineLink}>
                        Voir Facturation
                      </Link>
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--nb-sep-strong)]">
                        {wlLogoUrl ? <RemoteImage src={wlLogoUrl} className="h-full w-full" sizes="44px" /> : <IconUpload className="h-5 w-5 text-slate-500" />}
                      </div>
                      <input ref={wlFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onWlLogoChosen(e.target.files[0])} />
                      <Button variant="outline" onClick={() => wlFileInputRef.current?.click()} disabled={wlUploading}>
                        {wlUploading ? "Envoi..." : "Changer le logo"}
                      </Button>
                      <Input
                        aria-label="Nom affiché en marque blanche"
                        value={wlName}
                        onChange={(e) => setWlName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveWhiteLabel({ brandName: wlName.trim() })}
                        placeholder="Nom affiché (ex : Studio Martin)"
                        wrapperClassName="min-w-[180px] flex-1"
                      />
                      <Button onClick={() => saveWhiteLabel({ brandName: wlName.trim() })} disabled={wlSaving}>
                        {wlSaving ? "Enregistrement..." : "Enregistrer"}
                      </Button>
                    </div>
                  )}
                </Block>
              </div>
            )}

            {tab === "apparence" && (
              <div className="nb-settings-list">
                <Row title="Mode" description="Clair ou sombre, enregistré sur votre compte. Aussi dans le menu de votre profil.">
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-[color:var(--nb-sep-strong)] p-1" role="group" aria-label="Mode clair ou sombre">
                    {(
                      [
                        ["light", "Clair", IconSun],
                        ["dark", "Sombre", IconMoon]
                      ] as const
                    ).map(([value, label, Icon]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        aria-pressed={mode === value}
                        className={clsx("nb-menu-item flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px]", mode === value ? "nb-menu-item-current font-semibold" : "text-slate-400")}
                      >
                        <Icon className="h-4 w-4" /> {label}
                      </button>
                    ))}
                  </div>
                </Row>

                <Block title="Thème de couleurs" description="L'accent de couleur de toute l'application, mémorisé sur cet appareil et sur votre compte.">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {/* Thèmes easter egg (Nova) : visibles une fois trouvés. */}
                    {THEMES.filter((t) => !t.hidden || (t.requiresEgg ? effectiveFoundEggKeys.has(t.requiresEgg) || (t.requiresEgg === "nova-theme" && novaUnlocked) : novaUnlocked)).map((t) => (
                      <ThemeCard key={t.key} theme={t} selected={themeKey === t.key} locked={!canUseTheme(t, effectivePlan)} onPick={() => onPickTheme(t.key)} />
                    ))}
                  </div>
                  <p className="mt-3 text-[12px] text-slate-500">
                    Les thèmes verrouillés se débloquent avec un abonnement —{" "}
                    <Link href="/billing" onClick={onClose} className={inlineLink}>
                      voir Facturation
                    </Link>
                    .
                  </p>
                </Block>

                <Block title="Fond d'écran" description="15 fonds assortis à votre thème, en mode sombre comme en mode clair, dont 4 animés. Flèches ou glisser pour faire défiler.">
                  <BackgroundCarousel selected={backgroundKey} onSelect={onPickBackground} plan={effectivePlan} unlockedEggKeys={effectiveFoundEggKeys} />
                </Block>

                <Row
                  title="Thème étoilé animé"
                  badge={!starfieldAllowed ? <LockBadge>Palier Pro</LockBadge> : null}
                  description="Un vrai ciel étoilé qui défile derrière toute l'interface. Une fois activé : Maj (Shift) + clic dessine une constellation."
                >
                  {starfieldAllowed ? (
                    <Toggle checked={starfieldEnabled} onChange={onToggleStarfield} disabled={savingStarfield || !starfieldLoaded} aria-label="Thème étoilé animé" />
                  ) : (
                    <ButtonLink href="/billing" onClick={onClose} variant="outline">
                      Débloquer
                    </ButtonLink>
                  )}
                </Row>
              </div>
            )}

            {tab === "focus" && (
              <div className="nb-settings-list">
                <Row
                  title={
                    <span className="flex items-center gap-2">
                      <IconFocus className="h-4 w-4 text-aurora-300" /> Mode focus
                    </span>
                  }
                  description="Une interface 100 % épurée, d'un clic : plus de rang, de pastilles, de récompenses à l'écran, de notifications de succès, d'easter eggs ni de sons. Vos réussites restent enregistrées."
                  testId="settings-focus-row"
                >
                  <Toggle checked={focusMode} onChange={onToggleFocusMode} disabled={!focusLoaded || savingFocus} aria-label="Mode focus" />
                </Row>

                <Block
                  title="Cosmétiques"
                  description="Petits effets visuels et sonores facultatifs : certains avec un abonnement, d'autres à gagner en publiant ou en jouant (page Réussites)."
                >
                  <div className="space-y-5">
                    {COSMETIC_CATEGORIES.map(({ key: catKey, label: catLabel }) => {
                      const items = COSMETICS.filter((c) => c.category === catKey);
                      if (items.length === 0) return null;
                      return (
                        <div key={catKey}>
                          <p className="text-[12px] font-semibold text-slate-500">{catLabel}</p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            {items.map((c) => {
                              const locked = !cosmetics.allowedKeys.has(c.key);
                              const on = cosmetics.enabled.has(c.key);
                              return (
                                <div key={c.key} className={clsx("flex items-start justify-between gap-3 rounded-xl border p-3", locked ? "border-dashed border-[color:var(--nb-dashed)]" : "border-[color:var(--nb-sep-strong)]")}>
                                  <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium text-slate-200">
                                      {c.label}
                                      {locked && <LockBadge>{c.requiresEgg ? (isReussiteRewardKey(c.requiresEgg) ? "Réussite" : "Easter egg") : `Palier ${c.requiresPlan}`}</LockBadge>}
                                    </p>
                                    <p className="mt-0.5 text-[12px] text-slate-500">{c.description}</p>
                                  </div>
                                  <Toggle size="sm" checked={on} onChange={(next) => onToggleCosmetic(c.key, next)} disabled={locked || cosmeticsSaving === c.key || !cosmetics.loaded} aria-label={c.label} className="mt-0.5" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Block>

                <Row title="Réussites" description="Votre rang de créateur, les missions de la semaine, vos accomplissements et les easter eggs trouvés.">
                  <ButtonLink href="/reussites" onClick={onClose} variant="outline">
                    Voir mes réussites
                  </ButtonLink>
                </Row>
              </div>
            )}

            {tab === "sons" && (
              <div className="nb-settings-list">
                <Row
                  title="Sons de l'interface"
                  description="Des sons très courts sur quelques actions clés (visite guidée, première publication programmée, mission réussie, coffre ouvert). Toujours après un clic. Coupé ici : plus aucun son, sur tous vos appareils."
                >
                  <Toggle checked={uiSoundsOn} onChange={onToggleUiSounds} disabled={savingUiSounds} aria-label="Sons de l'interface" />
                </Row>
                <Row title="Son des succès" description="Un petit arpège accompagne l'animation « Succès débloqué ». Réglage de cet appareil ; rien ne sonne en Mode focus.">
                  <button type="button" onClick={playArpeggio} className="rounded-full px-3 py-1.5 text-[13px] text-slate-400 transition hover:bg-[color:var(--nb-hover)] hover:text-white">
                    ▶ Écouter
                  </button>
                  <Toggle checked={achievementSound} onChange={onToggleAchievementSound} aria-label="Son des succès" />
                </Row>
                <Row
                  title="Son Décollage"
                  badge={!publishSound.unlocked ? <LockBadge>À débloquer</LockBadge> : null}
                  description="Un son de décollage à chaque publication immédiate réussie. Se débloque avec votre 10ᵉ publication personnelle."
                >
                  <Toggle
                    checked={publishSound.enabled}
                    onChange={onTogglePublishSound}
                    disabled={!publishSound.unlocked || savingPublishSound || !publishSound.loaded}
                    aria-label="Son Décollage"
                  />
                </Row>
                <Row title="Visite guidée" description="Revoir la courte visite de Nebula, avec ses sons.">
                  <Button
                    variant="outline"
                    onClick={() => {
                      onClose();
                      restartGuidedTour();
                    }}
                  >
                    Revoir la visite
                  </Button>
                </Row>
              </div>
            )}

            {tab === "notifications" && (
              <div className="nb-settings-list">
                <Row
                  title="E-mail en cas d'échec"
                  description="Si une publication programmée échoue sur un compte (jeton expiré, refus du réseau…), un e-mail avec l'erreur exacte et le lien pour réessayer. Les publications immédiates affichent leur résultat à l'écran."
                >
                  <Toggle checked={bootstrap.data?.notifyOnFailure ?? true} onChange={onToggleNotify} disabled={!bootstrap.loaded || savingNotify} aria-label="Email en cas d'échec de publication" />
                </Row>
                <Row
                  title="Conseils par e-mail"
                  description="Quelques e-mails espacés pour tirer parti de Nebula. Les informations de service (essai, facturation) arrivent quoi qu'il en soit."
                >
                  <Toggle checked={bootstrap.data?.lifecycleEmails ?? true} onChange={onToggleLifecycle} disabled={!bootstrap.loaded || savingLifecycle} aria-label="Recevoir les conseils par email" />
                </Row>
                {/* Bilan du mois par e-mail (03/10/2026). */}
                <div className="nb-settings-row py-5">
                  <MonthlySummarySettings dialog />
                </div>
              </div>
            )}

            {tab === "parrainage" && (
              <div className="nb-settings-list">
                <Block
                  title="Votre lien d'invitation"
                  description="Toute personne qui s'inscrit avec votre code reçoit l'assistant IA gratuitement pendant 14 jours, même sur le palier Gratuit."
                >
                  {referral ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-xl border border-[color:var(--nb-sep-strong)] px-4 py-2 font-display text-lg tracking-widest text-white">{referral.code}</span>
                        <Button variant="outline" onClick={copyReferral}>
                          {copied ? "Copié !" : "Copier le lien d'invitation"}
                        </Button>
                      </div>
                      <p className="break-all text-[12px] text-slate-500">{referralUrl}</p>
                      {referral.aiTrialActive && referral.aiTrialUntil && (
                        <p className="text-[12px] text-emerald-300">
                          IA offerte via parrainage jusqu&apos;au {new Date(referral.aiTrialUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2" aria-busy="true">
                      <Skeleton className="h-10 w-40" />
                      <Skeleton className="h-3 w-72 max-w-full" />
                    </div>
                  )}
                </Block>
              </div>
            )}

            {tab === "compte" && (
              <div className="pt-5">
                <AccountPrivacyCard bare beforeDanger={<StatsConsentCard bare />} />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}

// « Votre page bio a amené N visiteurs et M inscriptions » (brief growth,
// lot G1.a) : ce que le badge « Propulsé par Nebula » rapporte à la marque.
function BrandImpactRow({ brandId }: { brandId: string | undefined }) {
  const [impact, setImpact] = useState<{ visits: number; signups: number; paid: number } | null>(null);
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    fetch(`/api/growth/brand-impact?brandId=${brandId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setImpact({ visits: d.visits ?? 0, signups: d.signups ?? 0, paid: d.paid ?? 0 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId]);
  if (!impact) return null;
  return (
    <Row
      title="Ce que votre page bio rapporte"
      description={
        <>
          Votre page bio et vos pages partagées ont amené <strong className="text-slate-200">{impact.visits}</strong> visiteur{impact.visits > 1 ? "s" : ""} et{" "}
          <strong className="text-slate-200">{impact.signups}</strong> inscription{impact.signups > 1 ? "s" : ""} sur Nebula
          {impact.paid > 0 ? (
            <>
              , dont <strong className="text-slate-200">{impact.paid}</strong> devenue{impact.paid > 1 ? "s" : ""} payante{impact.paid > 1 ? "s" : ""}
            </>
          ) : null}
          . Chaque compte qui s&apos;abonne après être passé par votre page vous offre un mois de Pro, confirmé 30 jours plus tard (12 mois offerts au maximum sur 12 mois glissants).
        </>
      }
    />
  );
}
