"use client";

// Intro de création de compte (29/09/2026, maquette validée par Lucas) :
// jouée une seule fois, juste après « Créer mon espace » (register-form.tsx)
// ou à l'arrivée après une inscription Google / Apple / Facebook
// (welcome-intro.tsx). Chargée à la demande (import dynamique, voir
// intro-overlay.tsx) : ni ce code ni le shader ne pèsent sur les autres pages.
//
// Deux couches :
//  - un canevas WebGL plein écran (shader : intro-shader.ts ; calendrier :
//    lib/intro/timeline.ts) — page blanche, puis les anneaux du logo entrent
//    immenses par les bords, déformés et irisés, et se posent ;
//  - par-dessus, le vrai logo en SVG (icône + wordmark « Nebula »), qui prend
//    le relais à l'instant exact où les anneaux se posent.
// Son synthétisé en direct (lib/intro/sound.ts). Préférence « réduire les
// animations » ou WebGL indisponible : logo affiché simplement, en fondu.
// Échap passe l'intro.

import { useEffect, useId, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { INTRO_DURATION, INTRO_STATIC_DURATION, introCanvasDpr, introFrame } from "@/lib/intro/timeline";
import { playIntroSound } from "@/lib/intro/sound";
import { unlockIntroAudio } from "@/lib/intro/audio-unlock";
import { INTRO_FRAGMENT_SHADER, INTRO_VERTEX_SHADER } from "./intro-shader";
import styles from "./account-intro.module.css";

const UNIFORMS = ["uRes", "uDpr", "uTime", "uS", "uAng", "uWarp", "uAb", "uRingA", "uBlobR", "uBlobA", "uHole", "uGloss"] as const;
type Uniform = (typeof UNIFORMS)[number];

interface AccountIntroProps {
  /**
   * Contexte audio débloqué pendant le clic de l'utilisateur. `undefined` :
   * l'intro en crée un elle-même (il restera muet si le navigateur l'exige).
   */
  audio?: AudioContext | null;
  /** Appelé une seule fois, à la fin de l'intro (ou quand on la passe). */
  onDone: () => void;
}

export default function AccountIntro({ audio, onDone }: AccountIntroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const audioRef = useRef(audio);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ringId = `${uid}-ring`;
  const wordId = `${uid}-word`;

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };

    // --- WebGL -----------------------------------------------------------
    let gl: WebGLRenderingContext | null = null;
    const loc = {} as Record<Uniform, WebGLUniformLocation | null>;
    let dpr = 1;
    let ok = false;
    if (!prefersReducedMotion()) {
      try {
        gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" });
        if (gl) {
          const g = gl;
          const compile = (type: number, src: string) => {
            const s = g.createShader(type);
            if (!s) throw new Error("shader");
            g.shaderSource(s, src);
            g.compileShader(s);
            if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? "shader");
            return s;
          };
          const prog = g.createProgram();
          if (!prog) throw new Error("program");
          g.attachShader(prog, compile(g.VERTEX_SHADER, INTRO_VERTEX_SHADER));
          g.attachShader(prog, compile(g.FRAGMENT_SHADER, INTRO_FRAGMENT_SHADER));
          g.linkProgram(prog);
          if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog) ?? "link");
          g.useProgram(prog);
          // Un seul triangle qui couvre tout l'écran.
          const buf = g.createBuffer();
          g.bindBuffer(g.ARRAY_BUFFER, buf);
          g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
          const a = g.getAttribLocation(prog, "p");
          g.enableVertexAttribArray(a);
          g.vertexAttribPointer(a, 2, g.FLOAT, false, 0, 0);
          for (const n of UNIFORMS) loc[n] = g.getUniformLocation(prog, n);
          ok = true;
        }
      } catch {
        ok = false;
      }
    }

    const size = () => ({ W: root.clientWidth || window.innerWidth, H: root.clientHeight || window.innerHeight });
    const resize = () => {
      if (!gl) return;
      const { W, H } = size();
      dpr = introCanvasDpr(W, H, window.devicePixelRatio);
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (t: number) => {
      if (!gl || !ok) return;
      const { W, H } = size();
      const p = introFrame(t, W, H);
      gl.uniform2f(loc.uRes, canvas.width, canvas.height);
      gl.uniform1f(loc.uDpr, dpr);
      gl.uniform1f(loc.uTime, t);
      gl.uniform1f(loc.uS, p.S);
      gl.uniform1f(loc.uAng, p.ang);
      gl.uniform1f(loc.uWarp, p.warp);
      gl.uniform1f(loc.uAb, p.ab);
      gl.uniform1f(loc.uRingA, p.ringA);
      gl.uniform1f(loc.uBlobR, p.blobR);
      gl.uniform1f(loc.uBlobA, p.blobA);
      gl.uniform1f(loc.uHole, p.hole);
      gl.uniform1f(loc.uGloss, p.gloss);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // Carte graphique perdue en cours de route : on arrête de dessiner, le
    // fond blanc et le logo SVG suffisent.
    const onLost = (e: Event) => {
      e.preventDefault();
      ok = false;
      canvas.style.visibility = "hidden";
    };
    canvas.addEventListener("webglcontextlost", onLost);

    // --- Lecture -----------------------------------------------------------
    if (ok) {
      resize();
      draw(0);
      root.classList.add(styles.play);
    } else {
      root.classList.add(styles.static);
    }

    let ownAudio: AudioContext | null = null;
    let ctx = audioRef.current;
    if (ctx === undefined) ctx = ownAudio = unlockIntroAudio();
    if (ctx) {
      try {
        playIntroSound(ctx, ok ? "full" : "static");
      } catch {
        /* le son n'est qu'un agrément */
      }
    }

    let raf = 0;
    let t0 = 0;
    let lastT = 0;
    const duration = ok ? INTRO_DURATION : INTRO_STATIC_DURATION;
    const loop = (now: number) => {
      if (!t0) t0 = now;
      lastT = Math.min((now - t0) / 1000, duration);
      draw(lastT);
      if (lastT < duration) raf = requestAnimationFrame(loop);
    };
    if (ok) raf = requestAnimationFrame(loop);
    const timer = window.setTimeout(finish, duration * 1000);

    const onResize = () => {
      resize();
      draw(lastT);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    root.focus({ preventScroll: true });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("webglcontextlost", onLost);
      // Libère la carte graphique tout de suite (sans attendre le ramasse-miettes).
      if (gl) gl.getExtension("WEBGL_lose_context")?.loseContext();
      // Laisse finir la traîne de réverbération avant de fermer le son.
      if (ownAudio) {
        const a = ownAudio;
        window.setTimeout(() => void a.close().catch(() => undefined), 3000);
      }
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.root} role="dialog" aria-modal="true" aria-label="Création de votre espace Nebula" tabIndex={-1}>
      <canvas ref={canvasRef} className={styles.fx} aria-hidden="true" />
      <div className={styles.stage}>
        <div className={styles.core} aria-hidden="true" />
        <div className={styles.lockup}>
          <div className={styles.icon} aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <defs>
                <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#5fe0f0" />
                  <stop offset="0.35" stopColor="#7a95ff" />
                  <stop offset="0.6" stopColor="#a066ff" />
                  <stop offset="1" stopColor="#f062d0" />
                </linearGradient>
              </defs>
              <g className={styles.rings} fill="none" stroke={`url(#${ringId})`} strokeWidth="3.4">
                <ellipse cx="16" cy="16" rx="14.3" ry="6.4" />
                <ellipse cx="16" cy="16" rx="14.3" ry="6.4" transform="rotate(60 16 16)" />
                <ellipse cx="16" cy="16" rx="14.3" ry="6.4" transform="rotate(120 16 16)" />
              </g>
              <path className={styles.star} d="M16 9 Q17.8 14.2 23 16 Q17.8 17.8 16 23 Q14.2 17.8 9 16 Q14.2 14.2 16 9Z" />
            </svg>
          </div>

          {/* Wordmark du site (sans l'étoile du N), dégradé du mode clair. */}
          <svg className={styles.word} viewBox="0 0 650 230" role="img" aria-label="Nebula">
            <defs>
              <linearGradient id={wordId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="640" y2="0">
                <stop offset="0" stopColor="#2f8f9f" />
                <stop offset="0.35" stopColor="#5a6fd6" />
                <stop offset="0.6" stopColor="#7d4fd6" />
                <stop offset="1" stopColor="#c24aa9" />
              </linearGradient>
            </defs>
            <g fill={`url(#${wordId})`} stroke={`url(#${wordId})`}>
              <g className={styles.letter} style={letterDelay(0)}>
                <path stroke="none" d="M12,210 C8,158 3,92 15,42 C18,30 21,21 23,15 C27,23 31,36 29,61 C25,121 27,170 31,210 Z" />
                <path stroke="none" d="M104,210 C100,158 95,92 107,42 C110,30 113,21 115,15 C119,23 123,36 121,61 C117,121 119,170 123,210 Z" />
                <path stroke="none" d="M25,48 L118,203 L108,209 L17,55 Z" />
              </g>
              <g className={styles.letter} style={letterDelay(1)}>
                <path fill="none" strokeWidth="13" strokeLinecap="round" d="M250.2,173 A48,48 0 1,1 250.2,147" />
                <path fill="none" strokeWidth="11" strokeLinecap="round" d="M160,159.5 L252.2,160.5" />
              </g>
              <g className={styles.letter} style={letterDelay(2)}>
                <path stroke="none" d="M267,210 L267,100 C267,60 270,30 274,15 C278,30 281,60 281,100 L281,210 Z" />
                <ellipse fill="none" strokeWidth="13" cx="311" cy="172" rx="31" ry="38" />
              </g>
              <g className={styles.letter} style={letterDelay(3)}>
                <path fill="none" strokeWidth="13" strokeLinecap="round" d="M379,108 L379,172 A34,34 0 0 0 447,172 L447,108" />
              </g>
              <g className={styles.letter} style={letterDelay(4)}>
                <path stroke="none" d="M474,210 C471,158 467,92 478,42 C481,30 484,21 486,15 C490,23 494,36 492,61 C488,121 490,170 494,210 Z" />
              </g>
              <g className={styles.letter} style={letterDelay(5)}>
                <path fill="none" strokeWidth="13" strokeLinecap="round" d="M580,207 C550,212 526,196 526,168 C526,138 552,110 578,110 C596,110 606,124 606,144 L606,207 M606,150 C606,180 612,200 628,206" />
              </g>
            </g>
          </svg>
        </div>
        <p className={styles.status} aria-live="polite">
          Préparation de votre espace…
        </p>
      </div>
    </div>
  );
}

function letterDelay(i: number): React.CSSProperties {
  return { "--i": i } as React.CSSProperties;
}
