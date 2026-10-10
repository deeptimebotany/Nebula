// Easter egg « Statue » : curseur immobile 60 secondes sur le tableau de
// bord. Correctif du lot U6 (brief « Essai 14 jours », 29/09/2026) : il se
// déclenchait quand on quittait l'onglet ou l'application — le navigateur
// n'envoie plus de mousemove, et le script prenait ce silence pour un
// curseur immobile.
//
// Le compteur ne tourne que si TOUT est vrai en même temps :
//   - onglet visible (document.visibilityState === "visible") ;
//   - fenêtre active (document.hasFocus()) ;
//   - curseur dans la fenêtre, position connue : le compteur ne démarre
//     qu'après un premier mousemove.
// Il repart de zéro sur tout mouvement, touche, défilement ou clic ; il
// s'arrête (et attend un nouveau mousemove) quand l'onglet est caché, que
// la fenêtre perd le focus ou que le curseur sort de la fenêtre (mouseout
// sans relatedTarget : curseur posé sur un deuxième écran, fenêtre active).
// À 60 s, le temps réellement écoulé est vérifié par horodatage (setTimeout
// est ralenti en arrière-plan) ; une seule minuterie à la fois (lot 4).
// Désactivé sur les écrans tactiles (pointer: coarse), sans curseur.

export const STATUE_THRESHOLD_MS = 60 * 1000;

type Listener = (event: Event) => void;
interface Target {
  addEventListener(type: string, listener: Listener, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: Listener, options?: EventListenerOptions | boolean): void;
}

export interface StatueEnv {
  win: Target & { matchMedia?: (query: string) => { matches: boolean } };
  doc: Target & { visibilityState: string; hasFocus(): boolean };
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

function browserEnv(): StatueEnv {
  return {
    win: window,
    doc: document,
    now: () => Date.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number)
  };
}

const ACTIVITY_EVENTS = ["keydown", "wheel", "scroll", "mousedown", "click", "touchstart"] as const;

/** Surveille l'immobilité ; renvoie la fonction d'arrêt. `onFire` n'est appelé qu'une fois. */
export function watchStatue(onFire: () => void, options: { thresholdMs?: number; env?: StatueEnv } = {}): () => void {
  const env = options.env ?? browserEnv();
  const threshold = options.thresholdMs ?? STATUE_THRESHOLD_MS;
  if (env.win.matchMedia?.("(pointer: coarse)").matches) return () => undefined;

  let armed = false;
  let fired = false;
  let lastActivity = env.now();
  let timer: unknown = null;

  const active = () => armed && env.doc.visibilityState === "visible" && env.doc.hasFocus();

  function clearTimer() {
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
  }

  function ensureTimer() {
    if (fired || timer !== null || !active()) return;
    timer = env.setTimeout(check, Math.max(250, threshold - (env.now() - lastActivity)));
  }

  function check() {
    timer = null;
    if (fired || !active()) return;
    const idle = env.now() - lastActivity;
    if (idle >= threshold) {
      fired = true;
      stop();
      onFire();
      return;
    }
    ensureTimer();
  }

  /** Curseur perdu (onglet caché, fenêtre inactive, curseur sorti) : on attend un nouveau mousemove. */
  function disarm() {
    armed = false;
    clearTimer();
  }

  const onMove: Listener = () => {
    armed = true;
    lastActivity = env.now();
    ensureTimer();
  };
  const onActivity: Listener = () => {
    lastActivity = env.now();
    ensureTimer();
  };
  const onVisibility: Listener = () => {
    if (env.doc.visibilityState !== "visible") disarm();
  };
  const onOut: Listener = (event) => {
    if (!(event as MouseEvent).relatedTarget) disarm();
  };

  env.win.addEventListener("mousemove", onMove, { passive: true });
  for (const type of ACTIVITY_EVENTS) env.win.addEventListener(type, onActivity, { passive: true });
  env.win.addEventListener("blur", disarm);
  env.doc.addEventListener("visibilitychange", onVisibility);
  env.doc.addEventListener("mouseout", onOut);

  function stop() {
    clearTimer();
    env.win.removeEventListener("mousemove", onMove);
    for (const type of ACTIVITY_EVENTS) env.win.removeEventListener(type, onActivity);
    env.win.removeEventListener("blur", disarm);
    env.doc.removeEventListener("visibilitychange", onVisibility);
    env.doc.removeEventListener("mouseout", onOut);
  }

  return stop;
}
