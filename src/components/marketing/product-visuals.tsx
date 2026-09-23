// Visuels produit de la page d'accueil : des COMPOSITIONS de l'interface
// réelle, dessinées en HTML/CSS avec les mêmes composants et les mêmes
// tokens (glass-panel, couleurs officielles des réseaux, typographie) que
// l'application — pas des captures figées qui vieillissent, pas des images
// externes à charger. Choix de Lucas (22/09/2026) : « des compositions
// fidèles générées depuis le code ».
//
// Les contenus affichés (noms de marque, chiffres, publications) sont des
// exemples de démonstration, clairement signalés comme tels par l'étiquette
// « Aperçu » et jamais présentés comme des données réelles. Composants
// serveur, sans état ni animation JS : le hero s'affiche complet dès le
// premier rendu HTML.
import { clsx } from "@/lib/clsx";
import { NETWORK_META, type Network } from "@/lib/types";
import { NetworkLogo } from "@/components/ui/network-badge";
import { IconCalendar, IconChart, IconHome, IconReport, IconUpload, IconUsers } from "@/components/dashboard/icons";
import { NebulaIcon } from "@/components/dashboard/nebula-brandmark";

// --- Cadre "fenêtre" partagé -------------------------------------------------

function Frame({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        "glass-panel relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.75)]",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function Chip({ network, children }: { network: Network; children: React.ReactNode }) {
  const meta = NETWORK_META[network];
  return (
    <div
      className="flex items-center gap-1 truncate rounded-md px-1.5 py-[3px] text-[10px] font-medium text-slate-100"
      style={{ background: `${meta.color}26`, boxShadow: `inset 2px 0 0 ${meta.color}` }}
    >
      <NetworkLogo network={network} className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

// --- 1. Tableau de bord : calendrier + statistiques ---------------------------

const WEEK = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
// Deux semaines : la grille remplit la hauteur de la carte au lieu de
// laisser un vide sous une seule ligne de jours.
const CALENDAR: { day: number; posts: { network: Network; label: string }[] }[] = [
  { day: 14, posts: [{ network: "INSTAGRAM", label: "Atelier" }] },
  { day: 15, posts: [] },
  { day: 16, posts: [{ network: "TIKTOK", label: "Tuto 30 s" }, { network: "YOUTUBE", label: "Vlog #12" }] },
  { day: 17, posts: [{ network: "FACEBOOK", label: "Offre" }] },
  { day: 18, posts: [{ network: "INSTAGRAM", label: "Avis" }] },
  { day: 19, posts: [] },
  { day: 20, posts: [{ network: "YOUTUBE", label: "Live" }] },
  { day: 21, posts: [{ network: "TIKTOK", label: "Trend" }] },
  { day: 22, posts: [] },
  { day: 23, posts: [{ network: "INSTAGRAM", label: "Reel" }, { network: "FACEBOOK", label: "Reel" }] },
  { day: 24, posts: [] },
  { day: 25, posts: [{ network: "YOUTUBE", label: "Short" }] },
  { day: 26, posts: [{ network: "INSTAGRAM", label: "Story" }] },
  { day: 27, posts: [] }
];

const SPARKLINE = [12, 14, 13, 17, 19, 18, 22, 24, 23, 27, 30, 29, 33];

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 160;
  const h = 44;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${pts.join(" L")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={clsx("h-11 w-full", className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id="pv-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--c-aurora-400))" stopOpacity="0.35" />
          <stop offset="1" stopColor="rgb(var(--c-aurora-400))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#pv-spark-fill)" />
      <path d={path} fill="none" stroke="rgb(var(--c-aurora-400))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS = [
  { icon: IconHome, label: "Vue d'ensemble", active: true },
  { icon: IconCalendar, label: "Calendrier" },
  { icon: IconUpload, label: "Publier" },
  { icon: IconChart, label: "Analytics" },
  { icon: IconReport, label: "Rapports" }
];

export function DashboardVisual({ className }: { className?: string }) {
  return (
    <Frame label="Aperçu" className={className}>
      {/* Barre du haut de l'application */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-3.5 py-2">
        <NebulaIcon size={18} />
        <div className="hidden items-center gap-0.5 sm:flex">
          {NAV_ITEMS.map((item) => (
            <span
              key={item.label}
              className={clsx(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[10px]",
                item.active ? "bg-nebula-700/50 text-white" : "text-slate-500"
              )}
            >
              <item.icon className="h-3 w-3" />
              {item.label}
            </span>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-200">
          <IconUsers className="h-3 w-3 text-slate-400" />
          Nova
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-1 text-[8px] font-semibold uppercase text-amber-300">
            Agence
          </span>
        </span>
      </div>

      <div className="grid gap-3 p-3.5 lg:grid-cols-[1.5fr_1fr]">
        {/* Calendrier sur deux semaines — la grille s'étire pour remplir
            la même hauteur que la colonne de statistiques */}
        <div className="flex flex-col">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-white">14 – 27 octobre</span>
            <span className="rounded-md border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-[9px] text-slate-400">
              2 semaines
            </span>
          </div>
          <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1">
            {CALENDAR.map((cell, i) => (
              <div key={cell.day} className="min-h-[72px] rounded-lg border border-white/[0.06] bg-void-900/60 p-1">
                <div className="mb-1 flex items-baseline justify-between px-0.5">
                  <span className="text-[8px] uppercase text-slate-500">{WEEK[i % 7]}</span>
                  <span className={clsx("text-[10px]", i === 2 ? "font-semibold text-aurora-300" : "text-slate-300")}>{cell.day}</span>
                </div>
                <div className="space-y-1">
                  {cell.posts.map((p) => (
                    <Chip key={p.label} network={p.network}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 lg:col-span-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Abonnés</div>
            <div className="mt-1 font-display text-xl font-medium text-white">24 380</div>
            <span className="mt-1 hidden whitespace-nowrap rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400 sm:inline-flex">
              ▲ 1 240 <span className="ml-1 text-slate-400">vs 30 j</span>
            </span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Engagement</div>
            <div className="mt-1 font-display text-xl font-medium text-white">
              4,8<span className="text-sm text-slate-400"> %</span>
            </div>
            <span className="mt-1 hidden whitespace-nowrap rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400 sm:inline-flex">▲ 0,6 pt</span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[9px] uppercase tracking-wider text-slate-400">Portée</span>
              <span className="whitespace-nowrap text-[10px] text-white">128 k</span>
            </div>
            <Sparkline values={SPARKLINE} className="mt-1" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

// --- 2. Composer : un post, tous les réseaux ----------------------------------

const TARGETS: { network: Network; account: string; on: boolean }[] = [
  { network: "INSTAGRAM", account: "@nova.studio", on: true },
  { network: "TIKTOK", account: "@nova.studio", on: true },
  { network: "YOUTUBE", account: "Nova Studio", on: true },
  { network: "FACEBOOK", account: "Nova Studio", on: false }
];

export function ComposerVisual({ className }: { className?: string }) {
  return (
    <Frame label="Aperçu · Publier" className={className}>
      <div className="grid gap-3 p-3.5 sm:grid-cols-[104px_1fr]">
        <div className="flex h-[104px] items-end rounded-lg bg-gradient-to-br from-nebula-600/70 via-accent-violet/50 to-accent-cyan/40 p-2 sm:h-auto">
          <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white">0:42 · 1080×1920</span>
        </div>
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">Titre</div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white">
              Trois erreurs qui ruinent votre rétention
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-500">
              <span>Description</span>
              <span className="normal-case text-aurora-300">✦ Suggérer avec l&apos;IA</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-300">
              On a analysé 40 vidéos pour comprendre où les spectateurs décrochent. Voici ce qui change tout ↓
              <span className="text-aurora-300"> #retention #creation</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.06] px-3.5 py-3">
        <div className="mb-2 text-[9px] uppercase tracking-wider text-slate-500">Réseaux cibles</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {TARGETS.map((t) => {
            const meta = NETWORK_META[t.network];
            return (
              <div
                key={t.network}
                className={clsx(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px]",
                  t.on ? "border-white/15 bg-white/[0.04] text-white" : "border-white/[0.06] text-slate-500"
                )}
              >
                <span
                  className={clsx("flex h-3 w-3 items-center justify-center rounded-[3px] border text-[8px]", t.on ? "border-transparent text-white" : "border-white/20")}
                  style={t.on ? { background: meta.color } : undefined}
                >
                  {t.on ? "✓" : ""}
                </span>
                <NetworkLogo network={t.network} className="h-3 w-3" />
                <span className="truncate">{t.account}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1 text-[10px] text-slate-300">
            <IconCalendar className="h-3 w-3 text-slate-400" /> Jeu. 17 oct. · 18:30
          </span>
          <span className="btn-glow rounded-lg px-3 py-1.5 text-[10px] font-medium text-white">Programmer sur 3 réseaux</span>
        </div>
      </div>
    </Frame>
  );
}

// --- 3. Rapport client -----------------------------------------------------------

const BARS = [38, 52, 44, 61, 58, 73, 69, 84, 80, 92, 88, 100];

export function ReportVisual({ className }: { className?: string }) {
  return (
    <Frame label="Aperçu · Rapport client" className={className}>
      <div className="p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Rapport · 30 derniers jours</div>
            <div className="mt-0.5 font-display text-sm font-semibold text-white">Nova Studio</div>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">
            Envoyé chaque lundi
          </span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[
            ["Abonnés", "+1 240"],
            ["Portée", "128 k"],
            ["Engagement", "4,8 %"],
            ["Publiés", "18"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
              <div className="text-[8px] uppercase tracking-wider text-slate-500">{label}</div>
              <div className="mt-0.5 font-display text-sm font-medium text-white">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex h-16 items-end gap-1">
          {BARS.map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-t-sm bg-gradient-to-t from-nebula-600/70 to-aurora-400/80"
              style={{ height: `${v}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
          <span>Croissance des abonnés</span>
          <span>Propulsé par Nebula</span>
        </div>
      </div>
    </Frame>
  );
}
