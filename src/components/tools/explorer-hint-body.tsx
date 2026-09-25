"use client";

// Badge « Explorateur » sur les outils gratuits (Réussites v2, lot C) : après
// un premier outil essayé, rappelle qu'un deuxième débloque le badge ; après
// deux, qu'il attend à l'inscription. Lit le cookie technique « outils
// essayés » (voir src/lib/tools-explored.ts), rien d'autre. Chargé à part
// (explorer-hint.tsx) : les pages d'outils n'en portent pas le poids.
import { useEffect, useState } from "react";
import Link from "next/link";
import { EXPLORER_TARGET, TOOLS_EXPLORED_EVENT, exploredTools } from "@/lib/tools-explored";

export default function ExplorerHintBody() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(exploredTools().length);
    update();
    window.addEventListener(TOOLS_EXPLORED_EVENT, update);
    return () => window.removeEventListener(TOOLS_EXPLORED_EVENT, update);
  }, []);

  if (count === 0) return null;
  const unlocked = count >= EXPLORER_TARGET;
  return (
    <div className="relative z-10 mx-auto mb-10 max-w-2xl px-6" role="status">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent-cyan/30 bg-accent-cyan/[0.05] px-4 py-3">
        <span className="text-2xl leading-none" aria-hidden="true">
          🔭
        </span>
        <p className="min-w-[12rem] flex-1 text-sm text-slate-200">
          {unlocked ? (
            <>
              <strong className="font-semibold text-white">Badge Explorateur débloqué.</strong> Il vous attend dans vos Réussites dès la création de votre compte (gratuit).
            </>
          ) : (
            <>
              <strong className="font-semibold text-white">
                {count} outil sur {EXPLORER_TARGET} essayé.
              </strong>{" "}
              Essayez-en un deuxième : le badge Explorateur vous attendra à l&apos;inscription.
            </>
          )}
        </p>
        {unlocked ? (
          <Link href="/register?utm_source=outils&utm_medium=badge&utm_campaign=explorateur" className="shrink-0 rounded-xl bg-nebula-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-nebula-400">
            Créer mon compte
          </Link>
        ) : (
          <Link href="/outils" className="shrink-0 text-xs font-medium text-aurora-300 transition hover:text-white">
            Autres outils →
          </Link>
        )}
      </div>
    </div>
  );
}
