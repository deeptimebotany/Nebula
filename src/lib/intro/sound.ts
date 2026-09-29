// Son de l'intro de création de compte : synthétisé en direct avec Web Audio
// (aucun fichier audio), calé sur le calendrier de timeline.ts.
//
// Le contexte audio est créé au clic sur « Créer mon espace » (voir
// audio-unlock.ts), puis transmis à l'intro qui joue quand le compte est créé.

import { INTRO_LAND } from "@/lib/intro/timeline";

/** Joue le son de l'intro (`full`) ou sa version courte sans mouvement (`static`). */
export function playIntroSound(ctx: AudioContext, mode: "full" | "static"): void {
  // Contexte encore bloqué par le navigateur : on ne programme rien (sinon
  // tout se jouerait d'un coup, en retard, au premier clic).
  if (ctx.state !== "running") return;

  const comp = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  master.gain.value = 0.85;
  // Réverbération douce (réponse impulsionnelle calculée : bruit qui décroît).
  const rev = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 3);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  rev.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  master.connect(comp);
  master.connect(rev);
  rev.connect(wet);
  wet.connect(comp);
  comp.connect(ctx.destination);

  const noise = (sec: number) => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };
  // Souffle filtré qui balaie les fréquences.
  const air = (t: number, dur: number, from: number, to: number, peakAt: number, level: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise(dur);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + dur * peakAt);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur);
  };
  // Grave qui monte : la « lentille » qui se referme.
  const sub = (t: number, dur: number, from: number, to: number, level: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur);
  };
  // Impact doux quand les anneaux se posent.
  const bloom = (t: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(98, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 1.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 1.5);
  };
  // Nappe (accord qui s'ouvre).
  const pad = (t: number, dur: number, freqs: number[], level: number) => {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.6;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + dur * 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 1.2);
    g.gain.setValueAtTime(level, t + dur - 1.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(master);
    for (const fr of freqs) {
      for (const det of [-8, 0, 8]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = fr;
        o.detune.value = det;
        const v = ctx.createGain();
        v.gain.value = 0.45 / freqs.length;
        o.connect(v);
        v.connect(f);
        o.start(t);
        o.stop(t + dur);
      }
    }
  };
  // Clochette (une par lettre de « Nebula »).
  const chime = (t: number, freq: number, level: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    for (const [m, v] of [
      [1, 1],
      [2.01, 0.22],
      [3.02, 0.08]
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * m;
      const vg = ctx.createGain();
      vg.gain.value = v;
      o.connect(vg);
      vg.connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
    g.connect(master);
  };

  const t = ctx.currentTime + 0.05;
  const CHORD = [220, 277.18, 329.63, 493.88]; // La · Do# · Mi · Si
  const LETTERS = [1318.5, 1661.2, 1760, 1975.5, 2217.5, 2637]; // N e b u l a
  if (mode === "static") {
    pad(t, 3.2, CHORD, 0.08);
    LETTERS.forEach((fr, i) => chime(t + 0.15 + i * 0.085, fr, 0.045));
    return;
  }
  air(t + 0.2, 1.75, 120, 3800, 0.62, 0.34); // les anneaux entrent dans le cadre et le traversent
  sub(t + 0.25, 1.65, 36, 92, 0.22); // la lentille se referme
  bloom(t + INTRO_LAND - 0.06); // ils se posent
  pad(t + INTRO_LAND - 0.3, 4.6, CHORD, 0.11);
  LETTERS.forEach((fr, i) => chime(t + INTRO_LAND + 0.68 + i * 0.085, fr, 0.055));
  air(t + INTRO_LAND + 1.85, 2.0, 1400, 8000, 0.35, 0.07); // l'aura s'ouvre en anneau
}
