"use client";

// Bandeau de démo des outils IA (29/09/2026) : dit clairement que le
// résultat affiché est un exemple préparé à l'avance, sans IA, et propose de
// créer un compte gratuit (ou de se connecter) pour générer le sien. La
// saisie du visiteur est gardée pour son retour (voir saveToolDraft).
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { DEMO_NOTICE } from "@/lib/tools/demo";

export function ToolDemoNotice({ slug, input, onBeforeLeave }: { slug: string; input: string; onBeforeLeave?: () => void }) {
  const back = `/outils/${slug}`;
  return (
    <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-4" role="note" aria-label="Démo sans IA">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">Démo · sans IA</p>
      <p className="mt-1 text-sm text-slate-200">{DEMO_NOTICE}</p>
      <p className="mt-2 text-xs text-slate-400">
        Exemple fictif pour : <span className="text-slate-300">« {input} »</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={`/register?next=${encodeURIComponent(back)}&utm_source=outils&utm_medium=demo&utm_campaign=${slug}`}
          onClick={onBeforeLeave}
          className={buttonClasses("glow")}
        >
          Créer mon compte gratuit
        </Link>
        <Link href={`/login?callbackUrl=${encodeURIComponent(back)}`} onClick={onBeforeLeave} className="text-sm text-aurora-300 hover:underline">
          J&apos;ai déjà un compte
        </Link>
      </div>
    </div>
  );
}

/** Ligne sous le bouton : générations restantes, ou rappel de la démo. */
export function ToolQuotaLine({ status, remaining, kind }: { status: "loading" | "visitor" | "member"; remaining: number | null; kind: "text" | "thumbnail" }) {
  if (status === "visitor") return <p className="mt-2 text-center text-[11px] text-slate-500">Sans compte : démo préparée à l&apos;avance, sans IA.</p>;
  if (status !== "member" || remaining === null) return null;
  const what = kind === "thumbnail" ? "miniature(s)" : "génération(s)";
  return <p className="mt-2 text-right text-[11px] text-slate-500">{remaining} {what} restante(s) aujourd&apos;hui</p>;
}
