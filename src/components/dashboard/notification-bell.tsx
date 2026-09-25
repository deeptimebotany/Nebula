"use client";

// Centre de notifications (25/09/2026, proposition n° 2 « Actions rapides »
// validée par Lucas) : une cloche dans l'en-tête, avec un compteur, qui ouvre
// une bulle déroulante. Filtres (Tout, À corriger, Publications, Succès,
// Actus), point violet sur les non lues, et un bouton d'action directement
// dans la bulle quand il y a quelque chose à faire (reconnecter un compte,
// voir un succès…). Données : /api/notifications (voir src/lib/notifications.ts).
//
// Le compteur de la cloche ne montre que ce qui est arrivé depuis la
// dernière ouverture de la bulle ; les points « non lu » restent sur chaque
// notification jusqu'à ce qu'on clique dessus ou sur « Tout marquer comme lu ».

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";

interface NotificationItem {
  id: string;
  kind: string;
  category: string;
  title: string;
  body: string;
  href: string | null;
  actionLabel: string | null;
  read: boolean;
  createdAt: string;
}

type Filter = "all" | "fix" | "pub" | "win" | "news";

const SEEN_KEY = "nebula:notifications-seen-at";
// Toutes les 5 minutes (au lieu de chaque minute) : chaque appel réveille la
// base Neon, qui peut ainsi se mettre en veille quand personne n'agit. Le
// retour sur l'onglet et chaque succès débloqué rafraîchissent tout de suite
// (audit performance, lot 4).
const POLL_MS = 5 * 60_000;
// Écart minimal entre deux rafraîchissements déclenchés par le retour sur
// l'onglet (focus + visibilitychange arrivent souvent ensemble).
const REFRESH_GAP_MS = 15_000;
const FIX_KINDS = new Set(["publish_failed", "reconnect"]);

