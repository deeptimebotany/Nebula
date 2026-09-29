"use client";

// Visite guidée à la première connexion (lot U4, brief « Essai 14 jours »,
// 29/09/2026). Six bulles présentent les zones clés, puis UNE action :
// connecter un premier compte. Elle présente l'interface ; la checklist
// « Mise en route » et le « Premier décollage » restent les guides d'action.
//
// Règles :
//   - une seule fois, aux comptes créés après le déploiement (la migration
//     marque les comptes existants comme « vue »), après la fin de l'intro
//     animée ; état gardé sur le compte (User.tourCompletedAt, tourStep) :
//     elle ne se rejoue pas sur un autre appareil et reprend à la même étape
//     après un rechargement ;
//   - toujours passable (« Passer », Échap) ; « Revoir la visite » dans
//     Paramètres et la palette (événement nebula:tour-restart) ;
//   - élément du produit, pas une surprise : visible aussi en Mode focus ;
//   - sans dépendance : bulles ancrées sur des attributs data-tour (la
//     première cible visible gagne : barre latérale sur ordinateur, barre
//     d'onglets et bouton Menu sur téléphone) ; une étape sans cible est
//     sautée ; aucun style en ligne interdit par la CSP (styles React) ;
//   - accessibilité : focus dans la bulle, texte annoncé, clavier,
//     « Réduire les animations » respecté ;
//   - mesure : tour_started, tour_step, tour_skipped (avec l'étape),
//     tour_completed ; sons courts « tic » et accord final (lot U5).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useUiSounds } from "@/components/use-ui-sounds";
import { trackGrowthEvent } from "@/lib/growth-client";
import { clsx } from "@/lib/clsx";
import { INTRO_DONE_EVENT } from "@/lib/tour-events";


export interface TourStep {
  id: string;
  /** Cibles data-tour, par ordre de préférence (la première visible gagne). */
  anchors: string[];
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "brand", anchors: ["brand-switcher", "mobile-menu"], title: "Vos marques", text: "Chaque marque a ses comptes, son calendrier et ses statistiques." },
  { id: "connect", anchors: ["connect-account", "mobile-menu"], title: "Comptes connectés", text: "Connectez YouTube, Instagram, Facebook ou TikTok. Nebula ne voit jamais vos mots de passe." },
  { id: "compose", anchors: ["nav-composer"], title: "Publier", text: "Une publication, plusieurs réseaux, à l'heure de votre choix." },
  { id: "calendar", anchors: ["nav-calendar"], title: "Calendrier", text: "Tout ce qui est prévu, déplaçable d'un glisser." },
  { id: "analytics", anchors: ["nav-analytics"], title: "Analytics", text: "Vos chiffres de tous les réseaux au même endroit." },
  { id: "reussites", anchors: ["nav-reussites", "mobile-menu"], title: "Réussites", text: "Chaque semaine, 3 missions pour publier régulièrement." }
];

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

/** Première cible visible d'une étape, ou null (étape sautée). */
export function findTarget(step: TourStep, root: ParentNode = document): HTMLElement | null {
  for (const anchor of step.anchors) {
    const found = Array.from(root.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)).find(isVisible);
    if (found) return found;
  }
  return null;
}

/** Prochaine étape affichable à partir de `from` (sens +1), ou -1. */
export function nextAvailableStep(from: number, hasTarget: (i: number) => boolean): number {
  for (let i = from; i < TOUR_STEPS.length; i++) if (hasTarget(i)) return i;
  return -1;
}

const BUBBLE_WIDTH = 300;
const GAP = 12;
const MARGIN = 16;

interface Placement {
  top: number;
  left: number;
  side: "right" | "below" | "above";
  spot: { top: number; left: number; width: number; height: number };
}

function place(target: HTMLElement, bubbleHeight: number): Placement {
  const r = target.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(BUBBLE_WIDTH, vw - MARGIN * 2);
  const spot = { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 };
  const clampLeft = (x: number) => Math.max(MARGIN, Math.min(x, vw - width - MARGIN));
  const clampTop = (y: number) => Math.max(MARGIN, Math.min(y, vh - bubbleHeight - MARGIN));
  // Barre latérale (cible à gauche) : bulle à droite.
  if (r.right + GAP + width + MARGIN <= vw && r.left < vw / 3 && r.height < vh / 2) {
    return { top: clampTop(r.top + r.height / 2 - bubbleHeight / 2), left: r.right + GAP, side: "right", spot };
  }
  if (r.bottom + GAP + bubbleHeight + MARGIN <= vh) {
    return { top: r.bottom + GAP, left: clampLeft(r.left + r.width / 2 - width / 2), side: "below", spot };
  }
  return { top: clampTop(r.top - GAP - bubbleHeight), left: clampLeft(r.left + r.width / 2 - width / 2), side: "above", spot };
}

function introStillPlaying(): boolean {
  return /(?:^|;\s*)nb_welcome=1/.test(document.cookie);
}

