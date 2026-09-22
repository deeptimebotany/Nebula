"use client";

// Mini-jeu façon "dinosaure" de Chrome hors-ligne, qui apparaît tout seul
// quand une opération met du temps (analyse IA, export, upload...) : plutôt
// que de regarder un spinner tourner, on peut sauter des astéroïdes en
// attendant. N'apparaît que si le chargement dépasse `delayMs` (par défaut
// 2,5s) — pour ne jamais flasher sur un chargement rapide — et disparaît
// automatiquement dès que `active` repasse à false.
//
// Usage : <LoadingMiniGame active={analyzing} /> quelque part près du
// spinner/bouton concerné. Le meilleur score est mémorisé en localStorage
// (partagé entre tous les usages du composant sur le site).

import { useEffect, useRef, useState } from "react";

const BEST_SCORE_KEY = "nebula:minigame-best";

const CANVAS_HEIGHT = 140;
const GROUND_Y = CANVAS_HEIGHT - 24;
const GRAVITY = 0.0022; // px/ms²
const JUMP_VELOCITY = -0.62; // px/ms
const PLAYER_SIZE = 22;
const PLAYER_X = 36;

interface Obstacle {
  x: number;
  width: number;
  height: number;
  passed: boolean;
}

function readBestScore(): number {
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeBestScore(score: number) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // stockage indisponible — le record ne sera juste pas retenu
  }
}

export function LoadingMiniGame({
  active,
  delayMs = 2500,
  label = "En attendant, un petit jeu ? Espace ou clic pour sauter."
}: {
  active: boolean;
  delayMs?: number;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const wasVisible = useRef(false);

  // N'affiche le jeu que si le chargement dure vraiment — évite de le faire
  // apparaître puis disparaître aussitôt sur une opération rapide.
  useEffect(() => {
    if (!active) {
      if (wasVisible.current) setJustFinished(true);
      setVisible(false);
      wasVisible.current = false;
      const t = window.setTimeout(() => setJustFinished(false), 1600);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setVisible(true);
      wasVisible.current = true;
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [active, delayMs]);

  useEffect(() => {
    setBest(readBestScore());
  }, []);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    // Type explicite (plutôt que de compter sur le rétrécissement de type de
    // TypeScript) : `ctx` est utilisé dans des fonctions imbriquées
    // (tick/resize/handlers), et TypeScript ne conserve pas le
    // rétrécissement d'un `if (!x) return` à travers une frontière de
    // fermeture — sans ça, le build Next.js échoue avec "ctx is possibly
    // null" malgré ce contrôle.
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 480;
    canvas.width = width * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let playerY = GROUND_Y - PLAYER_SIZE;
    let velocity = 0;
    let jumping = false;
    let obstacles: Obstacle[] = [];
    let speed = 0.16; // px/ms, augmente avec le temps
    let elapsed = 0;
    let sinceLastSpawn = 0;
    let nextSpawnIn = 900 + Math.random() * 700;
    let gameOver = false;
    let restartAt = 0;
    let localScore = 0;
    let lastDisplayedScore = -1;

    function jump() {
      if (gameOver || jumping) return;
      jumping = true;
      velocity = JUMP_VELOCITY;
    }

    function resetGame() {
      playerY = GROUND_Y - PLAYER_SIZE;
      velocity = 0;
      jumping = false;
      obstacles = [];
      speed = 0.16;
      elapsed = 0;
      sinceLastSpawn = 0;
      nextSpawnIn = 900 + Math.random() * 700;
      gameOver = false;
      localScore = 0;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" || e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        if (gameOver) return;
        jump();
      }
    }
    function onPointerDown() {
      if (gameOver) return;
      jump();
    }

    window.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("pointerdown", onPointerDown);

    let lastTime = performance.now();

    function tick(now: number) {
      const dt = Math.min(now - lastTime, 40);
      lastTime = now;

      if (!gameOver) {
        elapsed += dt;
        localScore = Math.floor(elapsed / 100);
        if (localScore !== lastDisplayedScore) {
          lastDisplayedScore = localScore;
          setScore(localScore);
        }

        // Vitesse et fréquence d'apparition augmentent doucement avec le
        // temps — le jeu se corse tant que le chargement traîne.
        speed = 0.16 + Math.min(elapsed / 20000, 0.22);

        velocity += GRAVITY * dt;
        playerY += velocity * dt;
        if (playerY >= GROUND_Y - PLAYER_SIZE) {
          playerY = GROUND_Y - PLAYER_SIZE;
          velocity = 0;
          jumping = false;
        }

        sinceLastSpawn += dt;
        if (sinceLastSpawn >= nextSpawnIn) {
          sinceLastSpawn = 0;
          nextSpawnIn = Math.max(500, 900 - elapsed / 60) + Math.random() * 500;
          const height = 16 + Math.random() * 18;
          obstacles.push({ x: width + 10, width: 12 + Math.random() * 10, height, passed: false });
        }

        for (const o of obstacles) {
          o.x -= speed * dt;
        }
        obstacles = obstacles.filter((o) => o.x + o.width > -10);

        const playerBox = { x: PLAYER_X, y: playerY, w: PLAYER_SIZE, h: PLAYER_SIZE };
        for (const o of obstacles) {
          const obstacleBox = { x: o.x, y: GROUND_Y - o.height, w: o.width, h: o.height };
          const collide =
            playerBox.x < obstacleBox.x + obstacleBox.w &&
            playerBox.x + playerBox.w > obstacleBox.x &&
            playerBox.y < obstacleBox.y + obstacleBox.h &&
            playerBox.y + playerBox.h > obstacleBox.y;
          if (collide) {
            gameOver = true;
            restartAt = now + 1300;
            const finalBest = Math.max(readBestScore(), localScore);
            writeBestScore(finalBest);
            setBest(finalBest);
          }
        }
      } else if (now >= restartAt) {
        resetGame();
      }

      // --- Dessin ---
      ctx.clearRect(0, 0, width, CANVAS_HEIGHT);

      // Sol.
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 1);
      ctx.lineTo(width, GROUND_Y + 1);
      ctx.stroke();

      // Vaisseau (joueur).
      ctx.font = `${PLAYER_SIZE}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText("🚀", PLAYER_X - 2, playerY - 2);

      // Astéroïdes.
      ctx.font = "16px sans-serif";
      for (const o of obstacles) {
        ctx.save();
        ctx.translate(o.x + o.width / 2, GROUND_Y - o.height / 2);
        ctx.font = `${Math.max(12, o.height)}px sans-serif`;
        ctx.fillText("☄️", -o.width / 2 - 2, -o.height / 2);
        ctx.restore();
      }

      if (gameOver) {
        ctx.fillStyle = "rgba(2,4,10,0.55)";
        ctx.fillRect(0, 0, width, CANVAS_HEIGHT);
        ctx.fillStyle = "#eaf0ff";
        ctx.font = "13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("💥 Collision — nouvelle partie...", width / 2, CANVAS_HEIGHT / 2);
        ctx.textAlign = "left";
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible]);

  if (!visible) {
    if (!justFinished) return null;
    return <p className="mt-3 text-xs text-emerald-400">✅ Chargement terminé — fin de partie !</p>;
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-2">
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span>
          Score {score} · Record {best}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full cursor-pointer rounded-lg bg-black/20"
        style={{ height: CANVAS_HEIGHT }}
      />
    </div>
  );
}
