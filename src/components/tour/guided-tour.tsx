"use client";

// Visite guidée à la première connexion (lot U4, brief « Essai 14 jours »,
// 29/09/2026). Sept bulles présentent les zones clés, puis UNE action :
// connecter un premier compte. Depuis le 06/10/2026, le Mode focus a sa
// propre étape : l'anneau entoure Paramètres, une flèche part de la bulle
// et le chemin « Paramètres › Focus et réussites › Mode focus » est écrit. Elle présente l'interface ; la checklist
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
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBootstrap, useFocusMode } from "@/components/bootstrap-provider";
import { useUiSounds } from "@/components/use-ui-sounds";
import { trackGrowthEvent } from "@/lib/growth-client";
import { clsx } from "@/lib/clsx";
import { INTRO_DONE_EVENT } from "@/lib/tour-events";
import { IconSettings } from "@/components/dashboard/icons";


export interface TourStep {
  id: string;
  /** Cibles data-tour, par ordre de préférence (la première visible gagne). */
  anchors: string[];
  title: string;
  text: string;
  /** Bouton « Activer le Mode focus » dans la bulle (30/09/2026). */
  focusChoice?: boolean;
  /** Flèche de la bulle vers la cible (06/10/2026). */
  arrow?: boolean;
  /** Chemin pour retrouver le réglage, affiché sous le texte (06/10/2026). */
  path?: string[];
}

