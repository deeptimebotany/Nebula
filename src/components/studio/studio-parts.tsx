"use client";

// Morceaux de la page Studio IA (produit n°9) : faits « ce qui marche chez
// vous », cartes d'idées, script. Les chiffres affichés viennent toujours
// des faits calculés par Nebula (StudioFacts, TopPost), jamais du texte de l'IA.
import Link from "next/link";
import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { NetworkBadge } from "@/components/ui/network-badge";
import { clsx } from "@/lib/clsx";
import { formatCompact } from "@/lib/engagement-metrics";
import { NETWORK_META } from "@/lib/types";
import type { StudioFacts, TopPost } from "@/lib/studio/facts";
import { FORMAT_LABEL, type StudioIdea, type StudioScript } from "@/lib/studio/types";

const nf = (n: number) => n.toLocaleString("fr-FR");
const times = (x: number) => `${x.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ×`;

export function CopyButton({ text, label = "Copier", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
      className={clsx("shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white", className)}
    >
      {done ? "Copié" : label}
    </button>
  );
}

/** « Inspiré de : … (3,2 × vos vues habituelles sur YouTube) » — chiffres des faits. */
export function SourceLine({ post }: { post: TopPost }) {
  const what = post.metric === "views" ? "vues" : "interactions";
  return (
    <p className="text-xs text-slate-400">
      Inspiré de{" "}
      {post.permalink ? (
        <a href={post.permalink} target="_blank" rel="noreferrer" className="text-slate-200 underline decoration-slate-500 underline-offset-2 hover:decoration-current">
          « {post.title} »
        </a>
      ) : (
        <span className="text-slate-200">« {post.title} »</span>
      )}{" "}
      : {formatCompact(post.value)} {what}
      {post.vsUsual !== null && post.vsUsual >= 1.1 ? `, ${times(post.vsUsual)} vos ${what} habituelles sur ${NETWORK_META[post.network].label}` : ""}.
    </p>
  );
}

