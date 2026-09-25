"use client";

// Calculateur de taux d'engagement (brief growth, lot G4.c) — SANS IA :
// n'entame pas le quota Gemini. Repères indicatifs datés et sourcés,
// libellés « ordres de grandeur ».
import { useEffect, useMemo, useState } from "react";
import { markToolExplored } from "@/lib/tools-explored";
import { ToolPage } from "@/components/tools/tool-page";
import { GlassCard } from "@/components/ui/glass-card";
import { IconChart } from "@/components/dashboard/icons";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";

// Ordres de grandeur du taux d'engagement (interactions / abonnés, par
// publication), relevés en septembre 2026 à partir des études publiques
// annuelles des éditeurs d'outils d'analyse (Socialinsider, Rival IQ,
// Hootsuite). Ce sont des MOYENNES générales : vos propres statistiques
// dans Nebula font toujours foi.
// Outil public : seulement les réseaux pour lesquels on a des études
// publiques sourcées.
type ToolNetwork = Extract<Network, "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | "YOUTUBE">;
const BENCHMARKS: Record<ToolNetwork, { low: number; median: number; high: number }> = {
  INSTAGRAM: { low: 0.5, median: 1.5, high: 4 },
  TIKTOK: { low: 2, median: 4.5, high: 9 },
  YOUTUBE: { low: 1, median: 3, high: 6 },
  FACEBOOK: { low: 0.1, median: 0.5, high: 1.5 }
};
const BENCHMARK_DATE = "septembre 2026";

const FAQ = [
  { q: "Comment est calculé le taux d'engagement ?", a: "Interactions moyennes par publication (j'aime + commentaires + partages, divisés par le nombre de publications), rapportées au nombre d'abonnés, en pourcentage. C'est la formule la plus courante ; certains outils utilisent la portée à la place des abonnés, ce qui donne des chiffres plus élevés." },
  { q: "Quel est un bon taux d'engagement ?", a: "Cela dépend fortement du réseau et de la taille du compte : un petit compte engagé dépasse souvent 5 % sur TikTok ou Instagram, un grand compte se situe plutôt autour de 1 %. Les repères affichés sont des ordres de grandeur généraux, datés." },
  { q: "Pourquoi mon taux baisse quand mes abonnés augmentent ?", a: "Mécaniquement : le dénominateur grossit plus vite que les interactions. Regardez plutôt l'évolution des interactions par publication et la portée — Nebula les suit dans Analytics et Engagements." },
  { q: "Nebula peut-il calculer mon vrai taux ?", a: "Oui : une fois vos comptes connectés, l'onglet Engagements récupère les vrais chiffres de chaque publication (vues, j'aime, commentaires, partages, enregistrements) et Analytics suit vos abonnés et votre portée." }
];

export default function TauxEngagementPage() {
  const [network, setNetwork] = useState<ToolNetwork>("INSTAGRAM");
  const [followers, setFollowers] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");
  const [posts, setPosts] = useState("1");

  const result = useMemo(() => {
    const f = Number(followers);
    const p = Math.max(1, Number(posts) || 1);
    const interactions = (Number(likes) || 0) + (Number(comments) || 0) + (Number(shares) || 0);
    if (!f || f <= 0) return null;
    const perPost = interactions / p;
    const rate = (perPost / f) * 100;
    const b = BENCHMARKS[network];
    const verdict = rate >= b.high ? "excellent" : rate >= b.median ? "bon" : rate >= b.low ? "dans la moyenne" : "en dessous de la moyenne";
    return { rate, perPost, verdict };
  }, [network, followers, likes, comments, shares, posts]);
  // Badge Explorateur (Réussites, lot C) : un vrai taux calculé.
  const computed = Boolean(result && (Number(likes) || Number(comments) || Number(shares)));
  useEffect(() => {
    if (computed) markToolExplored();
  }, [computed]);

  const b = BENCHMARKS[network];

  return (
    <ToolPage
      icon={<IconChart className="h-6 w-6" />}
      title="Calculateur de taux d'engagement"
      intro={
        <p>
          Le taux d&apos;engagement dit ce que vos abonnés font vraiment de vos publications : ils passent, ou ils réagissent. Entrez vos abonnés et les interactions d&apos;une ou plusieurs publications, l&apos;outil calcule le taux par publication et le situe face aux ordres de grandeur de chaque réseau. Aucun compte, aucune donnée envoyée à une IA : tout se calcule dans votre navigateur. Pour suivre vos vrais chiffres au fil des semaines, Nebula les récupère automatiquement depuis vos comptes connectés.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/audit", title: "Audit de présence en ligne" },
        { href: "/outils/meilleur-moment", title: "Meilleur moment pour publier" },
        { href: "/outils/hashtags", title: "Générateur de hashtags" },
        { href: "/outils/legendes", title: "Générateur de légendes" }
      ]}
      ctaLabel="Mesurer mon vrai taux avec Nebula"
    >
      <GlassCard hover={false}>
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

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ["Abonnés", followers, setFollowers],
              ["J'aime (total)", likes, setLikes],
              ["Commentaires (total)", comments, setComments],
              ["Partages (total)", shares, setShares],
              ["Nombre de publications", posts, setPosts]
            ] as [string, string, (v: string) => void][]
          ).map(([label, value, set]) => (
            <label key={label} className="block">
              <span className="block text-xs uppercase tracking-wide text-slate-500">{label}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
              />
            </label>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4" aria-live="polite">
          {result ? (
            <>
              <p className="text-xs uppercase tracking-wide text-slate-500">Taux d&apos;engagement par publication</p>
              <p className="mt-1 text-3xl font-semibold text-white">{result.rate.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %</p>
              <p className="mt-1 text-sm text-slate-300">
                {result.perPost.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} interactions par publication — <strong className="text-white">{result.verdict}</strong> pour {NETWORK_META[network].label}.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Indiquez au moins vos abonnés et une interaction pour voir le résultat.</p>
          )}
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Ordres de grandeur — {NETWORK_META[network].label}</p>
            <ul className="mt-1.5 grid grid-cols-3 gap-2 text-center text-xs">
              <li className="rounded-lg bg-white/[0.03] py-2"><span className="block text-slate-500">bas</span><span className="text-white">{b.low} %</span></li>
              <li className="rounded-lg bg-white/[0.03] py-2"><span className="block text-slate-500">médian</span><span className="text-white">{b.median} %</span></li>
              <li className="rounded-lg bg-white/[0.03] py-2"><span className="block text-slate-500">élevé</span><span className="text-white">{b.high} %</span></li>
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">Moyennes générales relevées en {BENCHMARK_DATE} (études publiques des éditeurs d&apos;outils d&apos;analyse). Vos propres statistiques Nebula font mieux.</p>
          </div>
        </div>
      </GlassCard>
    </ToolPage>
  );
}
