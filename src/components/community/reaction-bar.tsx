"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/dashboard/toast";
import { clsx } from "@/lib/clsx";
import { usePremiumReactions } from "@/lib/premium/use-premium-reactions";
import { playVipChime } from "@/lib/premium/vip-sound";

const STANDARD_EMOJIS = ["👍", "❤️", "😂", "😮", "👏"];

export interface ReactionItem {
  emoji: string;
  userId: string;
}

interface Props {
  threadId?: string;
  replyId?: string;
  reactions: ReactionItem[];
  myUserId: string;
}

/**
 * Barre de réactions (façon Slack/Discord) sur un thread ou une réponse de
 * la Communauté : emojis standard ouverts à tous, plus une section "Exclusif
 * Premium" utilisant le pack généré par IA (voir /api/premium/reactions) —
 * grisée avec infobulle pour les comptes Gratuit, la vérification réelle
 * restant côté serveur (/api/community/reactions).
 */
export function ReactionBar({ threadId, replyId, reactions: initial, myUserId }: Props) {
  const toast = useToast();
  const { reactions: pack, isPremium } = usePremiumReactions();
  const [reactions, setReactions] = useState(initial);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.userId === myUserId) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return Array.from(map.entries());
  }, [reactions, myUserId]);

  async function toggle(emoji: string, isExclusive: boolean) {
    if (isExclusive && !isPremium) {
      toast.error("Réservé aux membres Premium (Pro/Agence) — passez à un palier supérieur dans Facturation.");
      return;
    }

    const already = reactions.some((r) => r.emoji === emoji && r.userId === myUserId);
    const previous = reactions;
    setReactions(
      already ? reactions.filter((r) => !(r.emoji === emoji && r.userId === myUserId)) : [...reactions, { emoji, userId: myUserId }]
    );
    setOpen(false);
    if (!already && isExclusive) playVipChime();

    const res = await fetch("/api/community/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, replyId, emoji })
    });
    if (!res.ok) {
      setReactions(previous);
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Impossible d'enregistrer la réaction.");
    }
  }

  function openPicker() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 6, left: rect.left });
    setOpen((v) => !v);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {grouped.map(([emoji, info]) => {
        const isExclusive = emoji.startsWith("premium:");
        const def = isExclusive ? pack.find((p) => `premium:${p.key}` === emoji) : null;
        return (
          <button
            key={emoji}
            onClick={() => toggle(emoji, isExclusive)}
            className={clsx(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
              info.mine
                ? "border-aurora-400/50 bg-aurora-400/[0.1] text-white"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20"
            )}
            title={isExclusive ? def?.label ?? "Réaction exclusive" : undefined}
          >
            {isExclusive ? (
              def ? <img loading="lazy" decoding="async" src={def.imageUrl} alt={def.label} className="h-3.5 w-3.5" /> : "✨"
            ) : (
              <span>{emoji}</span>
            )}
            <span>{info.count}</span>
          </button>
        );
      })}

      <button
        ref={btnRef}
        onClick={openPicker}
        className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-xs text-slate-400 transition hover:border-white/20 hover:text-white"
      >
        + réagir
      </button>

      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
              <div
                className="fixed z-[999] w-64 rounded-xl border border-white/10 bg-void-900/95 p-3 shadow-glow backdrop-blur-xl"
                style={{ top: anchor.top, left: anchor.left }}
              >
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">Réactions</p>
                <div className="flex flex-wrap gap-1.5">
                  {STANDARD_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => toggle(e, false)}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-base hover:border-white/25"
                    >
                      {e}
                    </button>
                  ))}
                </div>

                <p className="mb-1.5 mt-3 flex items-center gap-1 text-[11px] uppercase tracking-wide text-amber-300">
                  Exclusif Premium ✨
                </p>
                {pack.length === 0 ? (
                  <p className="text-xs text-slate-500">Pack pas encore généré.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {pack.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => toggle(`premium:${p.key}`, true)}
                        title={isPremium ? p.label : "Réservé aux membres Premium"}
                        className={clsx(
                          "relative rounded-lg border px-2 py-1 transition",
                          isPremium
                            ? "border-amber-400/30 bg-amber-400/[0.06] hover:border-amber-400/60"
                            : "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-40"
                        )}
                      >
                        <img loading="lazy" decoding="async" src={p.imageUrl} alt={p.label} className="h-5 w-5" />
                      </button>
                    ))}
                  </div>
                )}
                {!isPremium && pack.length > 0 && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Passez au palier Pro ou Agence pour débloquer ces réactions dorées.
                  </p>
                )}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
