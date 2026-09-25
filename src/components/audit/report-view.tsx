// Rapport d'audit de présence (/audit/<jeton>) — rendu côté serveur, à
// partir du résultat enregistré (AuditResult). Les seules parties
// interactives sont des îlots client : conseils de l'IA, partage, suppression.
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { NetworkTile } from "@/components/ui/network-badge";
import { IconLink } from "@/components/dashboard/icons";
import { PoweredByNebula } from "@/components/marketing/powered-by";
import { ButtonLink } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";
import { cadence, instagramEngagement, youtubeEngagement, pct } from "@/lib/audit/score";
import {
  AUDIT_SOURCE_LABEL,
  subjectOf,
  type AuditAdvice,
  type AuditAxis,
  type AuditCheck,
  type AuditRecommendation,
  type AuditResult,
  type AuditSourceKey,
  type SourceOutcome
} from "@/lib/audit/types";
import { AdviceSection } from "./advice-section";
import { ShareBar } from "./share-bar";
import { DeleteReport } from "./delete-report";

const nf = (n: number) => n.toLocaleString("fr-FR");
const SOURCE_ORDER: AuditSourceKey[] = ["youtube", "instagram", "tiktok", "website"];
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });
const DATE_TIME_FMT = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });

/** Couleur d'un score (texte ; le mode clair a ses propres teintes). */
export function scoreTone(score: number | null): string {
  if (score === null) return "text-slate-500";
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-aurora-300";
  if (score >= 40) return "text-amber-300";
  return "text-red-300";
}

