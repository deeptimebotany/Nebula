// Gabarit commun des micro-outils gratuits de /outils (brief growth, lot
// G4.c) : H1 = la requête visée, introduction de 80 à 120 mots, l'outil,
// FAQ en <details> doublée d'un JSON-LD FAQPage, appel « Programmer avec
// Nebula », liens croisés entre outils. Même layout que /outils/legendes
// (nav + footer via outils/layout.tsx).
import Link from "next/link";
import type { ReactNode } from "react";
import { FaqSection, type FaqItem } from "@/components/marketing/faq-section";
import { ButtonLink } from "@/components/ui/button";
import { TRIAL_DAYS } from "@/lib/trial";

export interface ToolLink {
  href: string;
  title: string;
}

export function ToolPage({
  icon,
  title,
  intro,
  children,
  faq,
  related,
  ctaLabel = "Programmer avec Nebula",
  ctaTitle = "Programmez directement ce que vous générez",
  ctaText
}: {
  icon: ReactNode;
  title: string;
  intro: ReactNode;
  children: ReactNode;
  faq: FaqItem[];
  related: ToolLink[];
  ctaLabel?: string;
  ctaTitle?: string;
  ctaText?: ReactNode;
}) {
  return (
    <main id="contenu" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="noise-grid grain-overlay pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-4 pt-16 text-center">
        <Link href="/outils" className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
          ← Tous les outils
        </Link>
        <h1 className="mt-4 flex items-center justify-center gap-2 font-display text-2xl font-semibold text-white sm:text-3xl">
          <span className="text-aurora-300">{icon}</span> {title}
        </h1>
        <div className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">{intro}</div>
      </section>

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-10">{children}</section>

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-10">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="font-display text-lg font-semibold text-white">{ctaTitle}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            {ctaText ?? <>Nebula publie sur YouTube, Instagram, Facebook et TikTok, à l&apos;heure, avec l&apos;IA intégrée. Gratuit pour commencer, {TRIAL_DAYS} jours de Pro offerts.</>}
          </p>
          <div className="mt-4">
            <ButtonLink href="/register?utm_source=outils&utm_medium=cta&utm_campaign=micro-outils">{ctaLabel}</ButtonLink>
          </div>
        </div>
      </section>

      <div className="relative z-10 px-6 pb-10">
        <FaqSection items={faq} title="Questions fréquentes" />
      </div>

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Autres outils gratuits</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {related.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="inline-flex rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-300 transition hover:border-aurora-400/40 hover:text-white">
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
