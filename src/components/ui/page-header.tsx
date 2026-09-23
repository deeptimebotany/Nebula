// En-tête de page partagé : titre h1, description, icône optionnelle, fil
// d'Ariane et zone d'actions alignée à droite — pour que toutes les pages
// de l'application aient la même hiérarchie (avant : h1 avec ou sans icône
// selon la page, tailles variables, aucun fil d'Ariane).
import Link from "next/link";
import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";

export interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Fil d'Ariane, dernier élément = page courante (sans href). */
  breadcrumb?: Crumb[];
  /** Boutons/CTA alignés à droite (passent sous le titre sur mobile). */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon, breadcrumb, actions, className }: PageHeaderProps) {
  return (
    <header className={clsx("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Fil d'Ariane" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {breadcrumb.map((crumb, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                  {crumb.href && !last ? (
                    <Link href={crumb.href} className="hover:text-slate-300 hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined} className={clsx(last && "text-slate-400")}>
                      {crumb.label}
                    </span>
                  )}
                  {!last && <span aria-hidden="true">/</span>}
                </span>
              );
            })}
          </nav>
        )}
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
          {icon && <span className="flex shrink-0 text-aurora-300">{icon}</span>}
          <span className="min-w-0">{title}</span>
        </h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
