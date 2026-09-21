"use client";

// Logo officiel Nebula (icône anneaux + étincelle, wordmark stylisé) en SVG
// vivant — pas une image statique. Tout est animé en boucle parfaite
// (rotation pure et scintillement synchronisé sur opacité=0 au reset), donc
// aucun raccord visible n'apparaît jamais. Positions des étoiles/particules
// codées en dur (pas de Math.random() au rendu) pour éviter tout mismatch
// d'hydratation SSR/client.
//
// Couleurs : jamais de hex en dur — tout passe par var(--c-accent-violet/
// -magenta/-cyan), les mêmes variables que src/lib/themes.ts réécrit sur
// <html> pour chaque thème (voir Paramètres). Le logo suit donc automatique-
// ment le thème choisi, sans code spécifique par thème.
const V = "rgb(var(--c-accent-violet))";
const M = "rgb(var(--c-accent-magenta))";
const C = "rgb(var(--c-accent-cyan))";

const WORD_STARS = [
  { cx: 42, cy: 60, r: 1.1, dur: 2.4, delay: -0.6 },
  { cx: 96, cy: 150, r: 0.9, dur: 3.1, delay: -1.8 },
  { cx: 138, cy: 40, r: 1.2, dur: 2.7, delay: -0.2 },
  { cx: 175, cy: 160, r: 0.8, dur: 3.4, delay: -2.4 },
  { cx: 210, cy: 70, r: 1, dur: 2.2, delay: -1.1 },
  { cx: 300, cy: 45, r: 1.1, dur: 3, delay: -0.9 },
  { cx: 330, cy: 175, r: 0.9, dur: 2.6, delay: -2, },
  { cx: 400, cy: 55, r: 1, dur: 3.3, delay: -1.4 },
  { cx: 460, cy: 150, r: 0.8, dur: 2.8, delay: -0.4 },
  { cx: 560, cy: 60, r: 1.1, dur: 2.5, delay: -1.7 },
  { cx: 600, cy: 165, r: 0.9, dur: 3.2, delay: -0.8 }
] as const;

interface NebulaBrandMarkProps {
  className?: string;
  /** Hauteur de l'icône (anneaux + étincelle), en px. */
  iconSize?: number;
  /** Hauteur du wordmark "Nebula", en px — sa largeur suit proportionnellement. */
  wordHeight?: number;
}

