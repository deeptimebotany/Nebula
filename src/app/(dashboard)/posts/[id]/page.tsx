"use client";

import { useEffect, useState, useCallback } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { ReferralPrompt } from "@/components/dashboard/referral-prompt";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/ui/network-badge";
import { useAiStatus } from "@/components/use-ai-status";
import { useBrand } from "@/components/brand-context";
import { DEFAULT_TIMEZONE, timeZoneLabel } from "@/lib/timezone";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { useMilestoneCelebration } from "@/components/milestone-celebration";
import { RetentionCurveChart } from "@/components/charts/lazy";
import { IconSend, IconSparkle, IconUsers } from "@/components/dashboard/icons";
import { NETWORK_META, type Network } from "@/lib/types";
import { errorAdvice } from "@/lib/social/error-advice";
import { PostStats } from "@/components/posts/post-stats";
import { clsx } from "@/lib/clsx";

interface MediaAsset {
  id: string;
  url: string;
  type: "VIDEO" | "IMAGE";
  thumbnailUrl?: string | null;
}

interface Insight {
  id: string;
  summary: string;
  dropOffPoints: string;
  recommendations: string;
  retentionCurve: string;
}

interface Target {
  id: string;
  network: Network;
  status: string;
  titleOverride?: string | null;
  captionOverride?: string | null;
  externalUrl?: string | null;
  errorMessage?: string | null;
  /** Catégorie de la dernière erreur (lot 5, voir lib/social/errors.ts). */
  errorCategory?: string | null;
  nextCheckAt?: string | null;
  /** Miniature envoyée avec la vidéo (YouTube, Réussites lot B). */
  thumbnailStatus?: string | null;
  connection: { displayName: string };
  insights: Insight[];
}

// Sort de la miniature choisie dans Publier (PostTarget.thumbnailStatus).
const THUMBNAIL_NOTE: Record<string, { text: string; tone: string }> = {
  APPLIED: { text: "Miniature choisie appliquée sur YouTube.", tone: "text-emerald-300" },
  REFUSED: {
    text: "YouTube a refusé la miniature : les miniatures personnalisées demandent une chaîne vérifiée par téléphone (youtube.com/verify). La vidéo est bien en ligne.",
    tone: "text-amber-300"
  },
  UNSUPPORTED: { text: "Miniature non envoyée : YouTube accepte une image JPEG ou PNG de 2 Mo au plus.", tone: "text-amber-300" },
  FAILED: { text: "La miniature n'a pas pu être envoyée à YouTube. Vous pouvez l'ajouter dans YouTube Studio.", tone: "text-amber-300" }
};

