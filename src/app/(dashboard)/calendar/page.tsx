"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useBrand } from "@/components/brand-context";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkDot } from "@/components/ui/network-badge";
import type { Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { QuotaBar } from "@/components/dashboard/quota-bar";

interface ApiPost {
  id: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  targets: { network: Network }[];
}

interface DayEntry {
  id: string;
  title: string;
  networks: Network[];
  status: string;
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export default function CalendarPage() {
  const { activeBrand } = useBrand();
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  useEffect(() => {
    if (!activeBrand) return;
    fetch(`/api/posts?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => setPosts(d.posts ?? []));
  }, [activeBrand]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const push = (dateKey: string, entry: DayEntry) => {
      map.set(dateKey, [...(map.get(dateKey) ?? []), entry]);
    };

    for (const p of posts) {
      if (!p.scheduledAt) continue;
      const key = p.scheduledAt.slice(0, 10);
      push(key, {
        id: p.id,
        title: p.caption || "(sans légende)",
        networks: p.targets.map((t) => t.network),
        status: p.status
      });
    }
    return map;
  }, [posts]);

  const grid = useMemo(() => {
    const first = new Date(cursor);
    const startOffset = (first.getDay() + 6) % 7; // lundi = 0
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);

    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Calendrier de publication</h1>
          <p className="mt-1 text-sm text-slate-400">
            Planifiez et visualisez vos publications multi-réseaux en un coup d&apos;œil.
          </p>
        </div>
        <Link href="/composer">
          <Button>Planifier un post</Button>
        </Link>
      </div>

      <QuotaBar brandId={activeBrand?.id} />

      <GlassCard>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-white">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            >
              ←
            </Button>
            <Button variant="ghost" onClick={() => setCursor(new Date(new Date().setDate(1)))}>
              Aujourd&apos;hui
            </Button>
            <Button
              variant="outline"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            >
              →
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-white/[0.06]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-white/[0.02] px-2 py-2 text-center text-xs font-medium text-slate-500">
              {d}
            </div>
          ))}
          {grid.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const inMonth = day.getMonth() === cursor.getMonth();
            const entries = entriesByDay.get(key) ?? [];
            const isToday = key === today;
            return (
              <div
                key={key}
                className={clsx(
                  "min-h-[110px] bg-void-900/60 p-2 align-top",
                  !inMonth && "opacity-30"
                )}
              >
                <span
                  className={clsx(
                    "mb-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday ? "bg-nebula-500 text-white" : "text-slate-400"
                  )}
                >
                  {day.getDate()}
                </span>
                <div className="space-y-1">
                  {entries.slice(0, 3).map((e) => {
                    return (
                      <Link key={e.id} href={`/posts/${e.id}`} className="block">
                        <div
                          className="flex items-center gap-1 truncate rounded-md bg-nebula-700/40 px-1.5 py-1 text-[11px] text-slate-100 hover:bg-nebula-700/60"
                          title={e.title}
                        >
                          <span className="flex gap-0.5">
                            {e.networks.slice(0, 3).map((n) => (
                              <NetworkDot key={n} network={n} />
                            ))}
                          </span>
                          <span className="truncate">{e.title}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {entries.length > 3 && (
                    <p className="text-[11px] text-slate-500">+{entries.length - 3} autre(s)</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {posts.length === 0 && (
        <p className="text-center text-sm text-slate-500">
          Aucune publication programmée pour l&apos;instant.{" "}
          <Link href="/composer" className="text-aurora-300 hover:underline">Créez la première</Link>.
        </p>
      )}
    </div>
  );
}
