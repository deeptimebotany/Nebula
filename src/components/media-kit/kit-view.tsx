// Media kit (produit n°10) : le kit tel que le voient les marques et les
// sponsors — page publique /kit/[slug], aperçu de l'éditeur (/media-kit) et
// version PDF (impression). Sans état ni appel réseau : il affiche des
// données déjà calculées (src/lib/media-kit), utilisable côté serveur comme
// dans l'éditeur.
//
// Tous les chiffres viennent des relevés de Nebula (API officielles) ; le
// créateur n'écrit que le texte (accroche, présentation, offres, contact).
import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { NetworkBadge, NetworkTile } from "@/components/ui/network-badge";
import { RemoteImage } from "@/components/ui/remote-image";
import { clsx } from "@/lib/clsx";
import { formatCompact } from "@/lib/engagement-metrics";
import { NETWORK_META } from "@/lib/types";
import type { KitAccount, KitPost, PublicKitData } from "@/lib/media-kit/types";

const LONG_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

const pct = (x: number) => `${x.toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(x) < 1 ? 2 : 1 })} %`;
const exact = (n: number | null) => (n === null ? undefined : n.toLocaleString("fr-FR"));
const perMonth = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function Tile({ label, value, hint, title }: { label: string; value: string; hint?: string; title?: string }) {
  return (
    <GlassCard hover={false} className="break-inside-avoid p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums text-white" title={title}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </GlassCard>
  );
}

function Row({ label, value, title, tone }: { label: string; value: string; title?: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-slate-400">{label}</dt>
      <dd className={clsx("font-medium tabular-nums", tone === "up" ? "text-emerald-300" : tone === "down" ? "text-red-300" : "text-white")} title={title}>
        {value}
      </dd>
    </div>
  );
}

