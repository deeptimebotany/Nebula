import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { OnboardingCarousel } from "@/components/marketing/onboarding-carousel";
import { PreviewWidget } from "@/components/marketing/preview-widget";
import { SocialProof } from "@/components/marketing/social-proof";
import { HeroV2 } from "@/components/marketing/hero-v2";
import { PricingSection } from "@/components/marketing/pricing-section";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";

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
      <div className="noise-grid grain-overlay pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <HeroV2>
        <SocialProof />
        <OnboardingCarousel />
        <PreviewWidget />
      </HeroV2>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <RevealGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <RevealItem key={f.title}>
              <MotionGlassCard>
                <h3 className="font-display text-lg font-medium text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
              </MotionGlassCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      <PricingSection />

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-28 text-center">
        <Reveal>
          <MotionGlassCard className="glow-border-spin p-10">
            <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
              Prêt à quitter les tableaux de bord ternes ?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
              Créez votre espace en moins d&apos;une minute et connectez votre premier réseau.
            </p>
            <Link href="/register" className="mt-6 inline-block">
              <Button className="px-6 py-3 text-base">Commencer maintenant</Button>
            </Link>
          </MotionGlassCard>
        </Reveal>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 text-center text-xs text-slate-500">
        <p>
          Nebula — projet personnel. Chaque publication réelle nécessite vos propres identifiants API par
          réseau (voir le README).
        </p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link href="/outils" className="hover:text-slate-300 hover:underline">
            Outils IA gratuits (sans compte)
          </Link>
          <span>·</span>
          <Link href="/legal#conditions" className="hover:text-slate-300 hover:underline">
            Conditions d&apos;utilisation
          </Link>
          <span>·</span>
          <Link href="/legal#confidentialite" className="hover:text-slate-300 hover:underline">
            Politique de confidentialité
          </Link>
        </p>
      </footer>
    </main>
  );
}
