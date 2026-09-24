"use client";

// Logo officiel Nebula — version R4 (nouvelle identité, 24/09/2026) : trois
// anneaux épais à 60° + étoile à quatre branches courbes, sans marge, en SVG
// vivant. Même dessin que la favicon (src/app/icon.svg).
//
// Couleurs : jamais de hex en dur — le dégradé de chaque anneau (cyan → bleu
// → violet → rose) passe par les variables --c-accent-cyan / -blue / -violet
// / -magenta, que src/lib/themes.ts réécrit sur <html> pour chaque thème. Le
// logo suit donc le thème choisi dans Paramètres ; avec le thème par défaut,
// ce sont exactement les couleurs de la marque.
//
// Animation discrète (choix du 24/09/2026) : les anneaux tournent d'un bloc,
// très lentement (la forme reste identique à la favicon), et l'étoile
// scintille à peine. Animations CSS (voir .nb-logo-* dans globals.css) et
// non plus SMIL : la règle prefers-reduced-motion de globals.css les coupe.
//
// Étoile : blanche sur fond sombre, violette en mode clair (comme la
// favicon). tone="onDark" force l'étoile blanche quand le logo est posé sur
// un fond qui reste sombre même en mode clair (bouton de l'assistant,
// superpositions, maquettes du site).
import { useId } from "react";

const STOPS = [
  { offset: "0", color: "var(--nb-logo-1)" },
  { offset: "0.35", color: "var(--nb-logo-2)" },
  { offset: "0.6", color: "var(--nb-logo-3)" },
  { offset: "1", color: "var(--nb-logo-4)" }
] as const;

// Décalages horizontaux des lettres du wordmark (translate des groupes e, b,
// u, l, a ; 0 pour le N).
const LETTER_OFFSETS = [0, 150, 258, 365, 470, 516] as const;

const STAR_PATH = "M16 9 Q17.8 14.2 23 16 Q17.8 17.8 16 23 Q14.2 17.8 9 16 Q14.2 14.2 16 9Z";

const WORD_STARS = [
  { cx: 42, cy: 60, r: 1.1, dur: 2.4, delay: -0.6 },
  { cx: 96, cy: 150, r: 0.9, dur: 3.1, delay: -1.8 },
  { cx: 138, cy: 40, r: 1.2, dur: 2.7, delay: -0.2 },
  { cx: 175, cy: 160, r: 0.8, dur: 3.4, delay: -2.4 },
  { cx: 210, cy: 70, r: 1, dur: 2.2, delay: -1.1 },
  { cx: 300, cy: 45, r: 1.1, dur: 3, delay: -0.9 },
  { cx: 330, cy: 175, r: 0.9, dur: 2.6, delay: -2 },
  { cx: 400, cy: 55, r: 1, dur: 3.3, delay: -1.4 },
  { cx: 460, cy: 150, r: 0.8, dur: 2.8, delay: -0.4 },
  { cx: 560, cy: 60, r: 1.1, dur: 2.5, delay: -1.7 },
  { cx: 600, cy: 165, r: 0.9, dur: 3.2, delay: -0.8 }
] as const;

type Tone = "auto" | "onDark";

function GradientStops() {
  return (
    <>
      {STOPS.map((s) => (
        <stop key={s.offset} offset={s.offset} style={{ stopColor: s.color }} />
      ))}
    </>
  );
}

interface NebulaIconProps {
  className?: string;
  /** Hauteur/largeur de l'icône, en px. */
  size?: number;
  tone?: Tone;
}

// Icône seule (anneaux + étoile), là où le logo complet ne tient pas : bulle
// du menu latéral, assistant IA, superpositions, badge « Propulsé par ».
export function NebulaIcon({ className = "", size = 32, tone = "auto" }: NebulaIconProps) {
  const id = useId().replace(/:/g, "");
  const grad = `nbi-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={`nb-logo shrink-0 ${tone === "onDark" ? "nb-logo--on-dark" : ""} ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="0">
          <GradientStops />
        </linearGradient>
      </defs>
      <g className="nb-logo-rings" fill="none" stroke={`url(#${grad})`} strokeWidth="3.4">
        <ellipse cx="16" cy="16" rx="14.3" ry="6.4" />
        <ellipse cx="16" cy="16" rx="14.3" ry="6.4" transform="rotate(60 16 16)" />
        <ellipse cx="16" cy="16" rx="14.3" ry="6.4" transform="rotate(120 16 16)" />
      </g>
      <path className="nb-logo-star" d={STAR_PATH} />
    </svg>
  );
}