// Refonte V2 (07/10/2026) : la marque et les Paramètres sont dans le menu du
// profil (avatar en haut à droite). Menu sans catégories (10/10/2026) : chaque
// page est montrée directement ; « Publier » est le bouton en haut à droite
// (« nav-composer » : barre du bas sur téléphone).
export const TOUR_STEPS: TourStep[] = [
  { id: "brand", anchors: ["brand-switcher", "mobile-menu"], title: "Vos marques", text: "Chaque marque a ses comptes, son calendrier et ses statistiques. Changez de marque avec la petite pastille, dans le coin de votre photo." },
  { id: "connect", anchors: ["nav-accounts", "mobile-menu"], title: "Comptes connectés", text: "Connectez YouTube, Instagram, Facebook ou TikTok. Nebula ne voit jamais vos mots de passe." },
  { id: "compose", anchors: ["header-publish", "nav-composer"], title: "Publier", text: "Une publication, plusieurs réseaux, à l'heure de votre choix." },
  { id: "calendar", anchors: ["nav-calendar"], title: "Calendrier", text: "Tout ce qui est prévu, déplaçable d'un glisser." },
  { id: "analytics", anchors: ["nav-analytics"], title: "Analytics", text: "Vos chiffres de tous les réseaux au même endroit." },
  { id: "reussites", anchors: ["nav-reussites", "mobile-menu"], title: "Réussites", text: "Chaque semaine, 3 missions pour publier régulièrement : rangs, coffres et badges suivent vos vraies publications." },
  {
    // Le Mode focus a sa propre étape (06/10/2026) : on montre OÙ il se trouve.
    id: "focus",
    anchors: ["profile-menu", "mobile-menu"],
    title: "Mode focus",
    text: "Vous préférez une interface neutre ? Le Mode focus coupe tout d'un clic : récompenses, sons et notifications de succès. Il se trouve dans les Paramètres, depuis le menu de votre profil\u00a0:",
    focusChoice: true,
    arrow: true,
    path: ["Menu du profil", "Paramètres", "Focus et réussites", "Mode focus"]
  }
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
/** Écart quand une flèche relie la bulle à sa cible. */
const ARROW_GAP = 64;
const MARGIN = 16;

interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Placement {
  top: number;
  left: number;
  side: "right" | "below" | "above";
  spot: { top: number; left: number; width: number; height: number };
  /** Flèche de la bulle (x1, y1) vers l'anneau de la cible (x2, y2). */
  arrow: Arrow | null;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

export function place(r: { top: number; left: number; width: number; height: number }, bubbleHeight: number, viewport: { width: number; height: number }, withArrow = false): Placement {
  const right = r.left + r.width;
  const bottom = r.top + r.height;
  const vw = viewport.width;
  const vh = viewport.height;
  const gap = withArrow ? ARROW_GAP : GAP;
  const width = Math.min(BUBBLE_WIDTH, vw - MARGIN * 2);
  const spot = { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 };
  const clampLeft = (x: number) => clamp(x, MARGIN, vw - width - MARGIN);
  const clampTop = (y: number) => clamp(y, MARGIN, vh - bubbleHeight - MARGIN);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  // La flèche part du bord de la bulle, au plus près de la cible (jamais dans un coin arrondi).
  const inset = 22;
  // Barre latérale (cible à gauche) : bulle à droite.
  if (right + gap + width + MARGIN <= vw && r.left < vw / 3 && r.height < vh / 2) {
    const top = clampTop(cy - bubbleHeight / 2);
    const left = right + gap;
    const arrow = withArrow ? { x1: left - 6, y1: clamp(cy, top + inset, top + bubbleHeight - inset), x2: spot.left + spot.width + 6, y2: cy } : null;
    return { top, left, side: "right", spot, arrow };
  }
  if (bottom + gap + bubbleHeight + MARGIN <= vh) {
    const top = bottom + gap;
    const left = clampLeft(cx - width / 2);
    const arrow = withArrow ? { x1: clamp(cx, left + inset, left + width - inset), y1: top - 6, x2: cx, y2: spot.top + spot.height + 6 } : null;
    return { top, left, side: "below", spot, arrow };
  }
  const top = clampTop(r.top - gap - bubbleHeight);
  const left = clampLeft(cx - width / 2);
  const arrow = withArrow ? { x1: clamp(cx, left + inset, left + width - inset), y1: top + bubbleHeight + 6, x2: cx, y2: spot.top - 6 } : null;
  return { top, left, side: "above", spot, arrow };
}

function introStillPlaying(): boolean {
  return /(?:^|;\s*)nb_welcome=1/.test(document.cookie);
}

export function GuidedTour({ replay = 0 }: { replay?: number }) {
  const { data: me, patch } = useBootstrap();
  const pathname = usePathname();
  const router = useRouter();
  const { play } = useUiSounds();
  const { focusMode, setFocusMode } = useFocusMode();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  /** Cible = bouton Menu (téléphone) : le chemin commence par « Menu ». */
  const [viaMenu, setViaMenu] = useState(false);
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
    const withArrow = Boolean(TOUR_STEPS[index].arrow);
    setViaMenu(target.dataset.tour === "mobile-menu");
    const update = () =>
      setPlacement(place(target.getBoundingClientRect(), bubbleRef.current?.offsetHeight ?? 170, { width: window.innerWidth, height: window.innerHeight }, withArrow));
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
      {placement?.arrow && <TourArrow key={`${step}-${placement.side}`} arrow={placement.arrow} />}
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
        {current.path && (
          <ol aria-label="Où le trouver" className="mt-2.5 flex flex-wrap items-center gap-1 text-xs">
            {(viaMenu ? ["Menu", ...current.path] : current.path).map((label, i, all) => (
              // Le séparateur précède l'élément : une ligne coupée commence par « › », jamais ne finit par lui.
              <li key={label} className="flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden="true" className="text-slate-500">
                    ›
                  </span>
                )}
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium",
                    i === all.length - 1 ? "border-aurora-400/40 bg-aurora-400/10 text-aurora-200" : "border-white/10 bg-white/[0.04] text-slate-200"
                  )}
                >
                  {label === "Paramètres" && <IconSettings className="h-3.5 w-3.5" />}
                  {label}
                </span>
              </li>
            ))}
          </ol>
        )}
        {current.focusChoice && (
          // Mode focus en un clic, dès la visite (30/09/2026) ; réversible
          // dans Paramètres → Apparence et dans la palette (Ctrl/Cmd+K).
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
            {focusMode ? (
              <>
                <span className="text-emerald-300">Mode focus activé.</span>
                <button type="button" onClick={() => void setFocusMode(false)} className="text-slate-400 underline underline-offset-2 hover:text-white">
                  Annuler
                </button>
              </>
            ) : (
              <>
                <span className="text-slate-400">{current.path ? "Envie d'essayer ?" : "Interface 100 % épurée ?"}</span>
                <button
                  type="button"
                  onClick={() => {
                    void setFocusMode(true);
                    trackGrowthEvent("tour_focus_mode", {});
                  }}
                  className="font-medium text-aurora-300 underline underline-offset-2 hover:text-white"
                >
                  {current.path ? "L'activer maintenant" : "Activer le Mode focus"}
                </button>
              </>
            )}
          </div>
        )}
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

/**
 * Flèche de la bulle vers la cible : tracée à l'apparition, puis trois
 * petits élans vers la cible (rien de tout ça avec « Réduire les animations »).
 */
function TourArrow({ arrow }: { arrow: Arrow }) {
  const { x1, y1, x2, y2 } = arrow;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nudge = { "--nb-nx": `${((x2 - x1) / length) * 5}px`, "--nb-ny": `${((y2 - y1) / length) * 5}px` } as CSSProperties;
  // Légère courbe : point de contrôle décalé perpendiculairement au trait.
  const mx = (x1 + x2) / 2 - (y2 - y1) * 0.18;
  const my = (y1 + y2) / 2 + (x2 - x1) * 0.18;
  // Pointe dans l'axe de la fin de la courbe (du point de contrôle vers la cible).
  const angle = Math.atan2(y2 - my, x2 - mx);
  const head = 10;
  const wing = (a: number) => `${x2 - head * Math.cos(angle - a)},${y2 - head * Math.sin(angle - a)}`;
  return (
    <svg aria-hidden="true" className="nb-tour-arrow pointer-events-none fixed inset-0 z-[81] h-full w-full text-aurora-300" style={nudge} data-testid="tour-arrow">
      <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <polyline points={`${wing(0.5)} ${x2},${y2} ${wing(-0.5)}`} pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
