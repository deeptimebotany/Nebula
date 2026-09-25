"use client";

// Constellation de compétences (Réussites v2, lot B — maquette « Réussites
// v2 », planche « Page Réussites · ordinateur ») : 5 branches, 5 étoiles
// chacune. À gauche le ciel (toujours sombre, en mode clair comme en mode
// sombre : c'est un ciel), à droite la compétence choisie : prochaine
// étoile, progression, pourquoi, mini-leçon, « Essayer maintenant », et la
// liste des 5 étoiles. En une colonne sur téléphone.
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import type { ConstellationDTO, SkillDTO, StarDTO } from "@/lib/reussites/types";
import { RarityMark } from "./social-cards";
import { clsx } from "@/lib/clsx";

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

// Géométrie (repère de la maquette) : centre, rayons des 5 étoiles, angle de chaque branche.
const CX = 300;
const CY = 280;
const RADII = [62, 108, 154, 200, 246];
const ANGLES = [-90, -18, 54, 126, 198];

function point(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: +(CX + r * Math.cos(a)).toFixed(1), y: +(CY + r * Math.sin(a)).toFixed(1) };
}

function StarGlyph({ lit, next, color, className }: { lit: boolean; next?: boolean; color: string; className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={className} aria-hidden="true">
      <path
        d="M11 2 L13.4 8.2 L20 8.6 L14.9 12.8 L16.6 19.3 L11 15.6 L5.4 19.3 L7.1 12.8 L2 8.6 L8.6 8.2 Z"
        fill={lit ? color : "none"}
        stroke={lit || next ? color : "currentColor"}
        strokeOpacity={lit || next ? 1 : 0.35}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Sky({ data, selected, onSelect }: { data: ConstellationDTO; selected: number; onSelect: (i: number) => void }) {
  const label = data.skills.map((s) => `${s.name} niveau ${s.level}`).join(", ");
  return (
    <svg viewBox="-150 -40 900 600" className="h-auto w-full max-w-[640px]" role="img" aria-label={`Constellation : ${label}`}>
      <circle cx={CX} cy={CY} r="246" fill="none" stroke="rgba(255,255,255,0.05)" />
      <circle cx={CX} cy={CY} r="154" fill="none" stroke="rgba(255,255,255,0.05)" />
      {data.skills.map((sk, i) => {
        const angle = ANGLES[i];
        const litCount = sk.stars.filter((s) => s.unlockedAt).length;
        const lastLit = sk.stars.reduce((acc, s, k) => (s.unlockedAt ? k : acc), -1);
        const end = point(angle, RADII[4]);
        const solidEnd = lastLit >= 0 ? point(angle, RADII[lastLit]) : { x: CX, y: CY };
        const nextIndex = sk.stars.findIndex((s) => !s.unlockedAt);
        const labelPos = point(angle, 282);
        const cos = Math.cos((angle * Math.PI) / 180);
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <g
            key={sk.id}
            opacity={i === selected ? 1 : 0.5}
            onClick={() => onSelect(i)}
            style={{ cursor: "pointer", transition: "opacity 200ms" }}
          >
            {/* Zone de clic généreuse le long de la branche. */}
            <line x1={CX} y1={CY} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="44" />
            {lastLit >= 0 && <line x1={CX} y1={CY} x2={solidEnd.x} y2={solidEnd.y} stroke={sk.color} strokeWidth="2.5" />}
            <line x1={solidEnd.x} y1={solidEnd.y} x2={end.x} y2={end.y} stroke={sk.color} strokeWidth="1.5" strokeDasharray="4 6" opacity="0.5" />
            {sk.stars.map((st, k) => {
              const p = point(angle, RADII[k]);
              if (st.unlockedAt) {
                return (
                  <g key={st.key}>
                    <circle cx={p.x} cy={p.y} r="14" fill={sk.color} opacity="0.2" />
                    <circle cx={p.x} cy={p.y} r="7" fill={sk.color} />
                  </g>
                );
              }
              if (k === nextIndex) {
                return (
                  <g key={st.key}>
                    <circle className="nb-star-next" cx={p.x} cy={p.y} r="11" fill="none" stroke={sk.color} strokeWidth="2" />
                    <circle cx={p.x} cy={p.y} r="5" fill="#0e0e10" stroke={sk.color} strokeWidth="1.5" />
                  </g>
                );
              }
              return <circle key={st.key} cx={p.x} cy={p.y} r="5" fill="#0e0e10" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />;
            })}
            <text className="nb-sky-label" x={labelPos.x} y={labelPos.y + (angle === -90 ? -4 : angle > 0 && angle < 180 ? 18 : 6)} textAnchor={anchor} fontSize="17" fontWeight="600" fill="#e7e9f5">
              {sk.name} · {litCount}
            </text>
          </g>
        );
      })}
      <circle cx={CX} cy={CY} r="34" fill="#141417" stroke="rgba(160,102,255,0.6)" strokeWidth="2" />
      <circle cx={CX} cy={CY} r="46" fill="none" stroke="rgba(160,102,255,0.18)" />
      <text x={CX} y={CY - 2} textAnchor="middle" fontSize="20" fontWeight="700" fill="#ffffff">
        {data.lit}
      </text>
      <text x={CX} y={CY + 16} textAnchor="middle" fontSize="10.5" fill="#a1a1aa">
        {data.lit > 1 ? "étoiles" : "étoile"}
      </text>
    </svg>
  );
}

function RequirementBars({ star, color }: { star: StarDTO; color: string }) {
  return (
    <div className="space-y-2">
      {star.requirements.map((r, i) => {
        const pct = r.target > 0 ? Math.min(100, Math.round((r.value / r.target) * 100)) : 0;
        return (
          <div key={i}>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={r.target} aria-valuenow={r.value} aria-label={r.unit}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
            </div>
            <p className="mt-1 text-xs tabular-nums text-slate-400">
              {fmt(r.value)} / {fmt(r.target)} {r.unit}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ActionLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (href.startsWith("#")) {
    return (
      <button type="button" className={className} onClick={() => document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" })}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function SkillPanel({ skill, onLesson, highlight }: { skill: SkillDTO; onLesson: (star: StarDTO) => void; highlight: string | null }) {
  const next = skill.stars.find((s) => !s.unlockedAt) ?? null;
  return (
    <div role="tabpanel" id={`skill-panel-${skill.id}`} aria-labelledby={`skill-tab-${skill.id}`} className="flex flex-col gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: skill.color }} aria-hidden="true" />
            {skill.name}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Niveau {skill.level} / 5</p>
        </div>
        <div className="flex gap-1 text-slate-400" aria-label={`${skill.level} étoile${skill.level > 1 ? "s" : ""} sur 5`}>
          {skill.stars.map((s) => (
            <StarGlyph key={s.key} lit={Boolean(s.unlockedAt)} next={next?.key === s.key} color={skill.color} className="h-5 w-5" />
          ))}
        </div>
      </div>

      {next ? (
        <div className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Prochaine étoile · ★{next.n}</p>
          <p className="font-display text-lg font-semibold leading-snug text-white">{next.name}</p>
          <p className="text-sm leading-relaxed text-slate-300">{next.description}</p>
          <RequirementBars star={next} color={skill.color} />
          {next.note && <p className="text-[11px] leading-snug text-slate-500">{next.note}</p>}
          <p className="text-xs text-slate-300">
            Récompense : <strong className="font-semibold text-white">+{next.xp} XP</strong>
            {next.reward && <> · {next.reward}</>}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4">
          <p className="font-display text-base font-semibold text-white">Compétence complète : 5 étoiles sur 5</p>
          <p className="mt-1 text-sm text-slate-300">Bravo. Les mini-leçons restent disponibles ci-dessous.</p>
        </div>
      )}

      <p className="text-sm leading-relaxed text-slate-300">
        <strong className="font-semibold text-white">Pourquoi c&apos;est utile. </strong>
        {skill.why}
      </p>

      {next && (
        <button
          type="button"
          onClick={() => onLesson(next)}
          className="flex items-center gap-3.5 rounded-2xl border border-accent-cyan/30 bg-accent-cyan/[0.06] px-4 py-3 text-left transition hover:border-accent-cyan/60"
        >
          <svg viewBox="0 0 36 36" className="h-9 w-9 shrink-0 text-accent-cyan" aria-hidden="true">
            <rect x="3" y="7" width="30" height="22" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M15 13 L23 18 L15 23 Z" fill="currentColor" />
          </svg>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-accent-cyan">Mini-leçon · 2 min</span>
            <span className="block text-sm font-medium text-white">{next.lessonTitle}</span>
          </span>
        </button>
      )}

      {next && (
        <ActionLink href={next.href} className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-nebula-500 px-4 text-sm font-semibold text-white transition hover:bg-nebula-400">
          Essayer maintenant <span aria-hidden="true">→</span>
        </ActionLink>
      )}

      <div className="border-t border-white/[0.06] pt-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Les 5 étoiles</p>
        <ul className="space-y-1.5">
          {skill.stars.map((s) => (
            <li
              key={s.key}
              id={`star-${s.key}`}
              className={clsx("flex items-center gap-2.5 rounded-xl px-2 py-1.5 scroll-mt-24", highlight === s.key && "nb-focus-flash")}
            >
              <StarGlyph lit={Boolean(s.unlockedAt)} next={next?.key === s.key} color={skill.color} className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">
                  ★{s.n} · {s.name}
                </span>
                <span className="block text-[11px] tabular-nums text-slate-500">
                  {s.unlockedAt ? `Allumée le ${formatDay(s.unlockedAt)}` : `${s.pct} %`} · +{s.xp} XP
                </span>
                <RarityMark rarity={s.rarity} />
              </span>
              <button type="button" onClick={() => onLesson(s)} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-aurora-300 transition hover:bg-white/[0.05] hover:text-white">
                Leçon
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ConstellationSection({
  data,
  selected,
  onSelect,
  onLesson,
  highlight
}: {
  data: ConstellationDTO;
  selected: number;
  onSelect: (i: number) => void;
  onLesson: (star: StarDTO, skill: SkillDTO) => void;
  highlight: string | null;
}) {
  const skill = data.skills[selected] ?? data.skills[0];
  const tabs = useMemo(() => data.skills.map((s, i) => ({ s, i })), [data.skills]);
  return (
    <section id="constellation" aria-labelledby="constellation-title" className="scroll-mt-24 space-y-3 rounded-2xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="constellation-title" className="font-display text-lg font-semibold text-white">
            Constellation de compétences
          </h2>
          <p className="text-xs text-slate-400">5 compétences de créateur. Chaque étoile est une vraie habitude, mesurée sur vos publications, avec une mini-leçon de 2 minutes.</p>
        </div>
        <p className="text-xs tabular-nums text-slate-400">
          {data.lit} / {data.total} étoiles
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="nb-sky flex flex-col items-center justify-center gap-3 rounded-3xl border p-4 sm:p-5">
          <Sky data={data} selected={selected} onSelect={onSelect} />
          <div role="tablist" aria-label="Compétences" className="flex flex-wrap justify-center gap-2">
            {tabs.map(({ s, i }) => (
              <button
                key={s.id}
                id={`skill-tab-${s.id}`}
                type="button"
                role="tab"
                aria-selected={i === selected}
                aria-controls={`skill-panel-${s.id}`}
                onClick={() => onSelect(i)}
                className={clsx("nb-sky-tab min-h-[40px] rounded-full border px-4 py-2 text-sm transition", i === selected && "nb-sky-tab-on font-bold")}
                style={i === selected ? { background: s.color, borderColor: s.color } : undefined}
              >
                {s.name} · {s.level}
              </button>
            ))}
          </div>
        </div>
        <SkillPanel skill={skill} onLesson={(st) => onLesson(st, skill)} highlight={highlight} />
      </div>
    </section>
  );
}