function readSeenAt(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeenAt(value: string) {
  try {
    localStorage.setItem(SEEN_KEY, value);
  } catch {
    // Stockage indisponible (navigation privée…) : le compteur se remettra
    // simplement à jour au prochain chargement.
  }
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(min / 60);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return `il y a ${hours} h`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === yesterday.toDateString()) return `hier, ${time}`;
  if (diff < 6 * 86_400_000) return date.toLocaleDateString("fr-FR", { weekday: "long" });
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// --- Icônes (SVG inline, même trait que src/components/dashboard/icons.tsx) ---
function Svg({ children, className = "h-4 w-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Svg>
  );
}

const KIND_STYLE: Record<string, { tone: string; icon: React.ReactNode }> = {
  publish_ok: { tone: "bg-emerald-400/15 text-emerald-300", icon: <path d="M20 6 9 17l-5-5" /> },
  publish_failed: {
    tone: "bg-red-400/15 text-red-300",
    icon: (
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </>
    )
  },
  reconnect: {
    tone: "bg-amber-400/15 text-amber-300",
    icon: (
      <>
        <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2" />
        <path d="M8 12h8" />
      </>
    )
  },
  approval: { tone: "bg-cyan-400/15 text-cyan-300", icon: <path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 4 3.9z" /> },
  reminder: {
    tone: "bg-aurora-400/15 text-aurora-300",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    )
  },
  achievement: {
    tone: "bg-amber-300/15 text-amber-200",
    icon: (
      <>
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
        <path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4" />
      </>
    )
  },
  referral: {
    tone: "bg-pink-400/15 text-pink-300",
    icon: (
      <>
        <rect x="3" y="8" width="18" height="4" rx="1" />
        <path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
      </>
    )
  },
  news: {
    tone: "bg-aurora-400/15 text-aurora-300",
    icon: (
      <>
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        <path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z" />
      </>
    )
  }
};

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastUnread = useRef(0);

  const refreshBadge = useCallback(async () => {
    const since = readSeenAt();
    try {
      const res = await fetch(`/api/notifications?count=1${since ? `&since=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number };
      // Du nouveau dans la cloche : peut-être une réussite à fêter à l'écran.
      if (data.unread > lastUnread.current) window.dispatchEvent(new Event("nebula:reussites-check"));
      lastUnread.current = data.unread;
      setBadge(data.unread);
    } catch {
      // Hors ligne : on garde l'ancien compteur.
    }
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: NotificationItem[] };
      setItems(data.items);
    } catch {
      setItems((prev) => prev ?? []);
    }
  }, []);

  // Compteur : au chargement, toutes les 5 minutes tant que l'onglet est
  // visible, au retour sur l'onglet, et juste après un succès débloqué.
  useEffect(() => {
    let lastRefresh = Date.now();
    refreshBadge();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      lastRefresh = Date.now();
      refreshBadge();
    }, POLL_MS);
    const onBack = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < REFRESH_GAP_MS) return;
      lastRefresh = Date.now();
      refreshBadge();
    };
    let achievementTimer: number | undefined;
    const onAchievement = () => {
      window.clearTimeout(achievementTimer);
      achievementTimer = window.setTimeout(refreshBadge, 1500);
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("nebula:achievement", onAchievement);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(achievementTimer);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("nebula:achievement", onAchievement);
    };
  }, [refreshBadge]);

  // Fermeture au clic à l'extérieur et avec Échap.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      loadItems();
      writeSeenAt(new Date().toISOString());
      setBadge(0);
    }
  }

  async function markRead(ids: string[] | "all") {
    setItems((prev) => prev?.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)) ?? prev);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids === "all" ? { all: true } : { ids })
    }).catch(() => undefined);
  }

  function openItem(n: NotificationItem) {
    if (!n.read) markRead([n.id]);
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  }

  const counts = useMemo(() => {
    const list = items ?? [];
    return {
      unread: list.filter((n) => !n.read).length,
      fix: list.filter((n) => FIX_KINDS.has(n.kind) && !n.read).length
    };
  }, [items]);

  const visible = useMemo(() => {
    const list = items ?? [];
    switch (filter) {
      case "fix":
        return list.filter((n) => FIX_KINDS.has(n.kind));
      case "pub":
      case "win":
      case "news":
        return list.filter((n) => n.category === filter);
      default:
        return list;
    }
  }, [items, filter]);

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "Tout" },
    { id: "fix", label: counts.fix ? `À corriger · ${counts.fix}` : "À corriger" },
    { id: "pub", label: "Publications" },
    { id: "win", label: "Succès" },
    { id: "news", label: "Actus" }
  ];

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={badge ? `Notifications, ${badge} nouvelle${badge > 1 ? "s" : ""}` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className={clsx(
          "relative flex h-9 w-9 items-center justify-center rounded-lg border transition",
          open ? "border-aurora-400/50 bg-nebula-700/40 text-white" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-aurora-400/40 hover:text-white"
        )}
      >
        <BellIcon className="h-[17px] w-[17px]" />
        {badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-void-950 bg-aurora-500 px-1 text-[10px] font-bold leading-none text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="glass-panel-solid fixed inset-x-2 top-[60px] z-50 flex max-h-[min(72vh,560px)] flex-col overflow-hidden rounded-2xl shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px]"
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <p className="font-display text-sm font-semibold text-white">Notifications</p>
            {counts.unread > 0 && (
              <button type="button" onClick={() => markRead("all")} className="text-xs text-aurora-300 transition hover:text-aurora-200">
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                className={clsx(
                  "rounded-full border px-2.5 py-0.5 text-[11px] transition",
                  filter === c.id ? "border-aurora-400/50 bg-aurora-400/15 text-white" : "border-white/10 text-slate-400 hover:text-white"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.06]">
            {items === null ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <BellIcon className="h-6 w-6 text-slate-600" />
                <p className="text-sm text-slate-400">{filter === "fix" ? "Rien à corriger, tout roule." : "Rien de neuf pour l'instant."}</p>
              </div>
            ) : (
              <ul>
                {visible.map((n) => {
                  const style = KIND_STYLE[n.kind] ?? KIND_STYLE.news;
                  const urgent = FIX_KINDS.has(n.kind);
                  return (
                    <li key={n.id}>
                      <div
                        role={n.href ? "link" : undefined}
                        tabIndex={0}
                        onClick={() => openItem(n)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") openItem(n);
                        }}
                        className={clsx(
                          "relative flex cursor-pointer gap-3 px-4 py-2.5 transition hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none",
                          !n.read && "bg-aurora-400/[0.05]"
                        )}
                      >
                        <span className={clsx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", style.tone)}>
                          <Svg>{style.icon}</Svg>
                        </span>
                        <div className="min-w-0 flex-1 pr-3">
                          <p className="text-[13px] font-semibold text-white">{n.title}</p>
                          <p className="text-xs leading-snug text-slate-400">{n.body}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{relativeTime(n.createdAt)}</p>
                          {n.actionLabel && n.href && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openItem(n);
                              }}
                              className={clsx(
                                "mt-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
                                urgent ? "bg-aurora-500 text-white hover:brightness-110" : "border border-white/10 bg-white/[0.06] text-slate-200 hover:text-white"
                              )}
                            >
                              {n.actionLabel}
                            </button>
                          )}
                        </div>
                        {!n.read && <span className="absolute right-3 top-4 h-2 w-2 rounded-full bg-aurora-400" aria-label="Non lue" />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="border-t border-white/[0.06] px-4 py-2 text-[11px] text-slate-500">Les notifications sont gardées 90 jours.</p>
        </div>
      )}
    </div>
  );
}
