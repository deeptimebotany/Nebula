// Pied de page des pages publiques : produit, outils, légal, contact.
// Remplace l'ancien footer de l'accueil (« Nebula — projet personnel… voir
// le README »), qui n'inspirait pas confiance et pointait vers un fichier
// que le visiteur ne peut pas ouvrir.
import Link from "next/link";
import { NebulaBrandMark } from "@/components/dashboard/nebula-brandmark";
import { LAUNCHED_NETWORKS, NETWORK_META } from "@/lib/types";
import { networkInkStyle } from "@/components/ui/network-badge";
import { SITE_NAME } from "@/lib/site";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Produit",
    links: [
      { href: "/#fonctionnalites", label: "Fonctionnalités" },
      { href: "/#comment-ca-marche", label: "Comment ça marche" },
      { href: "/tarifs", label: "Tarifs" },
      { href: "/securite", label: "Sécurité et données" },
      { href: "/#faq", label: "Questions fréquentes" }
    ]
  },
  {
    title: "Outils gratuits",
    links: [
      { href: "/outils/legendes", label: "Générateur de légendes" },
      { href: "/outils/miniatures", label: "Idées de miniatures" },
      { href: "/outils", label: "Tous les outils" }
    ]
  },
  {
    title: "Comparatifs",
    links: [
      { href: "/alternatives/hootsuite", label: "Alternative à Hootsuite" },
      { href: "/alternatives/metricool", label: "Alternative à Metricool" },
      { href: "/alternatives", label: "Tous les comparatifs" }
    ]
  },
  {
    title: "Compte",
    links: [
      { href: "/register", label: "Créer mon espace" },
      { href: "/login", label: "Se connecter" },
      { href: "/forgot-password", label: "Mot de passe oublié" }
    ]
  },
  {
    title: "Légal et contact",
    links: [
      { href: "/contact", label: "Nous contacter" },
      { href: "/legal#mentions", label: "Mentions légales" },
      { href: "/legal#conditions", label: "Conditions d'utilisation" },
      { href: "/legal#confidentialite", label: "Politique de confidentialité" }
    ]
  }
];

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative z-10 border-t border-white/[0.06] bg-void-950/60">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <NebulaBrandMark iconSize={34} wordHeight={30} />
            <p className="mt-4 max-w-xs text-sm text-slate-400">
              Planifiez, publiez et analysez vos réseaux sociaux depuis un seul espace.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Réseaux pris en charge">
              {LAUNCHED_NETWORKS.map((n) => (
                <li
                  key={n}
                  // network-ink : couleur du réseau en sombre, version assombrie en
                  // mode clair (TikTok cyan sur blanc était à 1,9:1).
                  className="network-ink rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  style={{ borderColor: `${NETWORK_META[n].color}44`, ...networkInkStyle(n) }}
                >
                  {NETWORK_META[n].label}
                </li>
              ))}
            </ul>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{col.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-300 transition hover:text-white hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/[0.06] pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE_NAME}. Publication via les API officielles de Meta, TikTok et YouTube.
          </p>
          <Link href="/contact" className="transition hover:text-slate-300 hover:underline">
            Nous écrire
          </Link>
        </div>
      </div>
    </footer>
  );
}
