"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface Spark {
  id: number;
  angle: number;
  distance: number;
  size: number;
  delay: number;
  duration: number;
  emoji: string;
}

const SPARK_EMOJIS = ["✨", "⭐", "💫", "🌟"];

function buildSparks(count: number): Spark[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (360 / count) * i + (Math.random() * 20 - 10),
    distance: 130 + Math.random() * 210,
    size: 10 + Math.random() * 16,
    delay: Math.random() * 0.25,
    duration: 1.1 + Math.random() * 0.6,
    emoji: SPARK_EMOJIS[i % SPARK_EMOJIS.length]
  }));
}

/**
 * Animation d'accueil VIP : explosion d'étincelles dorées plein écran,
 * déclenchée au moment exact où un abonnement PRO/AGENCE vient d'être
 * validé (voir "checkout=success" dans billing/page.tsx, posé par Stripe
 * au retour du Checkout). Rendue via portail pour couvrir tout l'écran
 * indépendamment du scroll, purement décorative (pointer-events-none), et
 * se démonte seule après ~2,2s.
 */
export function PremiumSparkBurst({ onDone }: { onDone?: () => void }) {
  const [sparks] = useState(() => buildSparks(28));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 2200);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0], scale: [0.6, 1.3, 1.7] }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="absolute h-40 w-40 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(247,223,160,0.55), transparent 70%)" }}
          />
          {sparks.map((s) => {
            const rad = (s.angle * Math.PI) / 180;
            const x = Math.cos(rad) * s.distance;
            const y = Math.sin(rad) * s.distance;
            return (
              <motion.span
                key={s.id}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.3, rotate: 0 }}
                animate={{ opacity: [0, 1, 1, 0], x, y, scale: [0.3, 1, 1, 0.6], rotate: 180 }}
                transition={{ duration: s.duration, delay: s.delay, ease: "easeOut" }}
                className="absolute"
                style={{ fontSize: s.size, filter: "drop-shadow(0 0 6px rgba(234,181,52,0.8))" }}
              >
                {s.emoji}
              </motion.span>
            );
          })}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: [0, 1, 1, 0], y: 0 }}
            transition={{ duration: 2, times: [0, 0.15, 0.8, 1] }}
            className="text-gold-shimmer relative font-display text-lg font-semibold"
          >
            Bienvenue parmi les membres Premium ✨
          </motion.p>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
