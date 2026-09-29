// Démo du générateur de miniatures (29/09/2026) : une illustration dessinée
// (pas une vraie photo, pas de l'IA) qui montre l'idée — une photo terne
// devient une miniature lisible : couleurs vives, sujet détouré, gros titre.
import { useId } from "react";

function Scene({ vivid, uid }: { vivid: boolean; uid: string }) {
  const sky = vivid ? ["#1e3a8a", "#f97316"] : ["#9fb3c8", "#d7dde3"];
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sky-${vivid ? "v" : "m"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
        <radialGradient id={`${uid}-vig`} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${uid}-sky-${vivid ? "v" : "m"})`} />
      <circle cx="238" cy="62" r={vivid ? 24 : 18} fill={vivid ? "#fde047" : "#eef1f4"} opacity={vivid ? 1 : 0.8} />
      <path d="M0 140 L70 70 L120 118 L170 60 L240 128 L280 96 L320 132 L320 180 L0 180 Z" fill={vivid ? "#4c1d95" : "#8a9a8c"} />
      <path d="M0 158 L60 120 L130 150 L200 112 L320 160 L320 180 L0 180 Z" fill={vivid ? "#15803d" : "#a3b1a2"} />
      {/* Randonneur */}
      <g transform="translate(92 96)" fill={vivid ? "#111827" : "#56606b"} stroke={vivid ? "#ffffff" : "none"} strokeWidth={vivid ? 3 : 0} paintOrder="stroke">
        <circle cx="10" cy="4" r="6" />
        <path d="M4 12 h12 l3 22 h-5 l-2 -12 l-2 12 h-5 l2 -12 l-5 10 l-4 -2 Z" />
      </g>
      {vivid && <rect width="320" height="180" fill={`url(#${uid}-vig)`} />}
    </>
  );
}

export function DemoThumbnailPair({ title }: { title: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <figure>
        <figcaption className="mb-1.5 text-center text-xs uppercase tracking-wide text-slate-500">Photo d&apos;origine (illustration)</figcaption>
        <svg viewBox="0 0 320 180" className="aspect-video w-full rounded-xl border border-white/10" role="img" aria-label="Illustration : photo de randonnée en montagne, couleurs ternes">
          <Scene vivid={false} uid={uid} />
        </svg>
      </figure>
      <figure>
        <figcaption className="mb-1.5 text-center text-xs uppercase tracking-wide text-slate-500">Miniature (exemple)</figcaption>
        <svg viewBox="0 0 320 180" className="aspect-video w-full rounded-xl border border-white/10" role="img" aria-label={`Illustration : la même photo en miniature, couleurs vives et titre « ${title} »`}>
          <Scene vivid uid={uid} />
          <text x="170" y="58" fontFamily="Impact, 'Arial Black', sans-serif" fontSize="40" fontWeight="900" fill="#ffffff" stroke="#111827" strokeWidth="6" paintOrder="stroke" textAnchor="middle">
            {title}
          </text>
          <path d="M150 92 C 140 104, 128 110, 118 112" fill="none" stroke="#fde047" strokeWidth="6" strokeLinecap="round" />
          <path d="M112 104 L 116 114 L 126 110" fill="none" stroke="#fde047" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </figure>
    </div>
  );
}