export function FactsPanel({ facts, connectHref = "/accounts" }: { facts: StudioFacts; connectHref?: string }) {
  if (facts.networks.length === 0) {
    return (
      <GlassCard hover={false} className="p-5">
        <p className="font-medium text-white">Connectez un réseau pour que le Studio parte de vos chiffres</p>
        <p className="mt-1 text-sm text-slate-400">Sans données, les idées restent générales. Une fois vos comptes connectés, le Studio s&apos;appuie sur vos meilleures publications, vos heures et vos courbes de rétention.</p>
        <Link href={connectHref} className="mt-3 inline-block text-sm font-medium text-aurora-300 hover:text-white">
          Connecter un compte →
        </Link>
      </GlassCard>
    );
  }
  return (
    <GlassCard hover={false} className="space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-white">Ce qui marche chez vous</h2>
        <p className="text-xs text-slate-500">
          {facts.measured ? `${nf(facts.measured)} publications mesurées sur 4 mois` : "Aucune publication mesurée pour l'instant"} · calculé par Nebula, sans IA
        </p>
      </div>

      {facts.topPosts.length > 0 ? (
        <ol className="space-y-2">
          {facts.topPosts.slice(0, 5).map((p) => (
            <li key={p.ref} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              <span className="w-5 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-slate-500">{p.ref}</span>
              <span className="min-w-0 flex-1">
                {p.permalink ? (
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="line-clamp-2 break-words text-sm text-white hover:underline sm:line-clamp-1">
                    {p.title}
                  </a>
                ) : (
                  <span className="line-clamp-2 break-words text-sm text-white sm:line-clamp-1">{p.title}</span>
                )}
                <span className="text-[11px] text-slate-400">
                  {formatCompact(p.value)} {p.metric === "views" ? "vues" : "interactions"}
                  {p.vsUsual !== null ? ` · ${times(p.vsUsual)} vos chiffres habituels` : ""}
                </span>
              </span>
              <NetworkBadge network={p.network} size="sm" />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-400">
          Pas encore assez de chiffres par publication. Ouvrez{" "}
          <Link href="/engagements" className="text-aurora-300 hover:text-white">
            Engagements
          </Link>{" "}
          et actualisez : le Studio s&apos;appuiera sur vos meilleures publications.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
          <p className="text-[11px] text-slate-500">Meilleures heures</p>
          <p className="text-slate-200">{facts.bestSlots.length ? facts.bestSlots.map((s) => `${NETWORK_META[s.network].label} ${s.hour} h`).join(" · ") : "Pas encore assez de relevés"}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
          <p className="text-[11px] text-slate-500">Rétention (vidéos analysées)</p>
          <p className="text-slate-200">
            {facts.retention
              ? facts.retention.halfAudienceAt !== null
                ? `La moitié du public part vers ${Math.round(facts.retention.halfAudienceAt * 100)} % (${facts.retention.analyses} analyse${facts.retention.analyses > 1 ? "s" : ""})`
                : `Plus de la moitié du public reste jusqu'au bout (${facts.retention.analyses} analyse${facts.retention.analyses > 1 ? "s" : ""})`
              : (
                <Link href="/retention" className="text-aurora-300 hover:text-white">
                  Analysez une vidéo dans Rétention IA
                </Link>
              )}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
          <p className="text-[11px] text-slate-500">Rythme</p>
          <p className="text-slate-200">
            {facts.rhythm.postsLast30Days} publication{facts.rhythm.postsLast30Days > 1 ? "s" : ""} en 30 jours
            {facts.rhythm.medianGapDays !== null ? ` · une tous les ${facts.rhythm.medianGapDays.toLocaleString("fr-FR")} j` : ""}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

export function IdeaCard({
  idea,
  index,
  source,
  onScript,
  composerHref
}: {
  idea: StudioIdea;
  index: number;
  source: TopPost | null;
  onScript: () => void;
  composerHref: string;
}) {
  return (
    <GlassCard hover={false} className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-display text-base font-semibold text-white">
          <span className="mr-1.5 text-slate-500">{index + 1}.</span>
          {idea.title}
        </h3>
        <span className="flex shrink-0 items-center gap-1.5">
          {idea.network && <NetworkBadge network={idea.network} size="sm" />}
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-300">{idea.format === "court" ? "Format court" : "Vidéo longue"}</span>
        </span>
      </div>
      <p className="text-sm text-slate-300">{idea.angle}</p>
      {source && <SourceLine post={source} />}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Accroches (3 premières secondes)</p>
        <ul className="space-y-1.5">
          {idea.hooks.map((h, i) => (
            <li key={i} className="flex items-start justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-sm text-slate-200">
              <span className="min-w-0">« {h} »</span>
              <CopyButton text={h} />
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={onScript} className="min-h-[40px] rounded-xl border border-aurora-400/40 px-3 text-sm font-medium text-aurora-200 transition hover:bg-aurora-400/10">
          Écrire le script
        </button>
        <Link href={composerHref} className="inline-flex min-h-[40px] items-center rounded-xl px-3 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
          Utiliser dans Publier →
        </Link>
      </div>
    </GlassCard>
  );
}

export function scriptAsText(s: StudioScript): string {
  return [
    s.title,
    "",
    `Accroche : ${s.hook}`,
    "",
    ...s.sections.flatMap((sec, i) => [`${i + 1}. ${sec.label}`, sec.content, ...(sec.retentionNote ? [`(Repère : ${sec.retentionNote})`] : []), ""]),
    `Appel à l'action : ${s.cta}`,
    "",
    "Description :",
    s.description,
    s.hashtags.join(" ")
  ].join("\n");
}

export function ScriptView({ script, composerHref }: { script: StudioScript; composerHref: string }) {
  return (
    <GlassCard hover={false} className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aurora-300">{FORMAT_LABEL[script.format]}</p>
          <h3 className="mt-1 font-display text-lg font-semibold text-white">{script.title}</h3>
        </div>
        <span className="flex shrink-0 gap-1">
          <CopyButton text={scriptAsText(script)} label="Copier le script" />
        </span>
      </div>
      <div className="rounded-xl border border-aurora-400/25 bg-aurora-400/[0.05] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aurora-300">Accroche</p>
        <p className="mt-1 text-sm text-slate-100">{script.hook}</p>
      </div>
      <ol className="space-y-2">
        {script.sections.map((s, i) => (
          <li key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="text-sm font-medium text-white">
              <span className="mr-1.5 text-slate-500">{i + 1}.</span>
              {s.label}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-300">{s.content}</p>
            {s.retentionNote && (
              <p className="nb-chip-warn mt-2 rounded-lg px-2.5 py-1.5 text-xs">
                <span className="font-semibold">Repère rétention : </span>
                {s.retentionNote}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Appel à l&apos;action</p>
          <p className="mt-1 text-sm text-slate-200">{script.cta}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Description</p>
          <p className="mt-1 text-sm text-slate-200">{script.description}</p>
          {script.hashtags.length > 0 && <p className="mt-1 text-xs text-aurora-200">{script.hashtags.join(" ")}</p>}
        </div>
      </div>
      <Link href={composerHref} className="inline-flex min-h-[40px] items-center rounded-xl border border-white/10 px-4 text-sm text-slate-200 transition hover:border-aurora-400/40 hover:text-white">
        Utiliser le titre et la description dans Publier →
      </Link>
    </GlassCard>
  );
}
