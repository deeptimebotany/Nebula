"use client";

// Éditeur de la page publique "link in bio" de la marque active (façon
// Linktree), accessible sans connexion à /l/[slug] une fois publiée. Toute
// la logique serveur (création à la volée, quota de liens par palier,
// vérification d'appartenance à la marque) vit dans /api/link-in-bio* — voir
// src/lib/link-in-bio.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { SkeletonCard } from "@/components/ui/skeleton";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { Input, Textarea } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { IconBioLink, IconPlus, IconClose, IconChevron, IconUpload } from "@/components/dashboard/icons";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import { LinktreeImportDialog } from "@/components/link-in-bio/linktree-import-dialog";
import { THEMES, canUseTheme } from "@/lib/themes";
import { ThemeCard } from "@/components/settings/theme-card";
import { isUnlimitedBioLinks, type Plan } from "@/lib/plans";
import { BIO_FRAMES, FRAME_NONE, frameFitsTheme, resolveBioFrame, themeFlavor, type ResolvedFrame } from "@/lib/bio-frames";
import { BioFrame, BioAvatarFrame } from "@/components/link-in-bio/bio-frame";
import { ParticleCanvas, particleVariantForTheme } from "@/components/theme-particles";
import { IconLock, IconLink } from "@/components/dashboard/icons";
import { CampaignLinkBuilder } from "@/components/composer/campaign-link-builder";

interface LinkRow {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  order: number;
  clicks: number;
}

interface LinkPageData {
  id: string;
  title: string;
  bio: string;
  avatarUrl: string | null;
  theme: string;
  frame: string | null;
  published: boolean;
  links: LinkRow[];
}

