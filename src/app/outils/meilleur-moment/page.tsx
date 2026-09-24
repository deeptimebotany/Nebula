"use client";

// Meilleur moment pour publier (brief growth, lot G4.c) — tableau STATIQUE
// d'ordres de grandeur par réseau, daté et sourcé, converti dans le fuseau
// choisi. Sans IA : n'entame pas le quota Gemini.
import { useMemo, useState } from "react";
import { ToolPage } from "@/components/tools/tool-page";
import { GlassCard } from "@/components/ui/glass-card";
import { IconClock } from "@/components/dashboard/icons";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";

// Créneaux (heure de Paris) qui ressortent le plus souvent des études
// publiques annuelles (Sprout Social, Hootsuite, Buffer) relevées en
// septembre 2026 — moyennes générales, toutes audiences confondues.
const SOURCE_DATE = "septembre 2026";
// Outil public : seulement les réseaux pour lesquels on a des études
// publiques sourcées.
type ToolNetwork = Extract<Network, "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | "YOUTUBE">;
const SLOTS: Record<ToolNetwork, { days: string; hours: number[]; note: string }[]> = {
  INSTAGRAM: [
    { days: "Lundi – vendredi", hours: [9, 12, 18], note: "Pause du matin, pause déjeuner, sortie du travail." },
    { days: "Samedi – dimanche", hours: [10, 19], note: "Matinées plus calmes, soirées engagées." }
  ],
  TIKTOK: [
    { days: "Mardi – jeudi", hours: [7, 12, 19, 22], note: "Le soir concentre le plus de temps de visionnage." },
    { days: "Vendredi – dimanche", hours: [11, 20], note: "Les week-ends favorisent les formats longs." }
  ],
  YOUTUBE: [
    { days: "Jeudi – samedi", hours: [15, 18], note: "Publier 2–3 h avant le pic de visionnage du soir." },
    { days: "Dimanche", hours: [11, 17], note: "Le dimanche reste le jour le plus regardé." }
  ],
  FACEBOOK: [
    { days: "Mardi – jeudi", hours: [9, 13], note: "Le matin en semaine, avant la pause déjeuner." },
    { days: "Samedi", hours: [12], note: "Le week-end, un seul créneau à la mi-journée." }
  ]
};

const TIMEZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "America/Montreal", "Africa/Casablanca", "Indian/Reunion", "America/Martinique", "Pacific/Noumea"];

function shiftHour(hour: number, fromTz: string, toTz: string): number {
  // Décalage entre deux fuseaux à la date du jour (heures entières).
  const now = new Date();
  const get = (tz: string) => Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: tz }).format(now));
  const diff = get(toTz) - get(fromTz);
  return ((hour + diff) % 24 + 24) % 24;
}

const FAQ = [
  { q: "Ces horaires sont-ils valables pour mon compte ?", a: "Ce sont des moyennes générales, toutes audiences confondues, relevées à une date donnée. Votre audience a ses propres habitudes : un compte B2B et un compte lifestyle n'ont pas les mêmes pics. Vos propres statistiques valent toujours mieux qu'une moyenne." },
  { q: "Comment connaître mes vrais meilleurs créneaux ?", a: "En comparant les performances de vos publications selon leur heure de départ. Nebula récupère les vrais chiffres de chaque publication (onglet Engagements) et ses horaires de publication : vous voyez vite ce qui marche pour VOTRE audience." },
  { q: "Faut-il publier à l'heure exacte ?", a: "Non. Publier 30 à 60 minutes avant le pic laisse le temps à l'algorithme de tester la publication auprès d'un premier cercle. La régularité compte plus que la minute près." }
];

export default function MeilleurMomentPage() {
  const [network, setNetwork] = useState<ToolNetwork>("INSTAGRAM");
  const [tz, setTz] = useState("Europe/Paris");
  const rows = useMemo(() => SLOTS[network].map((s) => ({ ...s, hours: s.hours.map((h) => shiftHour(h, "Europe/Paris", tz)) })), [network, tz]);

  return (
    <ToolPage
      icon={<IconClock className="h-6 w-6" />}
      title="Meilleur moment pour publier sur les réseaux sociaux"
      intro={
        <p>
          Il n&apos;existe pas d&apos;heure magique, mais il existe des créneaux où votre audience est plus souvent disponible. Ce tableau rassemble les ordres de grandeur qui reviennent le plus dans les études publiques, réseau par réseau, convertis dans votre fuseau horaire. Servez-vous-en comme point de départ, puis laissez vos propres chiffres trancher : un compte qui parle à des parents n&apos;a pas les mêmes pics qu&apos;un compte de gaming. Nebula programme vos publications à l&apos;heure choisie et vous montre ce que chacune a déclenché.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/taux-engagement", title: "Calculateur de taux d'engagement" },
        { href: "/outils/legendes", title: "Générateur de légendes" },
        { href: "/outils/titre-youtube", title: "Testeur de titre YouTube" }
      ]}
      ctaLabel="Mesurez vos vrais meilleurs créneaux"
    >
      <GlassCard hover={false}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label className="block text-xs uppercase tracking-wide text-slate-500">Réseau</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {NETWORKS.filter((n): n is ToolNetwork => n === "INSTAGRAM" || n === "FACEBOOK" || n === "TIKTOK" || n === "YOUTUBE").map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNetwork(n)}
                  aria-pressed={network === n}
                  className={clsx("rounded-xl border-2 px-3.5 py-2 text-sm font-medium transition", network === n ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25")}
                >
                  {NETWORK_META[n].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="mm-tz" className="block text-xs uppercase tracking-wide text-slate-500">Fuseau</label>
            <select id="mm-tz" value={tz} onChange={(e) => setTz(e.target.value)} className="mt-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60">
              {TIMEZONES.map((t) => (
                <option key={t} value={t} className="bg-void-900">
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Jours</th>
              <th className="py-2 font-medium">Créneaux</th>
              <th className="hidden py-2 font-medium sm:table-cell">Pourquoi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.days} className="border-t border-white/[0.06] align-top">
                <td className="py-3 text-slate-200">{r.days}</td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {r.hours.map((h) => (
                      <span key={h} className="rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2 py-0.5 text-xs text-aurora-100">{String(h).padStart(2, "0")} h</span>
                    ))}
                  </div>
                </td>
                <td className="hidden py-3 text-xs text-slate-400 sm:table-cell">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-[11px] text-slate-500">Moyennes générales relevées en {SOURCE_DATE} (études publiques Sprout Social, Hootsuite, Buffer), heures converties depuis Paris — vos propres statistiques Nebula font mieux.</p>
      </GlassCard>
    </ToolPage>
  );
}
