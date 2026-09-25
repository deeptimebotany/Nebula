"use client";

// Mini-leçon d'une étoile (Réussites v2, lot B) : pourquoi, comment faire
// dans Nebula, ce qu'il faut éviter, puis « Essayer maintenant ». Le texte
// des 25 leçons (src/lib/reussites/lessons.ts) n'est chargé qu'à la
// première ouverture : il ne pèse rien sur la page tant qu'on ne lit pas.
import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import type { Lesson } from "@/lib/reussites/lessons";
import type { SkillDTO, StarDTO } from "@/lib/reussites/types";

/** « **gras** » → <strong>. */
function rich(text: string): ReactNode {
  const parts = text.split("**");
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-white">{p}</strong> : <Fragment key={i}>{p}</Fragment>));
}

export function LessonDialog({ star, skill, onClose }: { star: StarDTO | null; skill: SkillDTO | null; onClose: () => void }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!star) return;
    let alive = true;
    setLesson(null);
    setFailed(false);
    import("@/lib/reussites/lessons")
      .then((m) => alive && setLesson(m.findLesson(star.key) ?? null))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [star]);

  const open = Boolean(star);
  const title = lesson?.title ?? star?.lessonTitle ?? "Mini-leçon";
  const inPage = star?.href.startsWith("#");
  const actionCls = "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-nebula-500 px-4 text-sm font-semibold text-white transition hover:bg-nebula-400";

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClassName="max-w-xl">
      {star && skill && (
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: skill.color }} aria-hidden="true" />
            {skill.name} ★{star.n} · {star.name} · 2 min de lecture
          </p>
          {failed ? (
            <p className="text-slate-400">La leçon n&apos;a pas pu se charger. Vérifiez votre connexion, puis réessayez.</p>
          ) : !lesson ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-3 w-full animate-pulse rounded bg-white/[0.06]" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-3 w-4/6 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ) : (
            <>
              <section>
                <h3 className="mb-1 font-display text-sm font-semibold text-white">Pourquoi c&apos;est utile</h3>
                <p>{rich(lesson.why)}</p>
              </section>
              <section>
                <h3 className="mb-1 font-display text-sm font-semibold text-white">Comment faire</h3>
                {lesson.how.intro && <p className="mb-1.5">{rich(lesson.how.intro)}</p>}
                {lesson.how.ordered ? (
                  <ol className="list-decimal space-y-1 pl-5 marker:text-slate-500">
                    {lesson.how.items.map((it, i) => (
                      <li key={i}>{rich(it)}</li>
                    ))}
                  </ol>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 marker:text-slate-500">
                    {lesson.how.items.map((it, i) => (
                      <li key={i}>{rich(it)}</li>
                    ))}
                  </ul>
                )}
                {lesson.how.outro && <p className="mt-1.5">{rich(lesson.how.outro)}</p>}
              </section>
              <section className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2">
                <h3 className="mb-0.5 font-display text-sm font-semibold text-amber-200">À éviter</h3>
                <p>{rich(lesson.avoid)}</p>
              </section>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!star.unlockedAt &&
              (inPage ? (
                <button
                  type="button"
                  className={actionCls}
                  onClick={() => {
                    onClose();
                    window.setTimeout(() => document.getElementById(star.href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
                  }}
                >
                  {star.action} <span aria-hidden="true">→</span>
                </button>
              ) : (
                <Link href={star.href} className={actionCls} onClick={onClose}>
                  {star.action} <span aria-hidden="true">→</span>
                </Link>
              ))}
            <span className="rounded-full bg-nebula-500/20 px-2.5 py-1 text-xs font-semibold tabular-nums text-aurora-200">
              {star.unlockedAt ? "Étoile allumée" : `+${star.xp} XP`}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
