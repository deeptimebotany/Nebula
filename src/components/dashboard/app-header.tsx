"use client";

// Barre du haut — refonte V2 (07/10/2026, maquettes de Lucas) : à gauche le
// titre de la page (posé par <PageHeader>, voir page-header.tsx, sinon le
// nom de l'entrée de menu), à droite, comme YouTube Studio (09/10/2026,
// demande de Lucas) : rechercher et notifications (icônes de 24 px, traits
// épais, blanches), « Demander à Nebula » et « Publier » dans des boutons
// arrondis entourés, puis l'avatar qui ouvre le menu du profil (compte,
// facturation, administration, marque, déconnexion).
// Avant : la bande des comptes connectés, « + », le bouton de mise à niveau
// et un sélecteur de compte ; ils vivent maintenant dans Comptes connectés
// et dans le menu du profil.
// Une page peut aussi poser ses boutons dans la barre (emplacement
// #nb-header-actions, ex. Publier sur petit écran, maquette E).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";
import { NotificationBell } from "./notification-bell";
import { openCommandPalette } from "./command-palette";
import { useAiAssistant } from "./ai-assistant-context";
import { IconMenu, IconSearch, IconUpload } from "./icons";
import { AiIcon } from "@/components/ai/ai-icon";
import { ProfileMenu } from "./profile-menu";
import { resolveNav } from "./navigation";

/** Emplacements de la barre du haut où une page pose son titre et ses boutons (portails). */
export const PAGE_TITLE_SLOT_ID = "nb-page-title";
export const HEADER_ACTIONS_SLOT_ID = "nb-header-actions";

interface AppHeaderProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
  isOwner?: boolean;
  /** Téléphone (moins de 768 px) : ouvre le menu complet. */
  onOpenMenu?: () => void;
}

export function AppHeader({ oauth, isOwner, onOpenMenu }: AppHeaderProps) {
  const pathname = usePathname();
  const assistant = useAiAssistant();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Titre de secours (avant que la page ne pose le sien, ou page sans
  // <PageHeader>) : l'entrée de menu, et la page secondaire s'il y en a une.
  const nav = resolveNav(pathname);
  // Plus gros et plus appuyé (09/10/2026, comme YouTube Studio) : icônes de
  // 24 px en traits de 2,1, couleur du texte principal.
  const iconButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-[color:var(--nb-hover)]";
  const pill =
    "flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/20 px-2.5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--nb-hover)] md:pl-3.5 md:pr-4";
  const onComposer = pathname === "/composer" || pathname.startsWith("/composer/");

  return (
    // Sans trait en bas (09/10/2026, demande de Lucas : « épurer ») : le fond
    // légèrement flouté suffit à la détacher du contenu qui défile dessous.
    <header className="nb-topbar sticky top-0 z-30">
      <div className="flex h-16 items-center gap-1 px-4 sm:gap-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center">
          {/* Téléphone : bouton du menu, à gauche du titre (09/10/2026). */}
          {onOpenMenu && (
            <button type="button" onClick={onOpenMenu} aria-label="Ouvrir le menu" title="Menu" className={clsx(iconButton, "-ml-2 mr-1 md:hidden")}>
              <IconMenu className="h-6 w-6 [stroke-width:2]" />
            </button>
          )}
          <div id={PAGE_TITLE_SLOT_ID} className="nb-title-slot min-w-0" />
          <p className="nb-title-fallback min-w-0 truncate font-display text-[19px] font-semibold text-white sm:text-[21px]">
            {nav.item ? (
              nav.pageLabel ? (
                <>
                  <span className="font-normal text-slate-500">{nav.item.label} / </span>
                  {nav.pageLabel}
                </>
              ) : (
                nav.item.label
              )
            ) : null}
          </p>
        </div>

        {/* Boutons posés par la page (ex. Programmer / Publier maintenant) */}
        <div id={HEADER_ACTIONS_SLOT_ID} className="nb-header-actions flex shrink-0 items-center gap-2" />

        <button type="button" onClick={openCommandPalette} aria-label="Rechercher ou aller à une page" title={`Rechercher (${isMac ? "⌘" : "Ctrl"} K)`} className={iconButton}>
          <IconSearch className="h-6 w-6 [stroke-width:2.1]" />
        </button>

        <NotificationBell />

        {/* Assistant IA — seul point d'entrée général, à l'endroit où YouTube
            Studio place « Demander à Studio » : bouton arrondi entouré, avec
            son nom (icône seule sur téléphone). Masqué tant que l'IA n'est
            pas disponible pour la marque. Survol ou focus : le tiroir se
            télécharge, pour que l'ouverture garde son animation. */}
        {assistant.enabled && (
          <button
            type="button"
            onClick={assistant.toggle}
            onPointerEnter={assistant.prepare}
            onFocus={assistant.prepare}
            aria-label="Demander à Nebula"
            aria-pressed={assistant.open}
            title="Demander à Nebula"
            className={clsx(pill, assistant.open && "border-aurora-400/50 bg-[color:var(--nb-active)]")}
          >
            <AiIcon className="h-5 w-5" active={assistant.open} />
            <span className="hidden md:inline">Demander à Nebula</span>
          </button>
        )}

        {/* « Publier » (à la place du « Créer » de YouTube Studio) : ouvre la
            page Publier. Sur ordinateur seulement (la barre du bas l'a déjà
            sur téléphone), et pas sur la page Publier elle-même. */}
        {!onComposer && (
          <Link href="/composer" data-tour="header-publish" className={clsx(pill, "hidden md:flex")}>
            <IconUpload className="h-5 w-5 [stroke-width:2.1]" />
            Publier
          </Link>
        )}

        <div className="ml-1">
          <ProfileMenu oauth={oauth} isOwner={isOwner} />
        </div>
      </div>
    </header>
  );
}
