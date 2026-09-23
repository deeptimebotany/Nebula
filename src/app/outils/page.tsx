import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { IconSparkle, IconMessage, IconUpload } from "@/components/dashboard/icons";

// Hub des outils IA gratuits, sans compte (voir la feuille de route —
// produit n°2 : aimant à visiteurs qui redirige ensuite vers un compte
// Nebula payant). Page publique, volontairement HORS du groupe (dashboard)
// et absente de middleware.ts, pour rester accessible sans connexion.
export const metadata = {
  title: "Outils IA gratuits",
  description:
    "Générateur de légendes et de miniatures pour vos réseaux sociaux, propulsé par l'IA. Gratuit, sans compte."
};

const TOOLS = [
  {
    href: "/outils/legendes",
    icon: IconMessage,
    title: "Générateur de légendes & titres",
    desc: "Décrivez votre publication en quelques mots, l'IA rédige un titre ou une légende adaptée au réseau visé, hashtags inclus."
  },
  {
    href: "/outils/miniatures",
    icon: IconUpload,
    title: "Générateur de miniatures",
    desc: "Envoyez une photo, l'IA la rend plus percutante façon miniature YouTube/TikTok qui donne envie de cliquer."
  }
];

export default function OutilsHubPage() {
  return (
    <main id="contenu" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="noise-grid grain-overlay pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-10 pt-16 text-center sm:pt-20">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-aurora-400/30 bg-white/[0.03] px-4 py-1.5 text-xs text-aurora-200">
          <IconSparkle className="h-3.5 w-3.5" />
          Gratuit, sans compte, sans carte bancaire
        </div>
        <h1 className="font-display text-3xl font-semibold leading-tight text-white sm:text-5xl">
          Outils IA gratuits pour vos réseaux sociaux
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-slate-400 sm:text-base">
          Les mêmes assistants IA que dans Nebula, en accès libre avec un petit quota quotidien par personne.
          Essayez-les tout de suite, aucune inscription requise.
        </p>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href}>
              <GlassCard className="h-full transition hover:border-aurora-400/30">
                <tool.icon className="h-6 w-6 text-aurora-300" />
                <h2 className="mt-3 font-display text-lg font-medium text-white">{tool.title}</h2>
                <p className="mt-2 text-sm text-slate-400">{tool.desc}</p>
                <span className="mt-4 inline-block text-sm font-medium text-aurora-300">Essayer →</span>
              </GlassCard>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-24 text-center">
        <GlassCard hover={false} className="p-8">
          <h2 className="font-display text-xl font-semibold text-white">Envie d&apos;aller plus loin ?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Créez un espace Nebula gratuit pour connecter vos réseaux, planifier vos publications et suivre vos
            statistiques. L&apos;assistant IA intégré (titres, légendes, miniatures depuis vos vidéos) fait partie des
            paliers Pro et Agence.
          </p>
          <ButtonLink href="/register" className="mt-5 px-6 py-3 text-base">
            Créer mon espace gratuitement
          </ButtonLink>
        </GlassCard>
      </section>
    </main>
  );
}
