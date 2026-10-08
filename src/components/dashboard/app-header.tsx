"use client";

// Barre du haut — refonte V2 (07/10/2026, maquettes de Lucas) : à gauche le
// titre de la page (posé par <PageHeader>, voir page-header.tsx, sinon le
// nom de l'entrée de menu), à droite trois icônes sans cadre — rechercher,
// assistant, notifications — puis l'avatar qui ouvre le menu du profil
// (compte, facturation, administration, marque, déconnexion).
// Avant : la bande des comptes connectés, « + », le bouton de mise à niveau
// et un sélecteur de compte ; ils vivent maintenant dans Comptes connectés
// et dans le menu du profil.
// Une page peut aussi poser ses boutons dans la barre (emplacement
// #nb-header-actions, ex. Publier sur petit écran, maquette E).
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";
import { NotificationBell } from "./notification-bell";
import { openCommandPalette } from "./command-palette";
import { useAiAssistant } from "./ai-assistant-context";
import { IconSearch } from "./icons";
import { AiIcon } from "@/components/ai/ai-icon";
import { ProfileMenu } from "./profile-menu";
import { resolveNav } from "./navigation";

/** Emplacements de la barre du haut où une page pose son titre et ses boutons (portails). */
export const PAGE_TITLE_SLOT_ID = "nb-page-title";
export const HEADER_ACTIONS_SLOT_ID = "nb-header-actions";

interface AppHeaderProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
  isOwner?: boolean;
}

export function AppHeader({ oauth, isOwner }: AppHeaderProps) {
  const pathname = usePathname();
  const assistant = useAiAssistant();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Titre de secours (avant que la page ne pose le sien, ou page sans
  // <PageHeader>) : l'entrée de menu, et la page secondaire s'il y en a une.
  const nav = resolveNav(pathname);
  const iconButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-[color:var(--nb-hover)] hover:text-white";

  return (
    <header className="nb-topbar sticky top-0 z-30 border-b border-[color:var(--nb-sep)]">
      <div className="flex h-16 items-center gap-1 px-4 sm:gap-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center">
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
          <IconSearch className="h-5 w-5" />
        </button>

        {/* Assistant IA — seul point d'entrée général, à l'endroit où YouTube
            Studio place « Demander à Studio ». Masqué tant que l'IA n'est pas
            disponible pour la marque. Survol ou focus : le tiroir se
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
            className={clsx(iconButton, assistant.open && "bg-[color:var(--nb-active)] text-white")}
          >
            <AiIcon className="h-4 w-4" active={assistant.open} />
          </button>
        )}

        <NotificationBell />

        <div className="ml-1">
          <ProfileMenu oauth={oauth} isOwner={isOwner} />
        </div>
      </div>
    </header>
  );
}
