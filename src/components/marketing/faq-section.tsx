// Bloc FAQ des pages publiques (landings /decouvrir, micro-outils, pages
// « alternative à ») : questions en <details> (même style que /tarifs) et
// données structurées JSON-LD FAQPage pour les moteurs. Le <script
// type="application/ld+json"> n'est pas exécuté par le navigateur : la CSP
// stricte (script-src avec nonce) ne le concerne pas.
import { clsx } from "@/lib/clsx";

export interface FaqItem {
  q: string;
  a: string;
}

export function FaqSection({ items, title = "Questions fréquentes", eyebrow, className }: { items: FaqItem[]; title?: string; eyebrow?: string; className?: string }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };
  return (
    <section className={clsx("mx-auto max-w-3xl", className)}>
      <div className="mb-6 text-center">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">{eyebrow}</p>}
        <h2 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
      </div>
      <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.02]">
        {items.map((item) => (
          <details key={item.q} className="group px-5 py-4 open:bg-white/[0.02]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-400 transition group-open:rotate-45 group-open:text-white">
                +
              </span>
            </summary>
            <p className="mt-3 pr-10 text-sm leading-relaxed text-slate-400">{item.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </section>
  );
}