function AccountCard({ account }: { account: KitAccount }) {
  const growth = account.growth;
  return (
    <GlassCard hover={false} className="break-inside-avoid p-4">
      <div className="flex items-center gap-3">
        <NetworkTile network={account.network} size={36} />
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{account.name}</p>
          <p className="truncate text-xs text-slate-400">
            {account.profileUrl ? (
              <a href={account.profileUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-500 underline-offset-2 hover:decoration-current">
                {account.handle ?? `Voir sur ${NETWORK_META[account.network].label}`}
              </a>
            ) : (
              (account.handle ?? NETWORK_META[account.network].label)
            )}
          </p>
        </div>
      </div>
      <dl className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
        <Row label="Abonnés" value={formatCompact(account.followers)} title={exact(account.followers)} />
        {growth && (
          <Row
            label={`Évolution sur ${growth.days} j`}
            value={`${growth.delta >= 0 ? "+" : "−"}${formatCompact(Math.abs(growth.delta))}${growth.pct !== null ? ` (${growth.pct >= 0 ? "+" : "−"}${pct(Math.abs(growth.pct))})` : ""}`}
            tone={growth.delta > 0 ? "up" : growth.delta < 0 ? "down" : undefined}
          />
        )}
        {account.medianViews !== null && <Row label="Vues par publication" value={formatCompact(account.medianViews)} title={`Médiane des 90 derniers jours : ${exact(account.medianViews)}`} />}
        {account.engagementRate !== null && <Row label="Taux d'engagement" value={pct(account.engagementRate)} />}
        {account.postsPerMonth !== null && <Row label="Publications par mois" value={perMonth(account.postsPerMonth)} />}
      </dl>
    </GlassCard>
  );
}

function PostCard({ post }: { post: KitPost }) {
  const body = (
    <>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-white/[0.04]">
        {post.thumbnailUrl ? (
          <RemoteImage
            src={post.thumbnailUrl}
            className="absolute inset-0 h-full w-full"
            sizes="(max-width: 640px) 100vw, 300px"
            fallback={<span className="flex h-full w-full items-center justify-center"><NetworkTile network={post.network} size={32} /></span>}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <NetworkTile network={post.network} size={32} />
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <NetworkBadge network={post.network} size="sm" />
        {post.publishedAt && <span className="text-[11px] text-slate-500">{SHORT_DATE.format(new Date(post.publishedAt))}</span>}
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium text-white">{post.title}</p>
      <p className="mt-1 text-xs tabular-nums text-slate-400">
        {post.views !== null && <span title={exact(post.views)}>{formatCompact(post.views)} vues · </span>}
        <span title={exact(post.interactions)}>{formatCompact(post.interactions)} interactions</span>
      </p>
    </>
  );
  return (
    <GlassCard hover={false} className="break-inside-avoid p-3">
      {post.permalink ? (
        <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aurora-400/60">
          {body}
        </a>
      ) : (
        body
      )}
    </GlassCard>
  );
}

function SectionTitle({ children, nested }: { children: ReactNode; nested?: boolean }) {
  const Tag = nested ? "h3" : "h2";
  return <Tag className="font-display text-lg font-semibold text-white">{children}</Tag>;
}

/**
 * `nested` : le kit est affiché DANS une autre page (aperçu de l'éditeur,
 * exemple d'une landing) — le nom passe en h2 et les sections en h3.
 */
export function KitView({ data, actions, className, nested = false }: { data: PublicKitData; actions?: ReactNode; className?: string; nested?: boolean }) {
  const { stats } = data;
  const Title = nested ? "h2" : "h1";
  const Sub = nested ? "h3" : "h2";
  const networks = Array.from(new Set(stats.accounts.map((a) => a.network)));
  const t = stats.totals;
  return (
    <article className={clsx("kit-print space-y-8", className)}>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            {data.logoUrl ? (
              <RemoteImage src={data.logoUrl} alt="" className="h-full w-full" sizes="72px" priority />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-2xl font-semibold text-white">{data.brandName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aurora-300">Media kit</p>
            <Title className="mt-1 break-words font-display text-2xl font-semibold text-white sm:text-3xl">{data.brandName}</Title>
            {data.headline && <p className="mt-1 text-sm text-slate-300 sm:text-base">{data.headline}</p>}
            {networks.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="sr-only">Présent sur {networks.map((n) => NETWORK_META[n].label).join(", ")}</span>
                {networks.map((n) => (
                  <span key={n} aria-hidden="true">
                    <NetworkTile network={n} size={20} />
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2 print:hidden">{actions}</div>}
      </header>

      <section aria-label="Chiffres clés" className={clsx("grid grid-cols-2 gap-3", nested ? "2xl:grid-cols-4" : "lg:grid-cols-4")}>
        <Tile label="Audience totale" value={formatCompact(t.audience)} title={exact(t.audience)} hint={`${t.accounts} compte${t.accounts > 1 ? "s" : ""}`} />
        <Tile label="Vues sur 90 jours" value={formatCompact(t.views90)} title={exact(t.views90)} hint={t.views90 === null ? "Pas encore de relevé" : "Toutes publications"} />
        <Tile label="Engagement moyen" value={t.engagementRate === null ? "—" : pct(t.engagementRate)} hint="Interactions ÷ abonnés" />
        <Tile label="Publications" value={t.postsPerMonth === null ? "—" : perMonth(t.postsPerMonth)} hint="par mois, tous réseaux" />
      </section>

      {data.about && (
        <section className="break-inside-avoid space-y-2">
          <SectionTitle nested={nested}>À propos</SectionTitle>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300 sm:text-base">{data.about}</p>
        </section>
      )}

      {stats.accounts.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle nested={nested}>Comptes</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {stats.accounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-slate-400">Aucun compte affiché pour le moment.</p>
      )}

      {stats.posts.length > 0 && (
        <section className="space-y-3">
          <SectionTitle nested={nested}>{stats.postsChosen ? "Publications à la une" : "Publications qui ont le mieux marché"}</SectionTitle>
          <div className={clsx("grid grid-cols-1 gap-3 sm:grid-cols-2", nested ? "2xl:grid-cols-3" : "lg:grid-cols-3")}>
            {stats.posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {data.offers.length > 0 && (
        <section className="break-inside-avoid space-y-3">
          <SectionTitle nested={nested}>Collaborations</SectionTitle>
          <div className="glass-panel rounded-2xl">
            <ul className="divide-y divide-white/[0.06]">
              {data.offers.map((o, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
                  <span className="text-slate-200">{o.label}</span>
                  {o.price && <span className="shrink-0 font-medium tabular-nums text-white">{o.price}</span>}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500">Tarifs indicatifs, à ajuster selon le projet.</p>
        </section>
      )}

      {data.contactEmail && (
        <section className="break-inside-avoid rounded-2xl border border-aurora-400/25 bg-aurora-400/[0.05] p-5">
          <Sub className="font-display text-lg font-semibold text-white">Travailler ensemble</Sub>
          <p className="mt-1 text-sm text-slate-300">
            Écrivez à{" "}
            <a href={`mailto:${data.contactEmail}`} className="font-medium text-white underline decoration-slate-500 underline-offset-2 hover:decoration-current">
              {data.contactEmail}
            </a>
          </p>
        </section>
      )}

      <section className="break-inside-avoid rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-slate-400">
        <Sub className="font-semibold text-slate-300">D&apos;où viennent ces chiffres</Sub>
        <p className="mt-1">
          Relevés automatiquement par Nebula auprès des API officielles des réseaux
          {stats.updatedAt ? `, dernière mise à jour le ${LONG_DATE.format(new Date(stats.updatedAt))}` : ""}. Le créateur choisit les comptes et les publications affichés, mais ne peut pas modifier les chiffres. Engagement : interactions moyennes par publication (j&apos;aime, commentaires, partages) rapportées aux abonnés, sur 90 jours ; vues par publication : médiane des 90 derniers jours.
        </p>
      </section>
    </article>
  );
}
