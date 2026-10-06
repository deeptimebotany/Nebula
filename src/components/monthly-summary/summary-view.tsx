"use client";

// Bilan du mois dans Nebula (03/10/2026) : le même contenu que l'e-mail du 3
// du mois, en plus grand, pour une marque et un mois (page /analytics/bilan).
// Graphiques : colonnes fines posées sur une ligne de base (pertes sous la
// ligne, en gris), infobulle au survol, et les chiffres jour par jour en
// tableau (« Voir les chiffres par jour ») pour les lecteurs d'écran.
import Link from "next/link";
import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { NetworkBadge, NetworkTile } from "@/components/ui/network-badge";
import { RemoteImage } from "@/components/ui/remote-image";
import { clsx } from "@/lib/clsx";
import { NETWORK_NAMES, frNumber, pctText, signed } from "@/lib/monthly-summary/build";
import { dayLabel } from "@/lib/monthly-summary/period";
import { boldSegments, type MonthlySummaryData } from "@/lib/monthly-summary/types";
import type { Network } from "@/lib/types";

function Rich({ text }: { text: string }) {
  return (
    <>
      {boldSegments(text).map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-semibold text-white">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

function Delta({ value, note }: { value: number | null; note?: string }) {
  if (value === null || !Number.isFinite(value)) return note ? <span className="text-slate-500">{note}</span> : null;
  const up = value >= 0;
  return (
    <span className="whitespace-nowrap">
      <span className={clsx("font-semibold", up ? "text-emerald-300" : "text-red-300")}>
        <span aria-hidden="true">{up ? "▲" : "▼"}</span> {pctText(value)}
      </span>
      {note && <span className="text-slate-500"> {note}</span>}
    </span>
  );
}

function compact(n: number | null): string {
  return n === null ? "—" : frNumber(n);
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aurora-300">{children}</p>;
}

/** Colonnes par jour : gains au-dessus de la ligne de base, pertes en gris dessous. */
function DayBars({ values, month, unit, highlight, label }: { values: number[]; month: string; unit: string; highlight?: number | null; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pos = Math.max(0, ...values);
  const neg = Math.max(0, ...values.map((v) => -v));
  const total = pos + neg || 1;
  const height = 96;
  const upH = Math.max(8, Math.round((height * pos) / total));
  const downH = neg > 0 ? height - upH : 0;
  const shown = hover ?? null;
  return (
    <div>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="flex items-end gap-[2px]" style={{ height: upH }} role="img" aria-label={label}>
          {values.map((v, i) => (
            <span key={i} aria-hidden="true" onMouseEnter={() => setHover(i)} className="flex h-full flex-1 items-end justify-center">
              {v > 0 && (
                <span
                  className={clsx("block w-full max-w-[24px] rounded-t-[4px] transition-colors", i === highlight ? "bg-aurora-300" : "bg-aurora-400", hover === i && "bg-aurora-300")}
                  style={{ height: Math.max(2, Math.round((upH * v) / (pos || 1))) }}
                />
              )}
            </span>
          ))}
        </div>
        <div className="h-px bg-slate-500/40" />
        {downH > 0 && (
          <div className="flex items-start gap-[2px]" style={{ height: downH }} aria-hidden="true">
            {values.map((v, i) => (
              <span key={i} className="flex flex-1 justify-center" onMouseEnter={() => setHover(i)}>
                {v < 0 && <span className="block w-full max-w-[24px] rounded-b-[4px] bg-slate-500" style={{ height: Math.max(2, Math.round((downH * -v) / neg)) }} />}
              </span>
            ))}
          </div>
        )}
        {shown !== null && (
          <div
            className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-void-950/95 px-2.5 py-1 text-xs text-white shadow-lg"
            style={{ left: `${((shown + 0.5) / values.length) * 100}%` }}
          >
            {dayLabel(month, shown)} · <strong>{signed(values[shown]).replace(/^\+/, unit === "vues" ? "" : "+")}</strong> {unit}
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{dayLabel(month, 0)}</span>
        <span>{dayLabel(month, 14)}</span>
        <span>{dayLabel(month, values.length - 1)}</span>
      </div>
      <details className="mt-2 text-xs text-slate-400">
        <summary className="cursor-pointer text-slate-400 hover:text-white">Voir les chiffres par jour</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 font-medium">Jour</th>
              <th className="py-1 text-right font-medium">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={i} className="border-t border-white/[0.06]">
                <td className="py-1">{dayLabel(month, i)}</td>
                <td className="py-1 text-right tabular-nums text-slate-200">{unit === "vues" ? frNumber(v) : signed(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** « 1 jour », « 3 jours » (0 et 1 au singulier, comme en français). */
function plural(n: number, one: string, many: string): string {
  return `${frNumber(n)} ${n > 1 ? many : one}`;
}

function AccountName({ network, name }: { network: string; name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* Téléphone : le logo seul, pour laisser la place au nom du compte. */}
      <span className="hidden sm:inline-flex">
        <NetworkBadge network={network as Network} size="sm" />
      </span>
      <span className="inline-flex sm:hidden">
        <NetworkTile network={network as Network} size={18} />
        <span className="sr-only">{NETWORK_NAMES[network] ?? network}</span>
      </span>
      <span className="truncate text-slate-300">{name}</span>
    </span>
  );
}

function Kpi({ label, value, sub, delta }: { label: string; value: string; sub: string; delta: React.ReactNode }) {
  return (
    <GlassCard hover={false} className="p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 whitespace-nowrap font-display text-3xl font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
      <p className="mt-2 text-xs">{delta}</p>
    </GlassCard>
  );
}

export function MonthlySummaryView({ data, inProgress }: { data: MonthlySummaryData; inProgress: boolean }) {
  const d = data;
  const vs = d.firstReport ? undefined : `vs ${d.previousName}`;
  const f = d.followers;
  const v = d.views;
  const it = d.interactions;
  const pub = d.publications;
  const gainPct = f.gain !== null && f.prevGain !== null && f.prevGain > 0 && f.gain > 0 ? ((f.gain - f.prevGain) / f.prevGain) * 100 : null;
  const active = new Set(pub.activeDays);

  return (
    <div className="space-y-5">
      {inProgress && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-2.5 text-sm text-amber-100">
          Mois en cours : chiffres arrêtés à aujourd&apos;hui. Le bilan complet part par e-mail le 3 du mois prochain.
        </p>
      )}

      {d.essentials.length > 0 && (
        <div className="rounded-2xl border border-aurora-400/25 bg-aurora-400/[0.07] p-5">
          <Kicker>L&apos;essentiel</Kicker>
          <p className="mt-2 text-base leading-relaxed text-slate-200">
            {d.essentials.map((e, i) => (
              <span key={i}>
                <Rich text={e} />{" "}
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Abonnés" value={compact(f.total)} sub={f.gain !== null ? `${signed(f.gain)} ce mois` : "pas encore de relevé"} delta={gainPct !== null ? <Delta value={gainPct} note={`de gain ${vs ?? ""}`} /> : null} />
        <Kpi label="Vues" value={compact(v.total)} sub={v.total !== null ? plural(v.rows.filter((r) => r.total !== null).length, "compte", "comptes") : "non communiquées"} delta={<Delta value={v.pct} note={vs} />} />
        <Kpi label="Interactions" value={compact(it.total)} sub="j'aime, commentaires, partages, enregistrements" delta={<Delta value={it.pct} note={vs} />} />
        <Kpi
          label="Publications"
          value={String(pub.count)}
          sub={`${plural(pub.online, "mise en ligne", "mises en ligne")} · ${plural(pub.activeDays.length, "jour actif", "jours actifs")}`}
          delta={
            pub.prevCount !== null ? (
              <span className={clsx("font-semibold", pub.count >= pub.prevCount ? "text-emerald-300" : "text-red-300")}>
                {pub.count === pub.prevCount ? "= autant" : `${pub.count > pub.prevCount ? "▲" : "▼"} ${Math.abs(pub.count - pub.prevCount)} de ${pub.count > pub.prevCount ? "plus" : "moins"}`}
                <span className="font-normal text-slate-500"> {vs}</span>
              </span>
            ) : null
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {f.rows.length > 0 && (
          <GlassCard hover={false}>
            <Kicker>Abonnés</Kicker>
            <h2 className="mt-1 font-display text-lg font-semibold text-white">{f.gain !== null ? `${signed(f.gain)} abonnés` : `${compact(f.total)} abonnés`}</h2>
            <p className="mt-1 text-sm text-slate-400">
              Gagnés chaque jour{f.daily?.some((x) => x < 0) ? " (en gris : jours de pertes)" : ""}.
              {f.bestDay && (
                <>
                  {" "}
                  Meilleur jour : <strong className="text-white">{f.bestDay.label}, {signed(f.bestDay.gain)}</strong>.
                </>
              )}
            </p>
            {f.daily && (
              <div className="mt-4">
                <DayBars values={f.daily} month={d.month} unit="abonnés" highlight={f.bestDay?.dayIndex ?? null} label={`Abonnés gagnés chaque jour de ${d.monthLabel}`} />
              </div>
            )}
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">Compte</th>
                  <th className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Abonnés</th>
                  <th className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Gagnés</th>
                  <th className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Évolution</th>
                </tr>
              </thead>
              <tbody>
                {f.rows.map((r) => (
                  <tr key={r.accountId} className="border-t border-white/[0.06]">
                    <td className="w-full max-w-0 py-2 pr-2">
                      <AccountName network={r.network} name={r.name} />
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold tabular-nums text-white">{frNumber(r.total)}</td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-slate-300">{r.gain !== null ? signed(r.gain) : "—"}</td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right text-xs">
                      <Delta value={r.pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}

        {v.total !== null && (
          <GlassCard hover={false}>
            <Kicker>Vues</Kicker>
            <h2 className="mt-1 font-display text-lg font-semibold text-white">{frNumber(v.total)} vues</h2>
            <p className="mt-1 text-sm text-slate-400">
              {v.daily ? `Vues par jour sur ${v.dailyNetworks.map((n) => NETWORK_NAMES[n] ?? n).join(", ")}. ` : ""}
              {v.notes.join(" ")}
            </p>
            {v.daily && (
              <div className="mt-4">
                <DayBars values={v.daily} month={d.month} unit="vues" label={`Vues par jour en ${d.monthLabel}`} />
              </div>
            )}
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">Compte</th>
                  <th className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Vues</th>
                  <th className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Part</th>
                  <th className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Évolution</th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.accountId} className="border-t border-white/[0.06]">
                    <td className="w-full max-w-0 py-2 pr-2">
                      <AccountName network={r.network} name={r.name} />
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold tabular-nums text-white">{compact(r.total)}</td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-slate-300">{r.share !== null ? `${Math.round(r.share)} %` : "—"}</td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right text-xs">
                      <Delta value={r.pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}

        {it.total !== null && (
          <GlassCard hover={false}>
            <Kicker>Engagement</Kicker>
            <h2 className="mt-1 font-display text-lg font-semibold text-white">{frNumber(it.total)} interactions</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  [it.likes, "J'aime"],
                  [it.comments, "Commentaires"],
                  [it.shares, "Partages"],
                  [it.saves, "Enregistrements"]
                ] as const
              ).map(([value, label]) => (
                <div key={label} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                  <p className="whitespace-nowrap font-display text-xl font-semibold text-white">{compact(value)}</p>
                  <p className="text-[11px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            {it.note && (
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                <Rich text={it.note} />
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">Sur les publications mises en ligne dans le mois, telles que les réseaux les donnent.</p>
          </GlassCard>
        )}

        {pub.online > 0 && (
          <GlassCard hover={false}>
            <Kicker>Publications</Kicker>
            <h2 className="mt-1 font-display text-lg font-semibold text-white">
              {pub.count} publication{pub.count > 1 ? "s" : ""}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Vos jours de publication : <strong className="text-white">{pub.activeDays.length} sur {d.days}</strong>
              {pub.prevActiveDays !== null ? ` (${pub.prevActiveDays} en ${d.previousName})` : ""}.
            </p>
            <div className="mt-3 flex gap-[3px]" role="img" aria-label={`Jours avec une publication : ${pub.activeDays.map((x) => x + 1).join(", ")}`}>
              {Array.from({ length: d.days }, (_, i) => (
                <span key={i} title={dayLabel(d.month, i)} className={clsx("h-5 flex-1 rounded-[4px]", active.has(i) ? "bg-aurora-400" : "bg-slate-500/20")} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>{dayLabel(d.month, 0)}</span>
              <span>{dayLabel(d.month, d.days - 1)}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              {[pub.videos ? `${pub.videos} vidéo${pub.videos > 1 ? "s" : ""}` : "", pub.photos ? `${pub.photos} photo${pub.photos > 1 ? "s" : ""}` : "", pub.others ? `${pub.others} autre${pub.others > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ")}
              {" · "}
              {pub.perNetwork.map((x) => `${NETWORK_NAMES[x.network] ?? x.network} ${x.count}`).join(", ")}
              {pub.online > pub.count ? ". Une publication sur plusieurs réseaux compte une fois." : "."}
            </p>
          </GlassCard>
        )}
      </div>

      {d.top.length > 0 && (
        <GlassCard hover={false}>
          <Kicker>Top du mois</Kicker>
          <h2 className="mt-1 font-display text-lg font-semibold text-white">{d.top.length > 1 ? `Vos ${d.top.length} meilleures publications` : "Votre meilleure publication"}</h2>
          <p className="mt-1 text-xs text-slate-500">Publications du mois classées par vues, comptées depuis leur mise en ligne.</p>
          <ol className="mt-3 divide-y divide-white/[0.06]">
            {d.top.map((t, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <span className="w-5 shrink-0 font-display text-lg font-bold text-aurora-300">{i + 1}</span>
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
                  {t.thumbnailUrl ? <RemoteImage src={t.thumbnailUrl} className="h-full w-full" sizes="56px" /> : <span className="flex h-full w-full items-center justify-center"><NetworkTile network={t.network as Network} size={26} /></span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    <NetworkBadge network={t.network as Network} size="sm" /> {t.dayLabel}
                    {t.views !== null && <span><strong className="text-slate-200">{frNumber(t.views)}</strong> vues</span>}
                    {t.interactions !== null && <span><strong className="text-slate-200">{frNumber(t.interactions)}</strong> interactions</span>}
                    {t.rate !== null && <span>{(Math.round(t.rate * 10) / 10).toLocaleString("fr-FR")} % d&apos;engagement</span>}
                  </p>
                </div>
                {t.url && (
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-aurora-300 hover:text-white">
                    Voir <span aria-hidden="true">↗</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {d.insights.length > 0 && (
          <GlassCard hover={false}>
            <Kicker>À retenir</Kicker>
            <h2 className="mt-1 font-display text-lg font-semibold text-white">Ce qui a marché</h2>
            <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-300">
              {d.insights.map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="font-semibold text-aurora-300">{i + 1}.</span>
                  <span>
                    <Rich text={t} />
                  </span>
                </li>
              ))}
            </ol>
          </GlassCard>
        )}
        {(d.community || d.bio || d.reussites) && (
          <GlassCard hover={false}>
            <Kicker>Autour de vos publications</Kicker>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {d.community && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                  <p className="font-display text-2xl font-semibold text-white">{frNumber(d.community.comments)}</p>
                  <p className="text-xs text-slate-400">commentaires reçus dans Nebula</p>
                  <p className="mt-1 text-xs text-slate-300">
                    {d.community.replies > 0
                      ? `${plural(d.community.replies, "réponse", "réponses")} de votre part (${Math.round((d.community.replies / Math.max(1, d.community.comments)) * 100)} %)`
                      : "Répondez-leur depuis la page Commentaires."}
                  </p>
                </div>
              )}
              {d.bio && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                  <p className="font-display text-2xl font-semibold text-white">{frNumber(d.bio.delta ?? d.bio.total)}</p>
                  <p className="text-xs text-slate-400">clics sur votre page bio</p>
                  <p className="mt-1 text-xs text-slate-300">{d.bio.delta !== null ? `depuis le dernier bilan · ${frNumber(d.bio.total)} au total` : "au total, depuis sa création"}</p>
                </div>
              )}
            </div>
            {d.reussites && (
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                <strong className="text-white">Réussites :</strong> +{frNumber(d.reussites.xp)} XP
                {d.reussites.missions ? ` · ${plural(d.reussites.missions, "mission réussie", "missions réussies")}` : ""}
                {d.reussites.badges.length ? ` · ${d.reussites.badges.map((b) => `« ${b} »`).join(", ")}` : ""}
                {d.reussites.nextRank && d.reussites.xpToNext ? `. Encore ${frNumber(d.reussites.xpToNext)} XP pour passer ${d.reussites.nextRank}.` : "."}
              </p>
            )}
          </GlassCard>
        )}
      </div>

      <GlassCard hover={false} className="border-aurora-400/30">
        <Kicker>{d.nextMonth.title}</Kicker>
        <h2 className="mt-1 font-display text-lg font-semibold text-white">
          {d.nextMonth.scheduled ? plural(d.nextMonth.scheduled, "publication déjà programmée", "publications déjà programmées") : "Rien de programmé pour l'instant"}
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          {d.nextMonth.scheduled ? `${plural(d.nextMonth.days, "jour couvert", "jours couverts")} sur ${d.nextMonth.daysInMonth}. ` : ""}
          {d.nextMonth.missing > 0
            ? `Pour garder votre rythme (${pub.activeDays.length} jours de publication), il manque ${plural(d.nextMonth.missing, "jour", "jours")}${d.nextMonth.suggestion ? `, ${d.nextMonth.suggestion}` : ""}.`
            : pub.activeDays.length > 0
              ? "Votre rythme est déjà tenu : bravo."
              : ""}
        </p>
        <Link href="/calendar" className="mt-3 inline-flex text-sm font-medium text-aurora-300 hover:text-white">
          Ouvrir le calendrier <span aria-hidden="true">&nbsp;→</span>
        </Link>
      </GlassCard>
    </div>
  );
}
