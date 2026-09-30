"use client";

// Barre de navigation des pages PUBLIQUES (accueil, outils, légal...) :
// logo cliquable vers l'accueil, ancres vers les sections de la page
// d'accueil, connexion et création de compte. Avant ce composant, aucune
// page publique n'avait de header — le logo n'apparaissait même pas sur
// l'accueil. Volontairement indépendante de la barre de l'application
// connectée (topnav.tsx), qui a d'autres besoins.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";
import { NebulaBrandMark } from "@/components/dashboard/nebula-brandmark";
import { IconClose, IconMenu } from "@/components/dashboard/icons";
import { ButtonLink } from "@/components/ui/button";
import { ModeToggle } from "@/components/marketing/mode-toggle";
import { PRELAUNCH_PAGE, isSiteOpen } from "@/lib/launch";

// Les ancres pointent vers l'accueil : depuis une autre page publique
// (/outils, /legal...), le lien ramène d'abord sur "/" puis à la section.
const LINKS = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/outils", label: "Outils gratuits" },
  { href: "/securite", label: "Sécurité" },
  { href: "/contact", label: "Contact" }
];

// Pré-lancement (30/09/2026, voir src/lib/launch.ts) : bandeau « ouvre
// bientôt » en haut de chaque page publique (sauf /bientot elle-même), et le
// bouton d'inscription mène à /bientot.
const SITE_OPEN = isSiteOpen();
const SIGNUP = SITE_OPEN ? { href: "/register", label: "Créer mon espace" } : { href: PRELAUNCH_PAGE, label: "Être prévenu" };

function PrelaunchBanner() {
  return (
    <Link
      href={PRELAUNCH_PAGE}
      className="group flex items-center justify-center gap-2 border-b border-white/[0.06] bg-gradient-to-r from-accent-violet/15 via-aurora-400/10 to-nebula-500/15 px-4 py-2 text-center text-xs text-slate-200 transition hover:text-white sm:text-sm"
    >
      <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-aurora-300 opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-aurora-300" />
      </span>
      <span>
        <strong className="font-semibold text-white">Nebula ouvre bientôt.</strong> Les inscriptions sont fermées pendant les derniers réglages.{" "}
        <span className="whitespace-nowrap font-medium text-aurora-300 group-hover:underline">Être prévenu du lancement →</span>
      </span>
    </Link>
  );
}

export function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fermer le menu mobile à chaque navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 border-b transition-colors",
        scrolled || open
          ? "border-white/[0.06] bg-void-950/85 backdrop-blur"
          : "border-transparent bg-transparent"
      )}
    >
      {!SITE_OPEN && pathname !== PRELAUNCH_PAGE && <PrelaunchBanner />}
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" aria-label="Nebula — accueil" className="flex shrink-0 items-center">
          <NebulaBrandMark iconSize={34} wordHeight={30} />
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ModeToggle />
          <ButtonLink href="/login" variant="ghost">
            Se connecter
          </ButtonLink>
          <ButtonLink href={SIGNUP.href}>{SIGNUP.label}</ButtonLink>
        </div>

        <div className="flex items-center gap-1 md:hidden">
        <ModeToggle />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/5 hover:text-white md:hidden"
        >
          {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
        </div>
      </div>

      {open && (
        <div id="menu-mobile" className="border-t border-white/[0.06] px-6 pb-5 pt-3 md:hidden">
          <nav aria-label="Navigation principale (mobile)" className="flex flex-col">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-slate-200 transition hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2">
            <ButtonLink href={SIGNUP.href} className="w-full">
              {SIGNUP.label}
            </ButtonLink>
            <ButtonLink href="/login" variant="outline" className="w-full">
              Se connecter
            </ButtonLink>
          </div>
        </div>
      )}
    </header>
  );
}
