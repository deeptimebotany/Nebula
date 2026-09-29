// Intro de création de compte (voir src/components/intro/account-intro.tsx) :
// calendrier de l'animation, en secondes, sans aucune dépendance au
// navigateur (testé dans tests/quality/account-intro.test.ts).
//
// Déroulé : page blanche ; les anneaux du logo, immenses (tout l'écran tient
// dans leur trou central), entrent par les bords en tournant, déformés comme
// à travers une lentille liquide, traversent l'écran puis se posent à la
// taille du logo (INTRO_LAND). Le vrai logo (SVG) prend alors le relais, le
// wordmark « Nebula » s'écrit lettre par lettre, une aura organique ondule
// derrière puis s'ouvre en anneau de lumière et se dissout.

/** Durée totale de l'intro animée. */
export const INTRO_DURATION = 5.9;
/** Instant où les anneaux se posent (relais canevas → logo SVG). */
export const INTRO_LAND = 1.9;
/** Durée de la version sans mouvement (préférence « réduire les animations » ou pas de WebGL). */
export const INTRO_STATIC_DURATION = 2.2;
/** Taille de l'icône du logo une fois posée (px CSS). */
export const INTRO_ICON_SIZE = 60;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Courbe de Bézier CSS (x1, y1, x2, y2) → fonction d'avancement 0..1. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = clamp01(x);
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      const d = dx(t);
      if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(clamp01(t));
  };
}

// Page blanche, les anneaux entrent par les bords, traversent l'écran puis se posent.
const zoomEase = bezier(0.7, 0.2, 0.7, 1);
const inOut = bezier(0.65, 0, 0.35, 1);

export interface IntroFrame {
  /** Taille des anneaux (px CSS). */
  S: number;
  /** Rotation des anneaux (radians). */
  ang: number;
  /** Déformation « lentille » (px CSS). */
  warp: number;
  /** Franges de couleur. */
  ab: number;
  /** Opacité des anneaux du canevas (0 après le relais). */
  ringA: number;
  /** Rayon et opacité de l'aura (px CSS). */
  blobR: number;
  blobA: number;
  /** Rayon du trou quand l'aura s'ouvre en anneau (px CSS, 0 = pas de trou). */
  hole: number;
  /** Reflet sur les anneaux (disparaît quand ils se posent). */
  gloss: number;
}

/** Paramètres du canevas à l'instant t pour un écran de W × H px CSS. */
export function introFrame(t: number, W: number, H: number): IntroFrame {
  // Départ : le logo est si grand que tout l'écran tient dans le trou central
  // des anneaux (rayon intérieur ≈ 0,147 × S) ; ils arrivent ensuite depuis
  // l'extérieur du cadre. Zoom interpolé en échelle logarithmique : vitesse
  // perçue régulière.
  const D = Math.hypot(W, H) / 2;
  const u = zoomEase(clamp01(t / INTRO_LAND));
  const S0 = D * 9.5;
  const S1 = INTRO_ICON_SIZE;
  const S = Math.exp(Math.log(S0) + (Math.log(S1) - Math.log(S0)) * u);
  const k = 1 - u;
  const Rmax = Math.min(W, H) * 0.26 + 60;
  const tb = t - (INTRO_LAND - 0.35);
  const grow = tb <= 0 ? 0 : 1 - Math.exp(-5.5 * tb) * Math.cos(6.5 * tb); // éclosion avec un léger rebond
  const open = inOut(clamp01((t - (INTRO_LAND + 1.85)) / 1.6)); // l'aura s'ouvre en anneau
  return {
    S,
    ang: -((4 * Math.PI) / 3) * k,
    warp: Math.min(W, H) * 0.3 * Math.pow(k, 1.5),
    ab: 0.04 * Math.pow(k, 1.3),
    ringA: 1 - clamp01((t - INTRO_LAND) / 0.16),
    blobR: Rmax * Math.max(0, grow) * (1 + 0.85 * open),
    blobA: clamp01(tb / 0.35) * (1 - clamp01((t - (INTRO_LAND + 2.5)) / 1.0)),
    hole: open > 0 ? Rmax * (0.05 + 1.55 * open) : 0,
    gloss: Math.pow(k, 0.8)
  };
}

/**
 * Densité de pixels du canevas : au plus 1,5, et au plus ~2,6 millions de
 * pixels calculés par image (un écran 4K ne doit pas faire ramer une carte
 * graphique intégrée ; l'image est floue et douce, la définition ne se voit pas).
 */
export function introCanvasDpr(W: number, H: number, devicePixelRatio: number): number {
  const budget = Math.sqrt(2_600_000 / Math.max(1, W * H));
  return Math.max(0.5, Math.min(devicePixelRatio || 1, 1.5, budget));
}