export function ScoreRing({ score, size = 132, label }: { score: number | null; size?: number; label?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={score === null ? "Score non calculé" : `Score de présence : ${score} sur 100${label ? `, ${label}` : ""}`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-white/[0.08]" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          transform="rotate(-90 60 60)"
          className={scoreTone(score)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-display text-4xl font-semibold tabular-nums text-white">{score ?? "—"}</span>
        <span className="text-[11px] text-slate-500">sur 100</span>
      </div>
    </div>
  );
}

function Bar({ score }: { score: number | null }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
      <div className={clsx("h-full rounded-full bg-current", scoreTone(score))} style={{ width: `${score ?? 0}%` }} />
    </div>
  );
}

function checkMark(c: AuditCheck): { symbol: string; tone: string; label: string } {
  if (c.value === null) return { symbol: "–", tone: "text-slate-500", label: "non calculé" };
  if (c.value >= 0.99) return { symbol: "✓", tone: "text-emerald-300", label: "atteint" };
  if (c.value <= 0.01) return { symbol: "✗", tone: "text-red-300", label: "non atteint" };
  return { symbol: "◐", tone: "text-amber-300", label: "en partie" };
}

function AxisCard({ axis }: { axis: AuditAxis }) {
  const counted = axis.checks.filter((c) => c.value !== null);
  const weakest = [...counted].sort((a, b) => (a.value as number) - (b.value as number)).slice(0, 2);
  return (
    <GlassCard hover={false} className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-white">{axis.label}</h3>
        <span className={clsx("font-display text-2xl font-semibold tabular-nums", scoreTone(axis.score))}>{axis.score ?? "—"}</span>
      </div>
      <Bar score={axis.score} />
      {axis.score === null ? (
        <p className="text-xs text-slate-400">Non calculé. {axis.missing}</p>
      ) : (
        <ul className="space-y-1.5 text-xs text-slate-300">
          {weakest.map((c) => (
            <li key={c.label}>
              <span className="text-slate-500">{c.label} : </span>
              {c.detail}
            </li>
          ))}
        </ul>
      )}
      {axis.checks.length > 0 && (
        <details className="group mt-auto text-xs">
          <summary className="cursor-pointer select-none text-aurora-300 transition hover:text-white">Pourquoi ce score</summary>
          <ul className="mt-2 space-y-2">
            {axis.checks.map((c) => {
              const m = checkMark(c);
              return (
                <li key={c.label} className="flex gap-2">
                  <span className={clsx("w-3 shrink-0 text-center", m.tone)} aria-label={m.label}>
                    {m.symbol}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-200">{c.label}</span>
                    <span className="block text-slate-400">{c.detail}</span>
                    <span className="block text-slate-500">Repère : {c.rule}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </GlassCard>
  );
}

const PRIORITY: Record<AuditRecommendation["priority"], { label: string; className: string }> = {
  3: { label: "À faire d'abord", className: "nb-chip-danger" },
  2: { label: "Ensuite", className: "nb-chip-warn" },
  1: { label: "Pour aller plus loin", className: "bg-white/[0.06] text-slate-300" }
};

function Section({ id, title, children, aside }: { id?: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id ? `${id}-title` : undefined} className="font-display text-lg font-semibold text-white">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Avatar({ src, alt, round = true }: { src: string | null | undefined; alt: string; round?: boolean }) {
  if (!src) return <span className={clsx("block h-10 w-10 shrink-0 bg-white/[0.06]", round ? "rounded-full" : "rounded-lg")} aria-hidden="true" />;
  // Image d'un réseau, affichée telle quelle (pas d'optimisation : elle ne compte pas dans le quota d'images de Vercel).
  return <Image src={src} alt={alt} width={40} height={40} unoptimized className={clsx("h-10 w-10 shrink-0 object-cover", round ? "rounded-full" : "rounded-lg")} />;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="font-display text-base font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function Unreadable({ source, outcome }: { source: AuditSourceKey; outcome: SourceOutcome<unknown> }) {
  return (
    <GlassCard hover={false} className="p-4">
      <p className="text-sm font-medium text-white">{AUDIT_SOURCE_LABEL[source]} : non analysé</p>
      <p className="mt-1 text-sm text-slate-400">{outcome.message ?? "Source non lisible."}</p>
    </GlassCard>
  );
}

function YoutubeBlock({ result }: { result: AuditResult }) {
  const outcome = result.sources.youtube;
  if (!outcome) return null;
  if (outcome.status !== "ok" || !outcome.facts) return <Unreadable source="youtube" outcome={outcome} />;
  const yt = outcome.facts;
  const now = new Date(result.analyzedAt);
  const cad = cadence(yt.videos.map((v) => v.publishedAt), now);
  const e = youtubeEngagement(yt, now);
  return (
    <GlassCard hover={false} className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Avatar src={yt.avatarUrl} alt="" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-white">
            <NetworkTile network="YOUTUBE" size={18} /> <span className="truncate">{yt.title}</span>
          </p>
          <a href={yt.url} target="_blank" rel="noreferrer nofollow" className="text-xs text-slate-400 hover:text-white hover:underline">
            {yt.handle ?? "Voir la chaîne"}
          </a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Abonnés" value={yt.subscribers === null ? "masqués" : nf(yt.subscribers)} />
        <Stat label="Vidéos" value={yt.videoCount === null ? "—" : nf(yt.videoCount)} />
        <Stat label="Une vidéo tous les" value={cad ? `${nf(Math.round(cad.medianGap * 10) / 10)} j` : "—"} />
        <Stat label="Vues médianes" value={e.medianViews === null ? "—" : nf(e.medianViews)} />
      </div>
      {yt.videos.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-slate-500">Dernières vidéos</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {yt.videos.slice(0, 6).map((v) => (
              <li key={v.id} className="min-w-0">
                <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noreferrer nofollow" className="group block">
                  <span className="relative block aspect-video overflow-hidden rounded-lg bg-white/[0.04]">
                    <Image src={v.thumbnailUrl} alt="" fill unoptimized sizes="200px" className="object-cover transition group-hover:opacity-90" />
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs text-slate-200 group-hover:underline">{v.title}</span>
                  <span className="block text-[11px] text-slate-500">
                    {SHORT_DATE.format(new Date(v.publishedAt))}
                    {v.views !== null ? ` · ${nf(v.views)} vues` : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}

function InstagramBlock({ result }: { result: AuditResult }) {
  const outcome = result.sources.instagram;
  if (!outcome) return null;
  if (outcome.status !== "ok" || !outcome.facts) return <Unreadable source="instagram" outcome={outcome} />;
  const ig = outcome.facts;
  const cad = cadence(ig.media.map((m) => m.timestamp), new Date(result.analyzedAt));
  const e = instagramEngagement(ig);
  return (
    <GlassCard hover={false} className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Avatar src={ig.avatarUrl} alt="" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-white">
            <NetworkTile network="INSTAGRAM" size={18} /> <span className="truncate">{ig.name ?? `@${ig.username}`}</span>
          </p>
          <a href={`https://www.instagram.com/${encodeURIComponent(ig.username)}/`} target="_blank" rel="noreferrer nofollow" className="text-xs text-slate-400 hover:text-white hover:underline">
            @{ig.username}
          </a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Abonnés" value={ig.followers === null ? "—" : nf(ig.followers)} />
        <Stat label="Publications" value={ig.mediaCount === null ? "—" : nf(ig.mediaCount)} />
        <Stat label="Une publication tous les" value={cad ? `${nf(Math.round(cad.medianGap * 10) / 10)} j` : "—"} />
        <Stat label="Engagement moyen" value={e.rate === null ? "—" : pct(e.rate)} />
      </div>
      {ig.biography && <p className="whitespace-pre-line text-sm text-slate-300">{ig.biography}</p>}
    </GlassCard>
  );
}

function TiktokBlock({ result }: { result: AuditResult }) {
  const outcome = result.sources.tiktok;
  if (!outcome) return null;
  if (outcome.status !== "ok" || !outcome.facts) return <Unreadable source="tiktok" outcome={outcome} />;
  const tt = outcome.facts;
  return (
    <GlassCard hover={false} className="space-y-2 p-4 sm:p-5">
      <p className="flex items-center gap-2 font-medium text-white">
        <NetworkTile network="TIKTOK" size={18} /> <span className="truncate">{tt.displayName ?? `@${tt.username}`}</span>
      </p>
      <a href={tt.url} target="_blank" rel="noreferrer nofollow" className="text-xs text-slate-400 hover:text-white hover:underline">
        @{tt.username}
      </a>
      {tt.bio && <p className="text-sm text-slate-300">{tt.bio}</p>}
      <p className="text-xs text-slate-500">Profil trouvé. TikTok ne rend publiques ni les vues ni les abonnés : ils ne sont pas dans ce score.</p>
    </GlassCard>
  );
}

const SOCIAL_LABEL: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  threads: "Threads",
  bluesky: "Bluesky"
};

function WebsiteBlock({ result }: { result: AuditResult }) {
  const outcome = result.sources.website;
  if (!outcome) return null;
  if (outcome.status !== "ok" || !outcome.facts) return <Unreadable source="website" outcome={outcome} />;
  const w = outcome.facts;
  const links = Object.keys(w.socialLinks);
  return (
    <GlassCard hover={false} className="space-y-3 p-4 sm:p-5">
      <p className="flex items-center gap-2 font-medium text-white">
        <IconLink className="h-4 w-4 text-slate-400" />
        <a href={w.url} target="_blank" rel="noreferrer nofollow" className="truncate hover:underline">
          {w.host}
        </a>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Connexion" value={w.https ? "HTTPS" : "non sécurisée"} />
        <Stat label="Réponse" value={`${nf(w.responseMs)} ms`} />
        <Stat label="Mobile" value={w.viewport ? "adapté" : "non réglé"} />
        <Stat label="Liens vers vos réseaux" value={links.length} />
      </div>
      {w.title && (
        <p className="text-sm text-slate-300">
          <span className="text-slate-500">Titre : </span>
          {w.title}
        </p>
      )}
      {w.description && (
        <p className="text-sm text-slate-300">
          <span className="text-slate-500">Description : </span>
          {w.description}
        </p>
      )}
      {links.length > 0 && <p className="text-xs text-slate-500">Liens trouvés : {links.map((k) => SOCIAL_LABEL[k] ?? k).join(", ")}.</p>}
    </GlassCard>
  );
}

function CoherenceTable({ result }: { result: AuditResult }) {
  const s = result.sources;
  const cols: { key: AuditSourceKey; avatar: string | null; name: string | null; handle: string | null; link: string | null }[] = [];
  if (s.youtube?.facts) cols.push({ key: "youtube", avatar: s.youtube.facts.avatarUrl, name: s.youtube.facts.title, handle: s.youtube.facts.handle, link: /(https?:\/\/|www\.)\S+/i.exec(s.youtube.facts.description)?.[0] ?? null });
  if (s.instagram?.facts) cols.push({ key: "instagram", avatar: s.instagram.facts.avatarUrl, name: s.instagram.facts.name, handle: `@${s.instagram.facts.username}`, link: s.instagram.facts.website });
  if (s.tiktok?.facts) cols.push({ key: "tiktok", avatar: null, name: s.tiktok.facts.displayName, handle: `@${s.tiktok.facts.username}`, link: null });
  if (cols.length < 2) return null;
  const row = (label: string, render: (c: (typeof cols)[number]) => ReactNode) => (
    <tr className="border-t border-white/[0.06]">
      <th scope="row" className="py-2 pr-3 text-left text-xs font-medium text-slate-500">
        {label}
      </th>
      {cols.map((c) => (
        <td key={c.key} className="max-w-[12rem] py-2 pr-3 align-middle text-sm text-slate-200">
          {render(c)}
        </td>
      ))}
    </tr>
  );
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-2">
      <table className="w-full min-w-[28rem] border-collapse">
        <thead>
          <tr>
            <td />
            {cols.map((c) => (
              <th key={c.key} scope="col" className="py-2 pr-3 text-left text-xs font-semibold text-white">
                {AUDIT_SOURCE_LABEL[c.key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row("Photo", (c) => (c.key === "tiktok" ? <span className="text-xs text-slate-500">non publique</span> : <Avatar src={c.avatar} alt="" />))}
          {row("Nom", (c) => <span className="break-words">{c.name ?? "—"}</span>)}
          {row("Pseudo", (c) => <span className="break-all">{c.handle ?? "—"}</span>)}
          {row("Lien", (c) => <span className="break-all text-xs">{c.key === "tiktok" ? <span className="text-slate-500">non public</span> : (c.link ?? "aucun")}</span>)}
        </tbody>
      </table>
    </div>
  );
}

const CANNOT_SEE = [
  { title: "Rétention de vos vidéos", text: "à quel moment les spectateurs décrochent, vidéo par vidéo." },
  { title: "Vos meilleurs créneaux", text: "les heures où VOTRE audience réagit le plus, calculées sur vos statistiques." },
  { title: "Croissance d'abonnés", text: "jour par jour, sur chaque réseau, y compris TikTok." },
  { title: "Chaque publication", text: "vues, j'aime, commentaires et partages, réseau par réseau." },
  { title: "Rapports clients automatiques", text: "un rapport à jour envoyé chaque semaine à vos clients." }
];

export function ReportView({ token, result, advice, expiresAt, shareUrl }: { token: string; result: AuditResult; advice: AuditAdvice | null; expiresAt: Date; shareUrl: string }) {
  const subject = subjectOf(result);
  const { score } = result;
  const analyzed = new Date(result.analyzedAt);
  // Ordre fixe (la base range les clés du JSON à sa façon).
  const sourcesRead = SOURCE_ORDER.filter((k) => result.sources[k]?.status === "ok");
  const register = "/register?utm_source=audit&utm_medium=rapport&utm_campaign=audit";
  return (
    <div className="space-y-8">
      <GlassCard hover={false} className="p-5 sm:p-6">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:text-left">
          <ScoreRing score={score.global} label={score.label ?? undefined} />
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aurora-300">Audit de présence en ligne</p>
            <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">{subject}</h1>
            <p className={clsx("font-medium", scoreTone(score.global))}>{score.label ?? "Score non calculé"}</p>
            <p className="text-xs text-slate-400">
              {score.global === null ? "Pas assez de données publiques pour un score global (2 axes au moins) : ajoutez une chaîne YouTube ou un compte Instagram professionnel" : `Calculé sur ${score.basedOn} axe${score.basedOn > 1 ? "s" : ""} sur 5`} · sources lues :{" "}
              {sourcesRead.map((k) => AUDIT_SOURCE_LABEL[k]).join(", ") || "aucune"}
            </p>
            <p className="text-xs text-slate-500">Analyse du {DATE_TIME_FMT.format(analyzed)}, à partir des seules données publiques.</p>
          </div>
        </div>
      </GlassCard>

      <Section id="axes" title="Les cinq axes">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {score.axes.map((a) => (
            <AxisCard key={a.key} axis={a} />
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Chaque note vient de règles affichées dans « Pourquoi ce score », avec des repères de bonnes pratiques choisis par Nebula (pas une moyenne du secteur). Un axe sans données
          n&apos;est pas compté.
        </p>
      </Section>

      {result.recommendations.length > 0 && (
        <Section id="actions" title="Quoi faire en premier">
          <ol className="space-y-2">
            {result.recommendations.map((r) => (
              <li key={r.key} className="flex flex-col gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:flex-row sm:items-start sm:gap-3">
                <span className={clsx("w-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", PRIORITY[r.priority].className)}>{PRIORITY[r.priority].label}</span>
                <span className="text-sm leading-relaxed text-slate-200">{r.text}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <AdviceSection token={token} initial={advice} enabled={score.global !== null} />

      <Section id="plateformes" title="Par plateforme">
        <div className="space-y-3">
          <YoutubeBlock result={result} />
          <InstagramBlock result={result} />
          <TiktokBlock result={result} />
          <WebsiteBlock result={result} />
          {result.notes.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-400">
              {result.notes.map((n) => (
                <li key={n.text}>{n.text}</li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {sourcesRead.filter((k) => k !== "website").length >= 2 && (
        <Section id="coherence" title="Cohérence de marque">
          <CoherenceTable result={result} />
        </Section>
      )}

      <Section id="au-dela" title="Ce que cet audit ne peut pas voir">
        <GlassCard hover={false} className="space-y-4 p-5">
          <p className="text-sm text-slate-300">Ces chiffres ne sont pas publics : ils demandent de connecter vos comptes. C&apos;est exactement ce que fait Nebula, gratuitement pour commencer.</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CANNOT_SEE.map((c) => (
              <li key={c.title} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-sm">
                <span className="font-medium text-white">{c.title}</span> <span className="text-slate-400">: {c.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ButtonLink href={register}>Créer mon espace gratuitement</ButtonLink>
            <Link href="/outils/audit" className="text-sm text-aurora-300 transition hover:text-white">
              Lancer un autre audit →
            </Link>
          </div>
        </GlassCard>
      </Section>

      <Section id="partage" title="Partager ce rapport">
        <ShareBar url={shareUrl} subject={subject} score={score.global} />
      </Section>

      <div className="space-y-4 border-t border-white/[0.06] pt-6 text-center">
        <p className="text-xs text-slate-500">
          Ce rapport n&apos;est pas indexé par les moteurs de recherche. Il sera supprimé automatiquement le {DATE_FMT.format(expiresAt)}.
        </p>
        <DeleteReport token={token} />
        <PoweredByNebula />
      </div>
    </div>
  );
}
