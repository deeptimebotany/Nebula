"use client";

// Visite de l'application par onglets (accueil, 29/09/2026). Tout le
// contenu est dans le HTML (référencement, page sans JavaScript) : les
// onglets ne font que choisir le panneau visible. Les captures des
// panneaux cachés ne sont téléchargées qu'à l'ouverture de leur onglet
// (images en chargement différé, masquées par l'attribut hidden).
import { useId, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";

export interface TourPanel {
  id: string;
  label: string;
  content: React.ReactNode;
}

export function ProductTour({ panels }: { panels: TourPanel[] }) {
  const [active, setActive] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % panels.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + panels.length) % panels.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = panels.length - 1;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div>
      <div className="-mx-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {/* V2 (08/10/2026) : onglets soulignés, comme dans l'application. */}
        <div role="tablist" aria-label="Écrans de l'application" className="mx-auto flex w-max gap-1 border-b border-[color:var(--nb-sep)]">
          {panels.map((p, i) => (
            <button
              key={p.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${p.id}`}
              aria-selected={active === i}
              aria-controls={`${uid}-panel-${p.id}`}
              tabIndex={active === i ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[15px] transition",
                active === i ? "nb-tour-tab-on border-current font-semibold text-white" : "border-transparent text-slate-400 hover:text-white"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {panels.map((p, i) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`${uid}-panel-${p.id}`}
          aria-labelledby={`${uid}-tab-${p.id}`}
          hidden={active !== i}
          className="mt-10"
        >
          {p.content}
        </div>
      ))}
    </div>
  );
}