export default function LinkInBioPage() {
  const { activeBrand, refresh: refreshBrands } = useBrand();
  const toast = useToast();
  const upgrade = useUpgradeModal();
  // Import Linktree (brief growth, lot G6.b)
  const [linktreeOpen, setLinktreeOpen] = useState(false);
  const confirmDialog = useConfirm();

  const [page, setPage] = useState<LinkPageData | null>(null);
  const [slug, setSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan>("FREE");
  const [planLoaded, setPlanLoaded] = useState(false);
  const [maxBioLinks, setMaxBioLinks] = useState(3);

  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  // Générateur de lien de campagne (UTM) pour l'URL du nouveau lien.
  const [campaignLinkOpen, setCampaignLinkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Cadres débloqués par ce compte (voir src/lib/bio-frames.ts).
  const [unlockedFrames, setUnlockedFrames] = useState<string[]>([]);
  // Thèmes easter egg déjà trouvés (Nova…).
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!activeBrand) return;
    setLoading(true);
    const res = await fetch(`/api/link-in-bio?brandId=${activeBrand.id}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors du chargement de la page.");
      return;
    }
    setPage(data.linkPage);
    setSlug(data.slug ?? activeBrand.slug);
    setUnlockedFrames(data.unlockedFrames ?? []);
    setUnlockedThemes(data.unlockedThemes ?? []);
    setTitle(data.linkPage.title ?? "");
    setBio(data.linkPage.bio ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeBrand) return;
    fetch(`/api/billing/plan?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => {
        setPlan(d.plan ?? "FREE");
        setPlanLoaded(true);
        setMaxBioLinks(d.limits?.maxBioLinks ?? 3);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  async function patchPage(data: Partial<{ title: string; bio: string; avatarUrl: string | null; theme: string; frame: string | null; published: boolean }>) {
    if (!activeBrand) return;
    const res = await fetch("/api/link-in-bio", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, ...data })
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setPage(json.linkPage);
    // Titre ou photo modifiés → le sélecteur de marque (nom + pastille)
    // se met à jour immédiatement (voir PATCH /api/link-in-bio).
    if (json.brand) await refreshBrands();
  }

  async function onAvatarChosen(file: File) {
    setAvatarUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/media/thumbnails/upload", { method: "POST", body: form });
    const data = await res.json();
    setAvatarUploading(false);
    if (!res.ok) {
      toast.error(data.error ?? "Échec de l'envoi de la photo.");
      return;
    }
    await patchPage({ avatarUrl: data.url });
  }

  function onPickTheme(key: string) {
    const theme = THEMES.find((t) => t.key === key);
    if (theme && !canUseTheme(theme, plan)) {
      toast.error(`Le thème "${theme.label}" nécessite le palier ${theme.requiresPlan}. Débloquez-le dans Facturation.`);
      return;
    }
    patchPage({ theme: key });
  }

  function onPickFrame(key: string | null) {
    patchPage({ frame: key });
  }

  async function togglePublished() {
    if (!page) return;
    await patchPage({ published: !page.published });
    toast.success(!page.published ? "Page publiée." : "Page dépubliée.");
  }

  const publicUrl = slug && typeof window !== "undefined" ? `${window.location.origin}/l/${slug}` : "";

  async function copyPublicUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success("Lien copié.");
    setTimeout(() => setCopied(false), 2000);
  }

  const atLinkLimit = Boolean(page) && page!.links.length >= maxBioLinks;

  async function submitNewLink() {
    if (!activeBrand || !newLabel.trim() || !newUrl.trim()) return;
    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setAddingLink(true);
    const res = await fetch("/api/link-in-bio/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, label: newLabel.trim(), url })
    });
    const data = await res.json();
    setAddingLink(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors de l'ajout du lien.");
      return;
    }
    setNewLabel("");
    setNewUrl("");
    setPage((p) => (p ? { ...p, links: [...p.links, data.link] } : p));
  }

  async function editLink(id: string, data: Partial<{ label: string; url: string; enabled: boolean }>) {
    const res = await fetch(`/api/link-in-bio/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Erreur lors de la modification.");
      return;
    }
    setPage((p) => (p ? { ...p, links: p.links.map((l) => (l.id === id ? json.link : l)) } : p));
  }

  async function deleteLink(id: string) {
    const target = page?.links.find((l) => l.id === id);
    const ok = await confirmDialog({
      title: "Supprimer ce lien ?",
      message: `« ${target?.label ?? "Ce lien"} » disparaîtra de votre page bio, avec son compteur de clics. Cette action est définitive.`,
      confirmLabel: "Supprimer",
      danger: true
    });
    if (!ok) return;
    const res = await fetch(`/api/link-in-bio/links/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Erreur lors de la suppression.");
      return;
    }
    setPage((p) => (p ? { ...p, links: p.links.filter((l) => l.id !== id) } : p));
  }

  async function moveLink(id: string, direction: -1 | 1) {
    if (!page || !activeBrand) return;
    const index = page.links.findIndex((l) => l.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= page.links.length) return;
    const reordered = [...page.links];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPage({ ...page, links: reordered });
    await fetch("/api/link-in-bio/links/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, orderedIds: reordered.map((l) => l.id) })
    });
  }

  // Thème réellement affiché sur la page publique : un thème de palier que
  // le palier actuel ne couvre plus retombe sur le thème par défaut (voir
  // link-in-bio-public.ts) — l'aperçu montre la même chose.
  const savedTheme = THEMES.find((t) => t.key === page?.theme);
  const activeTheme = savedTheme && (!planLoaded || canUseTheme(savedTheme, plan)) ? savedTheme : THEMES[0];
  const activeFrame = resolveBioFrame(activeTheme.key, page?.frame);
  const pageFlavor = themeFlavor(activeTheme.key);
  const miniBackground = `linear-gradient(180deg, rgb(${activeTheme.vars["--c-nebula-900"]}), rgb(${activeTheme.vars["--c-nebula-700"]}))`;

  if (!activeBrand) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Sélectionnez ou créez une marque pour configurer sa page bio.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconBioLink className="h-5 w-5" />}
        title="Page bio"
        description={
          <>
            Une page publique unique pour <strong className="text-slate-300">{activeBrand.name}</strong>, à mettre en bio
            Instagram/TikTok/YouTube, avec tous vos liens importants au même endroit.
          </>
        }
      />

      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-500">Lien public</p>
            <p className="truncate font-mono text-sm text-white">{publicUrl || "..."}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={copyPublicUrl} disabled={!publicUrl}>
              {copied ? "Copié !" : "Copier"}
            </Button>
            {page?.published && publicUrl && (
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <Button variant="ghost">Voir la page →</Button>
              </a>
            )}
            <button
              type="button"
              onClick={togglePublished}
              disabled={!page}
              className={clsx(
                "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition",
                page?.published
                  ? "border-emerald-400/40 bg-emerald-400/[0.08] text-emerald-300 hover:bg-emerald-400/[0.14]"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-aurora-400/40 hover:text-white"
              )}
            >
              <span className={clsx("h-2 w-2 rounded-full", page?.published ? "bg-emerald-400" : "bg-slate-500")} />
              {page?.published ? "Publiée" : "Non publiée"}
            </button>
          </div>
        </div>
        {!page?.published && (
          <p className="mt-2 text-xs text-slate-500">
            Cette page n&apos;est visible par personne tant qu&apos;elle n&apos;est pas publiée — préparez-la
            tranquillement puis activez &laquo; Publiée &raquo; quand elle est prête.
          </p>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <GlassCard>
            <h2 className="font-display text-base font-medium text-white">Profil</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.03]">
                {page?.avatarUrl ? (
                  <RemoteImage src={page.avatarUrl} className="h-full w-full" sizes="64px" />
                ) : (
                  <IconUpload className="h-5 w-5 text-slate-500" />
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onAvatarChosen(e.target.files[0])}
              />
              <Button variant="outline" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}>
                {avatarUploading ? "Envoi..." : "Changer la photo"}
              </Button>
            </div>

            <Input
              label="Nom de la marque (titre de la page)"
              id="bio-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() !== (page?.title ?? "") && patchPage({ title: title.trim() })}
              placeholder={activeBrand.name}
              maxLength={60}
              wrapperClassName="mt-4"
              hint="Enregistré automatiquement quand vous quittez le champ — c'est aussi le nom de la marque dans toute l'application."
            />

            <Textarea
              label="Bio"
              id="bio-text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              onBlur={() => bio.trim() !== (page?.bio ?? "") && patchPage({ bio: bio.trim() })}
              rows={3}
              maxLength={280}
              placeholder="Une courte description pour vos visiteurs…"
              wrapperClassName="mt-4"
              hint={`${bio.length}/280`}
            />
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-medium text-white">Vos liens</h2>
              <span className="text-xs text-slate-500">
                {isUnlimitedBioLinks(plan) ? `${page?.links.length ?? 0} lien(s)` : `${page?.links.length ?? 0}/${maxBioLinks} liens`}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {page?.links.map((link, i) => (
                <div key={link.id} className="glass-panel flex items-center gap-2 rounded-xl p-2.5">
                  <div className="flex shrink-0 flex-col">
                    <button
                      onClick={() => moveLink(link.id, -1)}
                      disabled={i === 0}
                      className="flex h-5 w-5 items-center justify-center text-slate-500 hover:text-white disabled:opacity-25"
                    >
                      <IconChevron className="h-3 w-3 rotate-180" />
                    </button>
                    <button
                      onClick={() => moveLink(link.id, 1)}
                      disabled={i === (page.links.length ?? 0) - 1}
                      className="flex h-5 w-5 items-center justify-center text-slate-500 hover:text-white disabled:opacity-25"
                    >
                      <IconChevron className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <input
                      defaultValue={link.label}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== link.label && editLink(link.id, { label: e.target.value.trim() })}
                      placeholder="Libellé"
                      className="min-w-0 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-sm text-white outline-none focus:border-aurora-400/60"
                    />
                    <input
                      defaultValue={link.url}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== link.url && editLink(link.id, { url: e.target.value.trim() })}
                      placeholder="https://..."
                      className="min-w-0 truncate rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-aurora-400/60"
                    />
                  </div>
                  {/* Lien au-delà de la limite du palier (fin d'essai) : conservé,
                      grisé « Pro », réactivable seulement en passant en Pro. */}
                  {i >= maxBioLinks && !link.enabled ? (
                    <button
                      type="button"
                      onClick={() => upgrade.open("links_limit")}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-aurora-400/40 hover:text-white"
                      title="Ce lien dépasse la limite de votre palier — passez en Pro pour le réactiver"
                    >
                      <UpgradeGem className="h-3 w-3" /> Pro
                    </button>
                  ) : (
                    <Toggle size="sm" checked={link.enabled} onChange={(next) => editLink(link.id, { enabled: next })} aria-label={link.enabled ? `Désactiver « ${link.label} »` : `Activer « ${link.label} »`} />
                  )}
                  <span className="shrink-0 text-[11px] text-slate-500" title="Clics">
                    {link.clicks}
                  </span>
                  <button
                    onClick={() => deleteLink(link.id)}
                    aria-label={`Supprimer « ${link.label} »`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {page && page.links.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">Aucun lien pour l&apos;instant.</p>
              )}
            </div>

            {activeBrand && (
              <LinktreeImportDialog
                open={linktreeOpen}
                onClose={() => setLinktreeOpen(false)}
                brandId={activeBrand.id}
                maxBioLinks={maxBioLinks}
                currentCount={page?.links.length ?? 0}
                onImported={() => void load()}
              />
            )}
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setLinktreeOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white hover:underline">
                <IconUpload className="h-3.5 w-3.5" /> Importer depuis Linktree
              </button>
            </div>

            {atLinkLimit ? (
              <button
                type="button"
                onClick={() => upgrade.open("links_limit")}
                className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-left text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
              >
                <UpgradeGem className="h-4 w-4 opacity-70" />
                Limite de {maxBioLinks} liens atteinte pour le palier actuel — passez en Pro pour en ajouter plus.
              </button>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Libellé du nouveau lien"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Libellé (ex : Ma dernière vidéo)"
                  wrapperClassName="min-w-[160px] flex-1"
                />
                <Input
                  aria-label="Adresse du nouveau lien"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNewLink()}
                  placeholder="URL (ex : youtube.com/...)"
                  inputMode="url"
                  wrapperClassName="min-w-[160px] flex-1"
                />
                <Button variant="ghost" onClick={() => setCampaignLinkOpen(true)} title="Ajouter un suivi de campagne (UTM) à ce lien">
                  <IconLink className="h-4 w-4" /> Suivi
                </Button>
                <CampaignLinkBuilder
                  open={campaignLinkOpen}
                  onClose={() => setCampaignLinkOpen(false)}
                  brandId={activeBrand?.id}
                  defaultSource="linkinbio"
                  defaultMedium="bio"
                  initialUrl={newUrl}
                  actions={[{ label: "Utiliser ce lien", primary: true, onApply: (url) => setNewUrl(url) }]}
                />
                <Button onClick={submitNewLink} disabled={addingLink || !newLabel.trim() || !newUrl.trim()}>
                  <IconPlus className="h-4 w-4" /> {addingLink ? "Ajout..." : "Ajouter"}
                </Button>
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="font-display text-base font-medium text-white">Thème de la page</h2>
            <p className="mt-1 text-sm text-slate-400">Indépendant du thème de votre tableau de bord.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {THEMES.filter((t) => !t.hidden || page?.theme === t.key || unlockedThemes.includes(t.key)).map((t) => (
                <ThemeCard key={t.key} theme={t} selected={page?.theme === t.key} locked={!canUseTheme(t, plan)} onPick={() => onPickTheme(t.key)} />
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="font-display text-base font-medium text-white">Cadre de la carte</h2>
            <p className="mt-1 text-sm text-slate-400">
              Une animation autour de votre carte et de votre photo. Les thèmes Or Impérial et Éclipse totale ont un halo par défaut ; d&apos;autres cadres se débloquent en chemin…
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              <FrameOption
                label="Automatique"
                sub={pageFlavor ? "Halo du thème" : "Aucun sur ce thème"}
                preview={resolveBioFrame(activeTheme.key, null)}
                background={miniBackground}
                selected={!page?.frame}
                onPick={() => onPickFrame(null)}
              />
              <FrameOption label="Aucun" preview={null} background={miniBackground} selected={page?.frame === FRAME_NONE} onPick={() => onPickFrame(FRAME_NONE)} />
              {BIO_FRAMES.filter((f) => !f.secret || unlockedFrames.includes(f.key)).map((f) => {
                const unlocked = unlockedFrames.includes(f.key);
                const fits = frameFitsTheme(f, activeTheme.key);
                const preview: ResolvedFrame = { style: f.style, flavor: f.flavor ?? pageFlavor ?? "eclipse" };
                return (
                  <FrameOption
                    key={f.key}
                    label={f.label}
                    sub={!unlocked ? "Easter egg" : !fits ? (f.flavor === "or" ? "Thème Or Impérial requis" : "Thème Éclipse totale requis") : undefined}
                    preview={preview}
                    background={miniBackground}
                    selected={page?.frame === f.key}
                    locked={!unlocked}
                    disabled={!unlocked || !fits}
                    onPick={() => onPickFrame(f.key)}
                  />
                );
              })}
            </div>
          </GlassCard>
        </div>

        {/* Aperçu façon téléphone, dans le thème choisi — mêmes couleurs que
            la vraie page publique (/l/[slug]), pour un retour immédiat. */}
        <div>
          <div className="sticky top-20">
            <p className="mb-2 text-center text-xs uppercase tracking-wide text-slate-500">Aperçu</p>
            <BioFrame
              frame={activeFrame}
              radius={32}
              className="mx-auto w-full max-w-[280px]"
              cardClassName="isolate flex w-full flex-col items-center gap-3 border border-white/10 p-6 shadow-2xl"
              cardStyle={{
                background: `linear-gradient(180deg, rgb(${activeTheme.vars["--c-nebula-900"]}), rgb(${activeTheme.vars["--c-nebula-800"]}) 60%, rgb(${activeTheme.vars["--c-nebula-700"]}))`
              }}
            >
              {particleVariantForTheme(activeTheme.key) && (
                <ParticleCanvas
                  variant={particleVariantForTheme(activeTheme.key)!}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ zIndex: -1, borderRadius: "inherit" }}
                />
              )}
              <BioAvatarFrame frame={activeFrame} className="mt-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-white/10">
                  {page?.avatarUrl && <RemoteImage src={page.avatarUrl} className="h-full w-full" sizes="96px" />}
                </div>
              </BioAvatarFrame>
              <p className="text-center text-sm font-semibold text-white">{title.trim() || activeBrand.name}</p>
              {bio.trim() && <p className="text-center text-xs text-white/70">{bio}</p>}
              <div className="mt-2 w-full space-y-2">
                {(page?.links ?? []).filter((l) => l.enabled).length === 0 ? (
                  <p className="py-4 text-center text-xs text-white/40">Vos liens apparaîtront ici.</p>
                ) : (
                  page!.links
                    .filter((l) => l.enabled)
                    .map((l) => (
                      <div
                        key={l.id}
                        className="bf-link w-full truncate rounded-full px-4 py-2.5 text-center text-xs font-medium text-white shadow-inner"
                        style={{
                          background: `rgba(255,255,255,0.08)`,
                          border: `1px solid rgb(${activeTheme.vars["--c-aurora-400"]} / 0.5)`
                        }}
                      >
                        {l.label}
                      </div>
                    ))
                )}
              </div>
            </BioFrame>
          </div>
        </div>
      </div>

      {loading && !page && (
        <div className="space-y-3" aria-busy="true">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
          <span className="sr-only">Chargement de la page bio</span>
        </div>
      )}
    </div>
  );
}

// Vignette de choix d'un cadre : mini-carte animée avec sa pastille.
function FrameOption({
  label,
  sub,
  preview,
  background,
  selected,
  locked,
  disabled,
  onPick
}: {
  label: string;
  sub?: string;
  preview: ResolvedFrame | null;
  background: string;
  selected: boolean;
  locked?: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      className={clsx(
        "relative flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition",
        selected ? "border-aurora-400 bg-white/[0.04]" : "border-white/10 hover:border-white/25",
        disabled && "cursor-not-allowed opacity-60 hover:border-white/10"
      )}
    >
      {locked && (
        <span className="absolute right-1.5 top-1.5 z-[3] flex h-5 w-5 items-center justify-center rounded-full bg-void-950/90 text-slate-300">
          <IconLock className="h-3 w-3" />
        </span>
      )}
      <div className="px-2 pt-2">
        <BioFrame frame={preview} radius={14} cardClassName="flex h-16 w-full items-start justify-center border border-white/10 pt-3" cardStyle={{ background }}>
          <BioAvatarFrame frame={preview}>
            <span className="block h-6 w-6 rounded-full border border-white/20 bg-white/10" />
          </BioAvatarFrame>
        </BioFrame>
      </div>
      <span className="mt-1 text-xs font-medium text-white">{label}</span>
      {sub && <span className="-mt-1.5 text-[11px] text-slate-500">{sub}</span>}
    </button>
  );
}
