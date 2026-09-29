"use client";

// Bandeau de démo des outils IA (29/09/2026) : dit clairement que le
// résultat affiché est un exemple préparé à l'avance, sans IA, et propose de
// créer un compte gratuit (ou de se connecter) pour générer le sien. La
// saisie du visiteur est gardée pour son retour (voir saveToolDraft).
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { DEMO_NOTICE } from "@/lib/tools/demo";

export function ToolDemoNotice({
  slug,
  input,
  onBeforeLeave,
  label = "Exemple · sans IA",
  children
}: {
  slug: string;
  input: string;
  onBeforeLeave?: () => void;
  /** Pastille en tête du bandeau. */
  label?: string;
  /** Texte à la place du message commun (ex. outil miniatures, sans exemple). */
  children?: React.ReactNode;
}) {
  const back = `/outils/${slug}`;
  return (
    <div className="mt-4 rounded-xl border border-aurora-400/25 bg-aurora-400/[0.05] p-4" role="note" aria-label={label}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
        <span className="rounded-full border border-aurora-400/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-aurora-300">{label}</span>
        {input && <span className="text-xs text-slate-400">Publication fictive : « {input} »</span>}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{children ?? DEMO_NOTICE}</p>
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
