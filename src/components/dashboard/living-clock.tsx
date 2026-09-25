"use client";

// Widget inédit "Horloge vivante" — remplace une simple ligne de texte
// ("créneau optimal : 18h") par un cadran radial de 24 heures qui pulse à
// l'endroit précis de votre meilleur créneau réel, avec l'aiguille de
// l'heure actuelle qui tourne en direct. L'idée : rendre une recommandation
// abstraite immédiatement lisible d'un coup d'œil, comme un vrai instrument
// de cockpit plutôt qu'une phrase.

import { m as motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MotionRoot } from "@/components/motion/motion-root";

const SIZE = 96;
const CENTER = SIZE / 2;
const RADIUS = 38;
const TICK_RADIUS = 44;

function polar(hourFraction: number, radius: number) {
  // 0h en haut (comme une horloge), sens horaire.
  const angle = (hourFraction / 24) * Math.PI * 2 - Math.PI / 2;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

export function LivingClock({
  bestHour,
  color,
  hasEnoughData
}: {
  bestHour: number | null;
  color: string;
  hasEnoughData: boolean;
}) {
  // Heure du navigateur, lue après le montage (lot 10) : le cadran peut être
  // rendu par le serveur, dont l'horloge est en UTC.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const handTip = now ? polar(now.getHours() + now.getMinutes() / 60, RADIUS - 6) : null;
  const bestPos = bestHour !== null ? polar(bestHour, TICK_RADIUS) : null;

  return (
    <MotionRoot>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {Array.from({ length: 24 }, (_, h) => {
          const p1 = polar(h, TICK_RADIUS - 3);
          const p2 = polar(h, TICK_RADIUS);
          const isMajor = h % 6 === 0;
          return (
            <line
              key={h}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={isMajor ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)"}
              strokeWidth={isMajor ? 1.5 : 1}
            />
          );
        })}

        {hasEnoughData && bestPos && (
          <motion.circle
            cx={bestPos.x}
            cy={bestPos.y}
            r={4}
            fill={color}
            animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.35, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        )}

        {/* Aiguille de l'heure actuelle — repère visuel, tourne en direct. */}
        {handTip && <line x1={CENTER} y1={CENTER} x2={handTip.x} y2={handTip.y} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} strokeLinecap="round" />}
        <circle cx={CENTER} cy={CENTER} r={2} fill="rgba(255,255,255,0.7)" />
      </svg>
    </MotionRoot>
  );
}
