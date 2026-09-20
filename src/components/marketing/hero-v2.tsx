"use client";

// Hero V2 — direction artistique "cockpit spatial" : le visiteur a
// l'impression de piloter un vaisseau plutôt que de regarder un dashboard
// SaaS générique. Orbes en parallax (suivent très légèrement le curseur,
// comme un hublot), titre à dégradé vivant, révélation séquencée de chaque
// bloc, et halo tournant sur le badge d'annonce. Le contenu fonctionnel
// (carrousel d'onboarding, démo réseaux, preuve sociale) reste inchangé —
// seule l'habillage et le mouvement sont nouveaux.

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { type ReactNode, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { NETWORK_META, NETWORKS } from "@/lib/types";

function ParallaxOrbs() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 20 });
  const sy = useSpring(my, { stiffness: 40, damping: 20 });

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mx.set((e.clientX - rect.left) / rect.width - 0.5);
      my.set((e.clientY - rect.top) / rect.height - 0.5);
    },
    [mx, my]
  );

  const orb1X = useTransform(sx, (v) => v * 26);
  const orb1Y = useTransform(sy, (v) => v * 18);
  const orb2X = useTransform(sx, (v) => v * -34);
  const orb2Y = useTransform(sy, (v) => v * -22);

  return (
    <div onMouseMove={onMouseMove} className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        style={{ x: orb1X, y: orb1Y }}
        className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-nebula-500/25 blur-3xl animate-float"
      />
      <motion.div
        style={{ x: orb2X, y: orb2Y }}
        className="absolute right-0 top-32 h-96 w-96 rounded-full bg-accent-cyan/15 blur-3xl"
      />
      <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 animate-orbit rounded-full border border-white/[0.03]" />
      <div className="absolute left-1/2 top-0 h-[700px] w-[1200px] -translate-x-1/2 animate-orbit-reverse rounded-full border border-white/[0.02]" />
    </div>
  );
}

export function HeroV2({ children }: { children: ReactNode }) {
  return (
    <section className="cockpit-vignette relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
      <ParallaxOrbs />

      <Reveal>
        <div className="glow-border-spin mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-aurora-400/30 bg-white/[0.03] px-4 py-1.5 text-xs text-aurora-200">
          <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-aurora-400" />
          L&apos;alternative sombre et lumineuse aux outils de gestion sociale classiques
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <h1 className="font-display text-4xl font-semibold leading-tight text-white sm:text-6xl">
          Pilotez tous vos réseaux <br />
          depuis un seul <span className="text-gradient-live">cockpit</span>
        </h1>
      </Reveal>

      <Reveal delay={0.14}>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400 sm:text-lg">
          Nebula planifie, publie et analyse votre présence sociale — Instagram, TikTok, YouTube,
          Facebook — avec un style que vous n&apos;oublierez pas.
        </p>
      </Reveal>

      <Reveal delay={0.2}>
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
      </Reveal>

      {/* Badges de réassurance : formulés honnêtement — Nebula utilise bien
          les API officielles de chaque plateforme (voir OAuth sur
          /accounts), mais n'est pas un "partenaire vérifié" certifié par
          Meta ou YouTube, donc on ne prétend jamais le contraire ici. */}
      <Reveal delay={0.26}>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">
            🔒 Connexion sécurisée via les API officielles Meta
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">
            ▶ Compatible avec l&apos;API YouTube Data
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">
            🔐 Vos identifiants ne sont jamais partagés à des tiers
          </span>
        </div>
      </Reveal>

      <Reveal delay={0.3}>
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
      </Reveal>

      {children}
    </section>
  );
}