interface NebulaBrandMarkProps {
  className?: string;
  /** Hauteur de l'icône, en px. */
  iconSize?: number;
  /** Hauteur du wordmark "Nebula", en px — sa largeur suit proportionnellement. */
  wordHeight?: number;
  tone?: Tone;
}

export function NebulaBrandMark({ className = "", iconSize = 32, wordHeight = 30, tone = "auto" }: NebulaBrandMarkProps) {
  const id = useId().replace(/:/g, "");
  // Un seul dégradé sur tout le mot (cyan sur le N → rose sur le a) : les
  // lettres sont décalées par translate(), qui décale aussi l'espace de
  // coordonnées d'un dégradé userSpaceOnUse — d'où un dégradé par décalage,
  // compensé pour couvrir toujours les x 0 → 640 du mot entier.
  const fillAt = (dx: number) => `url(#nbw-${id}-${dx})`;
  const fill = fillAt(0);
  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <NebulaIcon size={iconSize} tone={tone} />

      <svg
        height={wordHeight}
        viewBox="0 0 650 230"
        preserveAspectRatio="xMinYMid meet"
        aria-label="Nebula"
        role="img"
        className={`nb-word ${tone === "onDark" ? "nb-logo--on-dark" : ""}`}
      >
        <defs>
          {LETTER_OFFSETS.map((dx) => (
            <linearGradient key={dx} id={`nbw-${id}-${dx}`} gradientUnits="userSpaceOnUse" x1={-dx} y1="0" x2={640 - dx} y2="0">
              <GradientStops />
            </linearGradient>
          ))}
        </defs>

        {/* N : deux lames pointues + diagonale, étoile dans le creux */}
        <g>
          <path fill={fill} d="M12,210 C8,158 3,92 15,42 C18,30 21,21 23,15 C27,23 31,36 29,61 C25,121 27,170 31,210 Z" />
          <path fill={fill} d="M104,210 C100,158 95,92 107,42 C110,30 113,21 115,15 C119,23 123,36 121,61 C117,121 119,170 123,210 Z" />
          <path fill={fill} d="M25,48 L118,203 L108,209 L17,55 Z" />
          <path className="nb-word-spark" d="M67,92 Q70,113 90,116 Q70,119 67,140 Q64,119 44,116 Q64,113 67,92Z" />
        </g>

        {/* e : cercle ouvert (arc propre) + barre horizontale */}
        <g transform="translate(150,0)">
          <path fill="none" stroke={fillAt(150)} strokeWidth="13" strokeLinecap="round" d="M100.2,173 A48,48 0 1,1 100.2,147" />
          {/* Légère pente (159.5→160.5) gardée par prudence : avec un dégradé
              en objectBoundingBox, une ligne parfaitement horizontale (boîte de
              hauteur nulle) devenait invisible dans Chrome. */}
          <path fill="none" stroke={fillAt(150)} strokeWidth="11" strokeLinecap="round" d="M10,159.5 L102.2,160.5" />
        </g>

        {/* b : pointe fine en haut, tige droite en bas, bulbe attaché proprement */}
        <g transform="translate(258,0)">
          <path fill={fillAt(258)} d="M9,210 L9,100 C9,60 12,30 16,15 C20,30 23,60 23,100 L23,210 Z" />
          <ellipse cx="53" cy="172" rx="31" ry="38" fill="none" stroke={fillAt(258)} strokeWidth="13" />
        </g>

        {/* u : descente droite, courbe basse franche, remontée droite */}
        <g transform="translate(365,0)">
          <path fill="none" stroke={fillAt(365)} strokeWidth="13" strokeLinecap="round" d="M14,108 L14,172 A34,34 0 0 0 82,172 L82,108" />
        </g>

        {/* l : lame pointue simple */}
        <g transform="translate(470,0)">
          <path fill={fillAt(470)} d="M4,210 C1,158 -3,92 8,42 C11,30 14,21 16,15 C20,23 24,36 22,61 C18,121 20,170 24,210 Z" />
        </g>

        {/* a */}
        <g transform="translate(516,0)">
          <path
            fill="none"
            stroke={fillAt(516)}
            strokeWidth="13"
            strokeLinecap="round"
            d="M64,207 C34,212 10,196 10,168 C10,138 36,110 62,110 C80,110 90,124 90,144 L90,207 M90,150 C90,180 96,200 112,206"
          />
        </g>

        {/* léger semis d'étoiles scintillantes dans le mot (sombre uniquement) */}
        <g className="nb-word-stars">
          {WORD_STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              className="nb-word-star"
              style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
