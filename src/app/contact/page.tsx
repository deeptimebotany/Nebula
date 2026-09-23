import type { Metadata } from "next";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { ContactForm } from "./contact-form";
import { GlassCard } from "@/components/ui/glass-card";
import { IconLock, IconMessage, IconSparkle } from "@/components/dashboard/icons";
import { SITE_CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Une question sur Nebula, les tarifs ou votre compte ? Écrivez-nous, nous répondons à chaque message.",
  alternates: { canonical: "/contact" }
};

const SIDE = [
  { icon: IconMessage, title: "Une vraie réponse", body: "Chaque message est lu et reçoit une réponse personnelle, généralement sous un à deux jours ouvrés." },
  { icon: IconSparkle, title: "Avant de vous abonner", body: "Décrivez votre activité (créateur, indépendant, agence, nombre de marques) : nous vous indiquons le palier adapté, sans pousser au plus cher." },
  { icon: IconLock, title: "Sécurité", body: "Pour signaler une faille ou un comportement suspect, précisez-le dans le sujet : ces messages sont traités en priorité." }
];

export default function ContactPage() {
  return (
    <PublicShell width="max-w-5xl">
      <PublicPageHeading eyebrow="Contact" title="Écrivez-nous" desc="Une question, une remarque, un problème ? Le formulaire ci-dessous arrive directement dans notre boîte." />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <GlassCard hover={false} className="p-6 sm:p-8">
          <ContactForm />
        </GlassCard>
        <div className="space-y-4">
          {SIDE.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/[0.06] p-5">
              <item.icon className="h-5 w-5 text-aurora-300" />
              <h2 className="mt-3 text-base font-medium text-white">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{item.body}</p>
            </div>
          ))}
          <p className="px-1 text-xs text-slate-500">
            Vous préférez votre messagerie ?{" "}
            <a href={`mailto:${SITE_CONTACT_EMAIL}`} className="text-aurora-300 hover:underline">
              {SITE_CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