export function GuidedTour({ replay = 0 }: { replay?: number }) {
  const { data: me, patch } = useBootstrap();
  const pathname = usePathname();
  const router = useRouter();
  const { play } = useUiSounds();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const save = useCallback((body: Record<string, unknown>) => {
    void fetch("/api/me/tour", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
  }, []);

  // L'intro animée de création de compte passe d'abord.
  useEffect(() => {
    if (!introStillPlaying()) {
      setIntroDone(true);
      return;
    }
    const done = () => setIntroDone(true);
    window.addEventListener(INTRO_DONE_EVENT, done);
    const fallback = window.setTimeout(done, 15_000);
    return () => {
      window.removeEventListener(INTRO_DONE_EVENT, done);
      window.clearTimeout(fallback);
    };
  }, []);

  // Démarrage (nouveau compte, sur la Vue d'ensemble) ou reprise (étape > 0).
  useEffect(() => {
    if (!me || startedRef.current || !introDone || me.tour.completed) return;
    const resume = me.tour.step > 0;
    if (!resume && pathname !== "/dashboard") return;
    startedRef.current = true;
    const t = window.setTimeout(() => {
      setStep(Math.min(me.tour.step, TOUR_STEPS.length - 1));
      setActive(true);
      if (!resume) trackGrowthEvent("tour_started", {});
    }, 700);
    return () => window.clearTimeout(t);
  }, [me, introDone, pathname]);

  // « Revoir la visite » : la coquille compte les demandes (replay) et ne
  // charge ce composant qu'à ce moment-là.
  useEffect(() => {
    if (replay <= 0) return;
    startedRef.current = true;
    save({ action: "restart" });
    patch({ tour: { completed: false, step: 0 } });
    setStep(0);
    setActive(true);
    trackGrowthEvent("tour_started", { replay: true });
  }, [replay, save, patch]);

  const finish = useCallback(
    (how: "completed" | "skipped") => {
      setActive(false);
      setPlacement(null);
      save({ action: "done" });
      patch({ tour: { completed: true, step } });
      if (how === "completed") {
        trackGrowthEvent("tour_completed", {});
        play("finish", { allowInFocus: true });
      } else {
        trackGrowthEvent("tour_skipped", { step: step + 1 });
      }
    },
    [save, patch, step, play]
  );

  // Étape courante : cible visible, sinon on saute à la suivante.
  useLayoutEffect(() => {
    if (!active) return;
    const index = nextAvailableStep(step, (i) => Boolean(findTarget(TOUR_STEPS[i])));
    if (index === -1) {
      finish("completed");
      return;
    }
    if (index !== step) {
      setStep(index);
      return;
    }
    const target = findTarget(TOUR_STEPS[index])!;
    const update = () => setPlacement(place(target, bubbleRef.current?.offsetHeight ?? 170));
    target.scrollIntoView({ block: "nearest" });
    update();
    // Hauteur réelle de la bulle connue après le premier rendu.
    const raf = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step, finish]);

  // Chaque étape : enregistrée, mesurée, focus dans la bulle.
  useEffect(() => {
    if (!active) return;
    save({ action: "step", step });
    trackGrowthEvent("tour_step", { step: step + 1 });
    const t = window.setTimeout(() => bubbleRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [active, step, save]);

  // Échap : passer.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish("skipped");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active) return null;
  const current = TOUR_STEPS[step];
  const last = nextAvailableStep(step + 1, (i) => Boolean(findTarget(TOUR_STEPS[i]))) === -1;

  function next() {
    play("tick", { allowInFocus: true });
    setStep((s) => s + 1);
  }

  return (
    <>
      {placement && (
        <div
          aria-hidden="true"
          className="nb-tour-spot pointer-events-none fixed z-[80] rounded-xl motion-safe:transition-all motion-safe:duration-300"
          style={{ top: placement.spot.top, left: placement.spot.left, width: placement.spot.width, height: placement.spot.height }}
        />
      )}
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="nb-tour-title"
        aria-describedby="nb-tour-text"
        tabIndex={-1}
        className={clsx(
          "glass-panel-solid fixed z-[81] w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl p-4 outline-none motion-safe:transition-[top,left,opacity] motion-safe:duration-300",
          !placement && "opacity-0"
        )}
        style={placement ? { top: placement.top, left: placement.left } : { top: -9999, left: -9999 }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aurora-300" aria-live="polite">
          Visite · {step + 1} / {TOUR_STEPS.length}
        </p>
        <h2 id="nb-tour-title" className="mt-1 font-display text-base font-semibold text-white">
          {current.title}
        </h2>
        <p id="nb-tour-text" className="mt-1 text-sm leading-relaxed text-slate-300">
          {current.text}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => finish("skipped")} className="text-sm text-slate-400 transition hover:text-white">
            Passer
          </button>
          {last ? (
            <button
              type="button"
              onClick={() => {
                finish("completed");
                router.push("/accounts");
              }}
              className="rounded-xl bg-nebula-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-nebula-400"
            >
              Connecter mon premier compte
            </button>
          ) : (
            <button type="button" onClick={next} className="rounded-xl bg-nebula-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-nebula-400">
              Suivant
            </button>
          )}
        </div>
      </div>
    </>
  );
}
