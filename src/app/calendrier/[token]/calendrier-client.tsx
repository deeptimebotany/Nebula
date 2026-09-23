"use client";

// Page publique du calendrier client (produit n°7 de la feuille de route :
// "calendrier client en lecture seule") — aucune authentification : le token
// (déjà unique, voir CalendarShare dans prisma/schema.prisma) sert
// d'identifiant public, exactement comme /rapport/[token], /l/[slug] et
// /approve/[token]. Aucune action n'est possible ici : c'est volontairement
// une vue en lecture seule, sans aucun bouton d'édition.

import { useEffect, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { GlassCard } from "@/components/ui/glass-card";
import { PoweredByNebula } from "@/components/marketing/powered-by";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

const NETWORK_LABELS: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube"
};

interface UpcomingPost {
  id: string;
  title: string;
  scheduledAt: string;
  thumbnailUrl: string | null;
  networks: string[];
}

interface PublicCalendar {
  brandName: string;
  timezone?: string;
  windowDays: number;
  posts: UpcomingPost[];
}

function groupByDay(posts: UpcomingPost[], timeZone: string): { day: string; posts: UpcomingPost[] }[] {
  const groups = new Map<string, UpcomingPost[]>();
  for (const post of posts) {
    const day = new Date(post.scheduledAt).toLocaleDateString("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" });
    const list = groups.get(day) ?? [];
    list.push(post);
    groups.set(day, list);
  }
  return Array.from(groups.entries()).map(([day, dayPosts]) => ({ day, posts: dayPosts }));
}

export function CalendrierClient({ token }: { token: string }) {
  const [data, setData] = useState<PublicCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/calendar/${token}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setError(d.error ?? "Ce calendrier n'existe pas.");
          return;
        }
        setData(d);
      })
      .catch(() => setError("Impossible de charger ce calendrier."));
  }, [token]);

  const timeZone = data?.timezone || "Europe/Paris";
  const groups = data ? groupByDay(data.posts, timeZone) : [];

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="noise-grid grain-overlay pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-16">
        {error && <p className="mt-20 text-center text-sm text-slate-400">{error}</p>}

        {!error && !data && (
          <div className="mt-10 space-y-4" aria-busy="true" aria-live="polite">
            <div className="mx-auto flex flex-col items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-3 w-40" />
            </div>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <span className="sr-only">Chargement en cours</span>
          </div>
        )}

        {data && (
          <>
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">{data.brandName}</h1>
              <p className="mt-2 text-sm text-slate-400">
                Publications programmées des {data.windowDays} prochains jours — en lecture seule.
              </p>
            </div>

            {groups.length === 0 ? (
              <p className="mt-16 text-center text-sm text-slate-500">Rien de programmé pour l&apos;instant.</p>
            ) : (
              <div className="mt-8 space-y-6">
                {groups.map((group) => (
                  <div key={group.day}>
                    <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{group.day}</h2>
                    <div className="space-y-2">
                      {group.posts.map((post) => (
                        <GlassCard key={post.id} hover={false} className="flex items-center gap-3">
                          {post.thumbnailUrl ? (
                            <RemoteImage src={post.thumbnailUrl} className="h-12 w-12 shrink-0 rounded-lg" sizes="48px" />
                          ) : (
                            <div className="h-12 w-12 shrink-0 rounded-lg bg-white/5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{post.title}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {new Date(post.scheduledAt).toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })}
                              {" · "}
                              {post.networks.map((n) => NETWORK_LABELS[n] ?? n).join(", ")}
                            </p>
                          </div>
                        </GlassCard>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <PoweredByNebula className="mt-10" />
          </>
        )}
      </div>
    </main>
  );
}
