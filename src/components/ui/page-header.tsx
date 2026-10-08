"use client";

// En-tête de page partagé : titre h1, description, fil d'Ariane et zone
// d'actions — pour que toutes les pages de l'application aient la même
// hiérarchie.
//
// Refonte V2 (07/10/2026, maquettes de Lucas) : le titre monte dans la barre
// du haut (« Publier · Brouillon enregistré », à gauche, voir app-header.tsx),
// par un portail vers l'emplacement #nb-page-title. Dans la page ne restent
// que la description, en une ligne discrète, et les boutons de la page,
// alignés à droite. Hors de l'application (aucun emplacement), le titre
// s'affiche dans la page comme avant.
import Link from "next/link";
import { useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";
import { InShellContext } from "@/components/dashboard/shell-context";

export interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Icône du titre (affichée seulement quand le titre reste dans la page). */
  icon?: ReactNode;
  /** Fil d'Ariane, dernier élément = page courante (sans href). */
  breadcrumb?: Crumb[];
  /** Boutons/CTA alignés à droite (passent sous la description sur mobile). */
  actions?: ReactNode;
  /** Petit état à côté du titre dans la barre du haut (ex. « Brouillon enregistré »). */
  status?: ReactNode;
  className?: string;
}

const SLOT_ID = "nb-page-title";

function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <>
      {items.slice(0, -1).map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} className="font-normal text-slate-500">
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-white hover:underline">
              {crumb.label}
            </Link>
          ) : (
            crumb.label
          )}
          <span aria-hidden="true"> / </span>
        </span>
      ))}
    </>
  );
}

export function PageHeader({ title, description, icon, breadcrumb, actions, status, className }: PageHeaderProps) {
  const inShell = useContext(InShellContext);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(SLOT_ID));
  }, []);

  const crumbs = breadcrumb && breadcrumb.length > 1 ? breadcrumb : null;

  const topbarTitle = slot
    ? createPortal(
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="min-w-0 truncate font-display text-[19px] font-semibold text-white sm:text-[21px]">
            {crumbs && <Breadcrumb items={crumbs} />}
            {title}
          </h1>
          {status && <span className="hidden shrink-0 truncate text-[14px] text-slate-500 sm:inline">{status}</span>}
        </div>,
        slot
      )
    : null;

  // Dans l'application, le titre n'est jamais dans la page (même avant
  // l'hydratation : la barre du haut affiche en attendant le nom du menu).
  const titleInPage = !inShell && !slot;
  const hasBody = Boolean(description || actions || titleInPage);
  if (!hasBody) return topbarTitle;

  return (
    <>
      {topbarTitle}
      <header className={clsx("nb-page-intro flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
        <div className="min-w-0">
          {titleInPage && (
            <>
              {crumbs && (
                <nav aria-label="Fil d'Ariane" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <Breadcrumb items={crumbs} />
                </nav>
              )}
              <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
                {icon && <span className="flex shrink-0 text-slate-400">{icon}</span>}
                <span className="min-w-0">{title}</span>
              </h1>
            </>
          )}
          {description && <div className={clsx("max-w-2xl text-[14px] leading-relaxed text-slate-500", titleInPage && "mt-1")}>{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
    </>
  );
}