interface Post {
  id: string;
  brandId: string;
  title: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  media: { mediaAsset: MediaAsset }[];
  targets: Target[];
  /** Import CSV (lot G6.a) : média distant en attente de rapatriement. */
  sourceMediaUrl?: string | null;
  sourceMediaAttempts?: number;
  importedAt?: string | null;
}

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Programmé",
  PUBLISHING: "Publication en cours",
  PUBLISHED: "Publié",
  FAILED: "Échec",
  PARTIAL: "Partiellement publié",
  PENDING: "En attente",
  // Lot 2 : le réseau prépare encore la vidéo ; Nebula termine la
  // publication automatiquement dès qu'elle est prête.
  PROCESSING: "En traitement par le réseau",
  // Lot 5 : panne passagère, limite de débit ou réseau suspendu — Nebula
  // réessaie tout seul (voir lib/publish.ts).
  RETRY_WAIT: "Nouvel essai prévu"
};

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { activeBrand, brands } = useBrand();
  const aiStatus = useAiStatus(activeBrand?.id);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { celebrateMilestone } = useMilestoneCelebration();

  const [post, setPost] = useState<Post | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  // Erreur d'analyse de rétention affichée directement sous le bouton
  // concerné (par cible/réseau) plutôt qu'en toast éphémère en bas à droite
  // — trop discret/vite disparu pour un message parfois long (ex. "aucune
  // donnée disponible pour cette vidéo").
  const [analyzeError, setAnalyzeError] = useState<Record<string, string>>({});
  const [copiedTargetId, setCopiedTargetId] = useState<string | null>(null);
  const [sharedTargetIds, setSharedTargetIds] = useState<string[]>([]);
  const [sharing, setSharing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/posts/${params.id}`);
    const data = await res.json();
    if (res.ok) setPost(data.post);
    const msgRes = await fetch(`/api/posts/${params.id}/messages`);
    const msgData = await msgRes.json();
    if (msgRes.ok) setMessages(msgData.messages ?? []);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Publication en cours (ou vidéo en traitement chez un réseau) : la fiche
  // se met à jour toute seule, toutes les 10 s, jusqu'au résultat.
  const inProgress = post?.status === "PUBLISHING";
  // Seulement des relances programmées (plusieurs minutes d'attente) : une
  // vérification par minute suffit (lot 5).
  const waitingOnly = Boolean(post?.targets.every((t) => t.status !== "PUBLISHING" && t.status !== "PROCESSING"));
  useEffect(() => {
    if (!inProgress) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, waitingOnly ? 60_000 : 10_000);
    return () => window.clearInterval(id);
  }, [inProgress, waitingOnly, load]);

  async function duplicate() {
    setBusy("duplicate");
    const res = await fetch(`/api/posts/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate" })
    });
    const data = await res.json();
    setBusy(null);
    if (res.ok) router.push(`/composer?duplicate=${data.postId}`);
    else toast.error(data.error ?? "Erreur lors de la duplication.");
  }

  async function publishNow() {
    setBusy("publish");
    const res = await fetch(`/api/posts/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish-now" })
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) toast.error(data.error ?? "Erreur lors de la publication.");
    else if (typeof data.milestone === "number") celebrateMilestone(data.milestone);
    load();
  }

  // Relances automatiques (lot 5).
  async function retryAction(action: "retry-now" | "stop-retries") {
    setBusy(action);
    const res = await fetch(`/api/posts/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    }).catch(() => null);
    setBusy(null);
    if (!res || !res.ok) toast.error("Action impossible pour le moment. Réessayez dans un instant.");
    else if (action === "stop-retries") toast.info("Nouveaux essais arrêtés.");
    load();
  }

  async function remove() {
    const ok = await confirmDialog({
      title: "Supprimer cette publication ?",
      message: "Cette action est définitive : le post, son historique et sa discussion seront supprimés.",
      confirmLabel: "Supprimer",
      danger: true
    });
    if (!ok) return;
    await fetch(`/api/posts/${params.id}`, { method: "DELETE" });
    toast.success("Publication supprimée.");
    router.push("/calendar");
  }

  async function analyzeRetention(targetId: string) {
    setAnalyzing(targetId);
    setAnalyzeError((prev) => ({ ...prev, [targetId]: "" }));
    const res = await fetch("/api/ai/analyze-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postTargetId: targetId })
    });
    const data = await res.json();
    setAnalyzing(null);
    if (!res.ok) {
      setAnalyzeError((prev) => ({ ...prev, [targetId]: data.error ?? "Erreur d'analyse." }));
      return;
    }
    load();
  }

  async function copyLink(targetId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedTargetId(targetId);
      window.setTimeout(() => setCopiedTargetId((v) => (v === targetId ? null : v)), 2000);
    } catch {
      toast.error("Impossible de copier le lien (autorisation navigateur refusée).");
    }
  }

  // Partage volontaire d'une publication déjà en ligne vers la Communauté :
  // seuls le lien externe et une miniature sont recopiés, jamais le fichier.
  async function shareToCommunity(targetId: string) {
    setSharing(targetId);
    const res = await fetch("/api/community/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postTargetId: targetId })
    });
    const data = await res.json();
    setSharing(null);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors du partage.");
      return;
    }
    setSharedTargetIds((prev) => [...prev, targetId]);
    toast.success("Partagé dans l'onglet « Vidéos du jour » de la Communauté.");
  }

  async function sendMessage() {
    if (!input.trim() || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { id: "tmp", role: "USER", content: text, createdAt: new Date().toISOString() }]);
    const res = await fetch(`/api/posts/${params.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text })
    });
    setSending(false);
    if (res.ok) load();
  }

  if (!post) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard lines={6} className="lg:col-span-2" />
          <SkeletonCard lines={4} />
        </div>
        <span className="sr-only">Chargement de la publication</span>
      </div>
    );
  }

  const brandTimezone = brands.find((b) => b.id === post.brandId)?.timezone ?? activeBrand?.timezone ?? DEFAULT_TIMEZONE;
  const thumbAsset = post.media.find((m) => m.mediaAsset.type === "VIDEO") ?? post.media[0];
  // Publiée sur au moins deux réseaux → invitation de parrainage (lot G7),
  // une seule fois par compte (le composant vérifie referralPromptsSeen).
  const publishedNetworks = new Set(post.targets.filter((t) => t.status === "PUBLISHED").map((t) => t.network));
  const multiNetworkPublished = post.status === "PUBLISHED" && publishedNetworks.size >= 2;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/calendar" className="text-xs text-slate-500 hover:text-slate-300">← Retour au calendrier</Link>
            <h1 className="mt-1 font-display text-2xl font-semibold text-white">{post.title || "(sans titre)"}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {STATUS_LABEL[post.status] ?? post.status}
              {post.scheduledAt &&
                ` · programmé pour le ${new Date(post.scheduledAt).toLocaleString("fr-FR", { timeZone: brandTimezone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} (${timeZoneLabel(brandTimezone)})`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(post.status === "DRAFT" || post.status === "FAILED" || post.status === "PARTIAL") && (
              <Button onClick={publishNow} disabled={busy === "publish"}>
                {busy === "publish" ? "Envoi..." : "Publier maintenant"}
              </Button>
            )}
            {post.targets.some((t) => t.status === "RETRY_WAIT" && t.errorCategory !== "PAUSED") && (
              <Button onClick={() => retryAction("retry-now")} disabled={busy !== null}>
                {post.targets.every((t) => t.status !== "RETRY_WAIT" || t.errorCategory === "VERIFY")
                  ? busy === "retry-now"
                    ? "Vérification..."
                    : "Vérifier maintenant"
                  : busy === "retry-now"
                    ? "Nouvel essai..."
                    : "Réessayer maintenant"}
              </Button>
            )}
            {post.targets.some((t) => t.status === "RETRY_WAIT") && (
              <Button variant="outline" onClick={() => retryAction("stop-retries")} disabled={busy !== null}>
                Arrêter les nouveaux essais
              </Button>
            )}
            <Button variant="outline" onClick={duplicate} disabled={busy === "duplicate"}>
              {busy === "duplicate" ? "Duplication..." : "Dupliquer"}
            </Button>
            <Button variant="danger" onClick={remove}>Supprimer</Button>
          </div>
        </div>

        {multiNetworkPublished && <ReferralPrompt trigger="first_multi_network" />}

        <GlassCard>
          <div className="flex gap-4">
            {thumbAsset && (
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                {thumbAsset.mediaAsset.type === "VIDEO" ? (
                  <video src={thumbAsset.mediaAsset.url} poster={thumbAsset.mediaAsset.thumbnailUrl ?? undefined} className="h-full w-full object-cover" muted />
                ) : (
                  <RemoteImage src={thumbAsset.mediaAsset.url} className="h-full w-full" sizes="(max-width: 1024px) 100vw, 640px" priority />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-300">{post.caption || "(pas de description)"}</p>
              {post.media.length === 0 && post.sourceMediaUrl && (
                <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100">
                  {(post.sourceMediaAttempts ?? 0) >= 3 ? "Le média d’origine n’a pas pu être récupéré : ajoutez-le à la main avant de programmer." : "Média importé en cours de récupération (quelques minutes). Si rien n’apparaît, ajoutez-le à la main."}{" "}
                  <a href={post.sourceMediaUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    Voir l&apos;URL d&apos;origine
                  </a>
                </p>
              )}
              {post.media.length === 0 && !post.sourceMediaUrl && post.importedAt && <p className="mt-3 text-xs text-slate-500">Publication importée sans média : ajoutez-en un avant de programmer si le réseau l&apos;exige.</p>}
            </div>
          </div>
        </GlassCard>

        {/* Statistiques (24/09/2026) : mêmes chiffres que la fenêtre du
            calendrier, dès que la publication est passée sur un réseau. */}
        {(post.status === "PUBLISHED" || post.status === "PARTIAL") && (
          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">Statistiques</h2>
            <PostStats postId={post.id} />
          </GlassCard>
        )}

        <GlassCard>
          <h2 className="mb-3 font-display text-base font-medium text-white">Statuts par réseau</h2>
          <div className="space-y-3">
            {post.targets.map((t) => {
              const insight = t.insights[0];
              const retentionCurve: { timeRatio: number; watchRatio: number }[] = insight
                ? JSON.parse(insight.retentionCurve)
                : [];
              const dropOffPoints: { timeRatio: number; watchRatio: number; note: string }[] = insight
                ? JSON.parse(insight.dropOffPoints)
                : [];
              const recommendations: string[] = insight ? JSON.parse(insight.recommendations) : [];

              return (
                <div key={t.id} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <NetworkBadge network={t.network} size="sm" />
                      <span className="text-xs text-slate-400">{t.connection.displayName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {t.status === "RETRY_WAIT" && t.errorCategory === "VERIFY" ? "Vérification en cours" : (STATUS_LABEL[t.status] ?? t.status)}
                      </span>
                      {t.externalUrl && (
                        <>
                          <a href={t.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-aurora-300 underline">
                            Voir en ligne
                          </a>
                          <button
                            onClick={() => copyLink(t.id, t.externalUrl as string)}
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            {copiedTargetId === t.id ? "Copié ✓" : "Copier le lien"}
                          </button>
                          <button
                            onClick={() => shareToCommunity(t.id)}
                            disabled={sharing === t.id || sharedTargetIds.includes(t.id)}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-50"
                            title="Partager cette vidéo dans l'onglet « Vidéos du jour » de la Communauté"
                          >
                            <IconUsers className="h-3.5 w-3.5" />
                            {sharedTargetIds.includes(t.id) ? "Partagé ✓" : sharing === t.id ? "Partage..." : "Partager avec la communauté"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {t.network === "YOUTUBE" && t.thumbnailStatus && THUMBNAIL_NOTE[t.thumbnailStatus] && (
                    <p className={clsx("mt-2 text-xs", THUMBNAIL_NOTE[t.thumbnailStatus].tone)}>{THUMBNAIL_NOTE[t.thumbnailStatus].text}</p>
                  )}
                  {t.errorMessage && (
                    <TargetError
                      network={t.network}
                      status={t.status}
                      message={t.errorMessage}
                      category={t.errorCategory ?? null}
                    />
                  )}

                  {t.network === "YOUTUBE" && t.status === "PUBLISHED" && aiStatus?.enabled && (
                    <div className="mt-3 border-t border-white/[0.06] pt-3">
                      {!insight ? (
                        <div className="space-y-2">
                          <Button variant="outline" onClick={() => analyzeRetention(t.id)} disabled={analyzing === t.id}>
                            <IconSparkle className="h-4 w-4" />{" "}
                            {analyzing === t.id ? "Analyse en cours..." : "Analyser la rétention (IA)"}
                          </Button>
                          {analyzeError[t.id] && (
                            <p className="max-w-md rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
                              {analyzeError[t.id]}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-200">{insight.summary}</p>
                          {retentionCurve.length > 0 && (
                            <RetentionCurveChart points={retentionCurve} height={140} />
                          )}
                          {dropOffPoints.length > 0 && (
                            <ul className="space-y-1 text-xs text-slate-400">
                              {dropOffPoints.map((d, i) => (
                                <li key={i}>
                                  <span className="text-aurora-300">{Math.round(d.timeRatio * 100)}%</span> — {d.note}
                                </li>
                              ))}
                            </ul>
                          )}
                          {recommendations.length > 0 && (
                            <ul className="space-y-1 text-xs text-emerald-300">
                              {recommendations.map((r, i) => (
                                <li key={i}>✓ {r}</li>
                              ))}
                            </ul>
                          )}
                          <button
                            onClick={() => analyzeRetention(t.id)}
                            className="text-xs text-slate-500 hover:text-slate-300"
                            disabled={analyzing === t.id}
                          >
                            {analyzing === t.id ? "Analyse en cours..." : "Relancer l'analyse"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="flex h-[600px] flex-col lg:sticky lg:top-8">
        <h2 className="mb-3 font-display text-base font-medium text-white">Discussion</h2>
        <div className="flex-1 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">
              Discutez de cette publication et de ses statistiques avec l&apos;assistant IA
              {!aiStatus?.enabled && " (activez l'IA dans Facturation pour obtenir des réponses)"}.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "USER"
                  ? "ml-auto max-w-[85%] rounded-xl bg-nebula-600/40 px-3 py-2 text-sm text-white"
                  : "max-w-[85%] rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-slate-200"
              }
            >
              {m.content}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Écrire un message..."
            className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-nebula-500 to-accent-cyan text-white disabled:opacity-40"
          >
            <IconSend className="h-4 w-4" />
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

// Erreur d'une cible (lot 5) : en attente de relance, texte ambre ; en
// échec, message du réseau + conseil selon la catégorie, et raccourci vers
// Comptes quand il faut reconnecter le compte.
function TargetError({ network, status, message, category }: { network: Network; status: string; message: string; category: string | null }) {
  const label = NETWORK_META[network]?.label ?? network;
  const text = message.replace(/^\[[A-Z_]+\]\s*/, "");
  if (status === "RETRY_WAIT") {
    return <p className="mt-2 text-xs text-amber-300">{text}</p>;
  }
  const advice = status === "FAILED" ? errorAdvice(category, label) : null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-red-400">{text}</p>
      {advice && <p className="text-xs text-slate-400">{advice}</p>}
      {status === "FAILED" && category === "AUTH_EXPIRED" && (
        <Link href="/accounts" className="inline-block text-xs text-aurora-300 underline">
          Reconnecter {label}
        </Link>
      )}
    </div>
  );
}
