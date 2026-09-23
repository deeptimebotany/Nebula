"use client";

// Configuration du calendrier client public en lecture seule de la marque
// active (produit n°7 de la feuille de route). Toute la logique serveur
// (création à la volée, calcul des publications à venir) vit dans
// /api/calendar-share* et src/lib/calendar-share.ts. Réservé aux paliers
// Pro/Agence (calendarShareEnabled).

import { useCallback, useEffect, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { IconCalendarShare, IconLock } from "@/components/dashboard/icons";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";

const NETWORK_LABELS: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X",
  LINKEDIN: "LinkedIn"
};

interface ShareSettings {
  token: string;
  enabled: boolean;
  windowDays: number;
}

interface UpcomingPost {
  id: string;
  title: string;
  scheduledAt: string;
  thumbnailUrl: string | null;
  networks: string[];
}

export default function CalendarSharePage() {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const upgrade = useUpgradeModal();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [share, setShare] = useState<ShareSettings | null>(null);
  const [posts, setPosts] = useState<UpcomingPost[]>([]);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!activeBrand) return;
    setLoading(true);
    const res = await fetch(`/api/calendar-share?brandId=${activeBrand.id}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors du chargement du calendrier.");
      return;
    }
    setAllowed(data.allowed);
    if (data.allowed) {
      setShare(data.share);
      setPosts(data.posts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(data: Partial<{ enabled: boolean; windowDays: number }>) {
    if (!activeBrand) return;
    const res = await fetch("/api/calendar-share", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, ...data })
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setShare(json.share);
    if (data.windowDays !== undefined) load();
  }

  async function togglePublished() {
    if (!share) return;
    await patch({ enabled: !share.enabled });
    toast.success(!share.enabled ? "Calendrier publié." : "Calendrier dépublié.");
  }

  const publicUrl = share && typeof window !== "undefined" ? `${window.location.origin}/calendrier/${share.token}` : "";

  async function copyPublicUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success("Lien copié.");
    setTimeout(() => setCopied(false), 2000);
  }

  if (!activeBrand) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Sélectionnez ou créez une marque pour configurer son calendrier.</p>
      </div>
    );
  }

  if (loading || allowed === null) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-7 w-64" />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
        <span className="sr-only">Chargement en cours</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconCalendarShare className="h-5 w-5" />}
        title="Calendrier client"
        description="Une page publique, en lecture seule, montrant à votre client les prochaines publications déjà programmées pour cette marque — sans aucun droit d'édition de son côté."
      />

      {!allowed && (
        <GlassCard>
          <div className="flex items-center gap-2">
            <Badge tone="warning" icon={<IconLock className="h-3 w-3" />}>
              Pro
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-400">Un lien en lecture seule : votre client voit ce qui part, et quand, sans compte à créer — avec le palier Pro.</p>
          <button
            type="button"
            onClick={() => upgrade.open("calendar_share")}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-left text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
          >
            <UpgradeGem className="h-4 w-4 opacity-70" /> Débloquer le calendrier client
          </button>
        </GlassCard>
      )}

      {allowed && share && (
        <>
          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-medium text-white">Lien public</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {share.enabled ? "Visible par toute personne ayant ce lien." : "Dépublié — le lien renvoie une erreur tant qu'il n'est pas activé."}
                </p>
              </div>
              <Button variant={share.enabled ? "outline" : "glow"} onClick={togglePublished}>
                {share.enabled ? "Dépublier" : "Publier"}
              </Button>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
              <p className="flex-1 truncate font-mono text-sm text-white">{publicUrl || "..."}</p>
              <Button variant="outline" onClick={copyPublicUrl} disabled={!publicUrl}>
                {copied ? "Copié !" : "Copier"}
              </Button>
              {share.enabled && publicUrl && (
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <Button variant="ghost">Ouvrir</Button>
                </a>
              )}
            </div>
            <Select
              label="Fenêtre affichée"
              id="share-window"
              value={share.windowDays}
              onChange={(e) => patch({ windowDays: Number(e.target.value) })}
              wrapperClassName="mt-4 max-w-xs"
            >
              <option value={14}>14 prochains jours</option>
              <option value={30}>30 prochains jours</option>
              <option value={60}>60 prochains jours</option>
            </Select>
          </GlassCard>

          <GlassCard>
            <h2 className="font-display text-base font-medium text-white">Aperçu</h2>
            {posts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Aucune publication programmée sur cette fenêtre pour l&apos;instant.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {posts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
                    {p.thumbnailUrl ? (
                      <RemoteImage src={p.thumbnailUrl} className="h-10 w-10 shrink-0 rounded-lg" sizes="40px" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-white/5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-300">{p.title}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(p.scheduledAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        {p.networks.map((n) => NETWORK_LABELS[n] ?? n).join(", ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