export function NebulaBrandMark({ className = "", iconSize = 32, wordHeight = 30 }: NebulaBrandMarkProps) {
  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 120 120" className="shrink-0" aria-hidden>
        <defs>
          <radialGradient id="nbm-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={V} stopOpacity="0.35" />
            <stop offset="1" stopColor={V} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="nbm-ring1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={V} />
            <stop offset="1" stopColor={C} />
          </linearGradient>
          <linearGradient id="nbm-ring2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={M} />
            <stop offset="1" stopColor={V} />
          </linearGradient>
          <linearGradient id="nbm-ring3" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={C} />
            <stop offset="1" stopColor={M} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="50" fill="url(#nbm-halo)" />
        <g strokeWidth="6" fill="none" strokeLinecap="round">
          <g>
            <ellipse cx="60" cy="60" rx="34" ry="20" stroke="url(#nbm-ring1)" opacity="0.9" transform="rotate(0 60 60)" />
            <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="10s" repeatCount="indefinite" />
          </g>
          <g>
            <ellipse cx="60" cy="60" rx="34" ry="20" stroke="url(#nbm-ring2)" opacity="0.85" transform="rotate(60 60 60)" />
            <animateTransform attributeName="transform" type="rotate" from="60 60 60" to="420 60 60" dur="13s" repeatCount="indefinite" />
          </g>
          <g>
            <ellipse cx="60" cy="60" rx="34" ry="20" stroke="url(#nbm-ring3)" opacity="0.85" transform="rotate(120 60 60)" />
            <animateTransform attributeName="transform" type="rotate" from="120 60 60" to="-240 60 60" dur="16s" repeatCount="indefinite" />
          </g>
        </g>
        <path
          d="M60,42 L64,56 L78,60 L64,64 L60,78 L56,64 L42,60 L56,56 Z"
          fill="#ffffff"
          style={{ filter: `drop-shadow(0 0 8px ${V})` }}
        >
          <animate attributeName="opacity" values="0.85;1;0.85" dur="2.6s" repeatCount="indefinite" />
        </path>
      </svg>

      <svg
        height={wordHeight}
        viewBox="0 0 650 230"
        preserveAspectRatio="xMinYMid meet"
        aria-label="Nebula"
        role="img"
        style={{ filter: `drop-shadow(0 0 14px ${V})` }}
      >
        <defs>
          <linearGradient id="nbm-wgrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={V} />
            <stop offset="0.5" stopColor={M} />
            <stop offset="1" stopColor={C} />
          </linearGradient>
        </defs>

        {/* N : deux lames pointues + diagonale, étincelle dans le creux */}
        <g transform="translate(0,0)">
          <path fill="url(#nbm-wgrad)" d="M12,210 C8,158 3,92 15,42 C18,30 21,21 23,15 C27,23 31,36 29,61 C25,121 27,170 31,210 Z" />
          <path fill="url(#nbm-wgrad)" d="M104,210 C100,158 95,92 107,42 C110,30 113,21 115,15 C119,23 123,36 121,61 C117,121 119,170 123,210 Z" />
          <path fill="url(#nbm-wgrad)" d="M25,48 L118,203 L108,209 L17,55 Z" />
          <path
            d="M67,92 L72,110 L90,116 L72,122 L67,140 L62,122 L44,116 L62,110 Z"
            fill="#ffffff"
            style={{ filter: `drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 12px ${V})` }}
          >
            <animate attributeName="opacity" values="0.7;1;0.7" dur="2.3s" repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="rotate" from="0 67 116" to="360 67 116" dur="18s" repeatCount="indefinite" additive="sum" />
          </path>
        </g>

        {/* e : cercle ouvert (arc propre) + barre horizontale */}
        <g transform="translate(150,0)">
          <path
            fill="none" stroke="url(#nbm-wgrad)" strokeWidth="13" strokeLinecap="round"
            d="M100.2,173 A48,48 0 1,1 100.2,147"
          />
          {/* Légère pente (159.5→160.5) volontaire : une ligne parfaitement
              horizontale a une bounding box de hauteur nulle, ce qui fait que
              Chrome n'applique pas le dégradé (objectBoundingBox) dessus et
              la barre devient invisible. */}
          <path fill="none" stroke="url(#nbm-wgrad)" strokeWidth="11" strokeLinecap="round" d="M10,159.5 L102.2,160.5" />
        </g>

        {/* b : pointe fine en haut, tige droite en bas, bulbe attaché proprement */}
        <g transform="translate(258,0)">
          <path fill="url(#nbm-wgrad)" d="M9,210 L9,100 C9,60 12,30 16,15 C20,30 23,60 23,100 L23,210 Z" />
          <ellipse cx="53" cy="172" rx="31" ry="38" fill="none" stroke="url(#nbm-wgrad)" strokeWidth="13" />
        </g>

        {/* u : descente droite, courbe basse franche, remontée droite */}
        <g transform="translate(365,0)">
          <path
            fill="none" stroke="url(#nbm-wgrad)" strokeWidth="13" strokeLinecap="round"
            d="M14,108 L14,172 A34,34 0 0 0 82,172 L82,108"
          />
        </g>

        {/* l : lame pointue simple */}
        <g transform="translate(470,0)">
          <path fill="url(#nbm-wgrad)" d="M4,210 C1,158 -3,92 8,42 C11,30 14,21 16,15 C20,23 24,36 22,61 C18,121 20,170 24,210 Z" />
        </g>

        {/* a */}
        <g transform="translate(516,0)">
          <path
            fill="none" stroke="url(#nbm-wgrad)" strokeWidth="13" strokeLinecap="round"
            d="M64,207 C34,212 10,196 10,168 C10,138 36,110 62,110 C80,110 90,124 90,144 L90,207 M90,150 C90,180 96,200 112,206"
          />
        </g>

        {/* léger semis d'étoiles scintillantes dans le mot */}
        <g>
          {WORD_STARS.map((s, i) => (
            <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#ffffff">
              <animate
                attributeName="opacity"
                values="0.2;0.9;0.2"
                dur={`${s.dur}s`}
                begin={`${s.delay}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </g>
      </svg>
    </div>
  );
}
