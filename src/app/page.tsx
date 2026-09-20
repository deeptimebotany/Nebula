import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { NETWORK_META, NETWORKS } from "@/lib/types";
import { OnboardingCarousel } from "@/components/marketing/onboarding-carousel";

const FEATURES = [
  {
    title: "Publication multi-réseaux en un clic",
    desc: "Rédigez une fois, adaptez par plateforme si besoin, publiez ou planifiez sur Instagram, TikTok, YouTube et Facebook simultanément."
  },
  {
    title: "Assistant IA (optionnel)",
    desc: "Chat pour vous aider à utiliser le site, génération de titres/légendes par réseau, miniatures extraites de vos vidéos, et analyse de rétention façon YouTube Studio."
  },
  {
    title: "Analytics unifiées",
    desc: "Abonnés, portée, engagement et meilleurs horaires : toutes vos statistiques réseau dans un seul cockpit, sans onglets à jongler."
  },
  {
    title: "Multi-comptes, multi-marques",
    desc: "Connectez plusieurs comptes par réseau (plusieurs Instagram, plusieurs pages Facebook...) et gérez plusieurs marques depuis un seul espace, avec des rôles par marque."
  }
];

// Composant serveur : si une session valide existe déjà (cookie persistant,
// voir src/lib/auth.ts), on saute directement au tableau de bord au lieu de
// réafficher la page marketing à chaque ouverture du site.
export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");

  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="noise-grid pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-aurora-400/30 bg-white/[0.03] px-4 py-1.5 text-xs text-aurora-200">
          <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-aurora-400" />
          L&apos;alternative sombre et lumineuse aux outils de gestion sociale classiques
        </div>
        <h1 className="font-display text-4xl font-semibold leading-tight text-white sm:text-6xl">
          Pilotez tous vos réseaux <br />
          depuis un seul <span className="text-gradient">cockpit</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400 sm:text-lg">
          Nebula planifie, publie et analyse votre présence sociale — Instagram, TikTok, YouTube,
          Facebook — avec un style que vous n&apos;oublierez pas.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register">
            <Button className="px-6 py-3 text-base">Créer mon espace gratuitement</Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" className="px-6 py-3 text-base">
              Se connecter
            </Button>
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {NETWORKS.map((n) => (
            <span
              key={n}
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: `${NETWORK_META[n].color}44`, color: NETWORK_META[n].color }}
            >
              {NETWORK_META[n].label}
            </span>
          ))}
        </div>

        <OnboardingCarousel />
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <GlassCard key={f.title}>
              <h3 className="font-display text-lg font-medium text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-28 text-center">
        <GlassCard className="p-10" hover={false}>
          <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
            Prêt à quitter les tableaux de bord ternes ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            Créez votre espace en moins d&apos;une minute et connectez votre premier réseau.
          </p>
          <Link href="/register" className="mt-6 inline-block">
            <Button className="px-6 py-3 text-base">Commencer maintenant</Button>
          </Link>
        </GlassCard>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 text-center text-xs text-slate-500">
        <p>
          Nebula — projet personnel. Chaque publication réelle nécessite vos propres identifiants API par
          réseau (voir le README).
        </p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link href="/terms" className="hover:text-slate-300 hover:underline">
            Conditions d&apos;utilisation
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-slate-300 hover:underline">
            Politique de confidentialité
          </Link>
        </p>
      </footer>
    </main>
  );
}
