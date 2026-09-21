"use client";

// Éditeur de la page publique "link in bio" de la marque active (façon
// Linktree), accessible sans connexion à /l/[slug] une fois publiée. Toute
// la logique serveur (création à la volée, quota de liens par palier,
// vérification d'appartenance à la marque) vit dans /api/link-in-bio* — voir
// src/lib/link-in-bio.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { IconBioLink, IconPlus, IconClose, IconChevron, IconUpload, IconLock } from "@/components/dashboard/icons";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import { THEMES, canUseTheme } from "@/lib/themes";
import { isUnlimitedBioLinks, type Plan } from "@/lib/plans";

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
  published: boolean;
  links: LinkRow[];
}

function swatchPreview(vars: Record<string, string>) {
  const nebula500 = `rgb(${vars["--c-nebula-500"]})`;
  const aurora400 = `rgb(${vars["--c-aurora-400"]})`;
  const accentCyan = `rgb(${vars["--c-accent-cyan"]})`;
  return `linear-gradient(135deg, ${nebula500}, ${aurora400} 55%, ${accentCyan})`;
}

export default function LinkInBioPage() {
  const { activeBrand } = useBrand();
  const toast = useToast();

  const [page, setPage] = useState<LinkPageData | null>(null);
  const [slug, setSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan>("FREE");
  const [maxBioLinks, setMaxBioLinks] = useState(3);

  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [copied, setCopied] = useState(false);

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
        setMaxBioLinks(d.limits?.maxBioLinks ?? 3);
      })
      .catch(() => undefined);
  }, [activeBrand?.id]);

  async function patchPage(data: Partial<{ title: string; bio: string; avatarUrl: string | null; theme: string; published: boolean }>) {
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

  const activeTheme = THEMES.find((t) => t.key === page?.theme) ?? THEMES[0];

  if (!activeBrand) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Sélectionnez ou créez une marque pour configurer sa page bio.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
          <IconBioLink className="h-5 w-5 text-slate-400" /> Page &laquo; link in bio &raquo;
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Une page publique unique pour <strong className="text-slate-300">{activeBrand.name}</strong>, à mettre en
          bio Instagram/TikTok/YouTube, avec tous vos liens importants au même endroit.
        </p>
      </div>

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
                  <img src={page.avatarUrl} alt="" className="h-full w-full object-cover" />
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

            <label className="mt-4 block text-xs uppercase tracking-wide text-slate-500">Titre affiché</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() !== (page?.title ?? "") && patchPage({ title: title.trim() })}
              placeholder={activeBrand.name}
              maxLength={60}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
            />

            <label className="mt-4 block text-xs uppercase tracking-wide text-slate-500">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              onBlur={() => bio.trim() !== (page?.bio ?? "") && patchPage({ bio: bio.trim() })}
              rows={3}
              maxLength={280}
              placeholder="Une courte description pour vos visiteurs..."
              className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
            />
            <p className="mt-1 text-right text-[11px] text-slate-500">{bio.length}/280</p>
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
                  <button
                    onClick={() => editLink(link.id, { enabled: !link.enabled })}
                    title={link.enabled ? "Désactiver" : "Activer"}
                    className={clsx(
                      "h-2.5 w-2.5 shrink-0 rounded-full transition",
                      link.enabled ? "bg-emerald-400" : "bg-slate-600"
                    )}
                  />
                  <span className="shrink-0 text-[11px] text-slate-500" title="Clics">
                    {link.clicks}
                  </span>
                  <button
                    onClick={() => deleteLink(link.id)}
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

            {atLinkLimit ? (
              <Link
                href="/billing"
                className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
              >
                <UpgradeGem className="h-4 w-4 opacity-70" />
                Limite de {maxBioLinks} liens atteinte pour le palier actuel — passez sur un palier supérieur pour en
                ajouter plus.
              </Link>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Libellé (ex : Ma dernière vidéo)"
                  className="min-w-[160px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-aurora-400/60"
                />
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNewLink()}
                  placeholder="URL (ex : youtube.com/...)"
                  className="min-w-[160px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-aurora-400/60"
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
              {THEMES.map((t) => {
                const locked = !canUseTheme(t, plan);
                return (
                  <button
                    key={t.key}
                    onClick={() => onPickTheme(t.key)}
                    className={clsx(
                      "relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition",
                      page?.theme === t.key
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
                    <span className="h-10 w-full rounded-lg shadow-inner" style={{ background: swatchPreview(t.vars) }} />
                    <span className="text-xs text-slate-300">{t.label}</span>
                  </button>
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
            <div
              className="mx-auto flex w-full max-w-[280px] flex-col items-center gap-3 rounded-[2rem] border border-white/10 p-6 shadow-2xl"
              style={{
                background: `linear-gradient(180deg, rgb(${activeTheme.vars["--c-nebula-900"]}), rgb(${activeTheme.vars["--c-nebula-800"]}) 60%, rgb(${activeTheme.vars["--c-nebula-700"]}))`
              }}
            >
              <div className="mt-4 h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-white/10">
                {page?.avatarUrl && <img src={page.avatarUrl} alt="" className="h-full w-full object-cover" />}
              </div>
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
                        className="w-full truncate rounded-full px-4 py-2.5 text-center text-xs font-medium text-white shadow-inner"
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
            </div>
          </div>
        </div>
      </div>

      {loading && !page && <p className="text-center text-sm text-slate-500">Chargement...</p>}
    </div>
  );
}
