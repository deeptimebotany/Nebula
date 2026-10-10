// Briques des sons « style Pulsar » (10/10/2026, choix de Lucas parmi les
// propositions) : des notes graves et rondes qui gonflent puis retombent,
// comme le Pulsar (La 220 Hz + quinte + octave, ~0,45 s de montée, ~0,35 s
// de descente). Synthétisés avec Web Audio, sans fichier audio.
//
// Mêmes formules que la page d'écoute des propositions : un son choisi sur
// la page sonne pareil sur le site.

/** Notes utilisées (Hz). */
export const NOTE = { A1: 55, A2: 110, Cs3: 138.59, D3: 146.83, E3: 164.81, Fs3: 185, A3: 220, B3: 246.94, Cs4: 277.18, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88 } as const;

/** Accord « Pulsar » sur une fondamentale : quinte, octave, puis aigus très bas. */
export function pulsarChord(root: number, k = 1): [number, number][] {
  return [
    [root, 1 * k],
    [root * 1.5, 0.55 * k],
    [root * 2, 0.27 * k],
    [root * 3, 0.06 * k],
    [root * 4, 0.02 * k]
  ];
}

/** Bruit pseudo-aléatoire reproductible (même réverbération à chaque fois). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

// Réponse de la réverbération : calculée une fois par contexte audio et par durée.
const irCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function impulse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const key = `${seconds}:${seed}`;
  let byKey = irCache.get(ctx);
  if (!byKey) irCache.set(ctx, (byKey = new Map()));
  const cached = byKey.get(key);
  if (cached) return cached;
  const r = rng(seed);
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = r() * Math.pow(1 - i / len, 3.2);
  }
  byKey.set(key, ir);
  return ir;
}

export interface BusOptions {
  /** Part de réverbération (0 = aucune). */
  reverb?: number;
  /** Durée de la réverbération, en secondes. */
  seconds?: number;
  /** Volume général du son (1 = tel quel). */
  level?: number;
  seed?: number;
}

/** Sortie d'un son : direct + réverbération douce, au volume `level`. */
export function soundBus(ctx: BaseAudioContext, { reverb = 0.2, seconds = 1.6, level = 1, seed = 7 }: BusOptions = {}): AudioNode {
  const input = ctx.createGain();
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(ctx.destination);
  input.connect(out);
  if (reverb > 0) {
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, seconds, seed);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    const wet = ctx.createGain();
    wet.gain.value = reverb;
    input.connect(conv).connect(lp).connect(wet).connect(out);
  }
  return input;
}

export interface SwellOptions {
  /** Départ, en secondes après maintenant. */
  t?: number;
  /** [fréquence, volume] de chaque note. */
  notes: [number, number][];
  /** Montée, puis descente, en secondes. */
  attack: number;
  release: number;
  peak?: number;
  type?: OscillatorType;
  /** Filtre [départ, sommet, fin] : s'ouvre pendant la montée, se referme vite. */
  lp?: [number, number, number] | null;
  lpClose?: number;
  /** La hauteur est multipliée par `glide` pendant `glideTime` (par défaut : la montée). */
  glide?: number;
  glideTime?: number | null;
  /** Léger tremolo (vitesse en Hz, profondeur 0-1, vitesse finale facultative). */
  trem?: { rate: number; depth: number; to?: number } | null;
  /** Désaccord en cents (deux voix légèrement décalées). */
  detune?: number;
}

/** Nappe qui gonfle puis retombe : le geste du Pulsar. */
export function swell(ctx: BaseAudioContext, out: AudioNode, o: SwellOptions): void {
  const { t = 0, notes, attack, release, peak = 0.5, type = "sine", lp = null, lpClose = 0.06, glide = 1, glideTime = null, trem = null, detune = 0 } = o;
  const t0 = ctx.currentTime + 0.02 + t;
  const end = t0 + attack + release;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  let last: AudioNode = env;
  if (trem) {
    const tg = ctx.createGain();
    tg.gain.value = 1 - trem.depth;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(trem.rate, t0);
    if (trem.to) lfo.frequency.linearRampToValueAtTime(trem.to, end);
    const amt = ctx.createGain();
    amt.gain.value = trem.depth;
    lfo.connect(amt).connect(tg.gain);
    lfo.start(t0);
    lfo.stop(end + 0.05);
    last.connect(tg);
    last = tg;
  }
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(lp[0], t0);
    f.frequency.exponentialRampToValueAtTime(lp[1], t0 + attack);
    f.frequency.exponentialRampToValueAtTime(lp[2], t0 + attack + lpClose);
    last.connect(f);
    last = f;
  }
  last.connect(out);
  const dets = detune ? [-detune, detune] : [0];
  for (const [freq, g] of notes) {
    for (const d of dets) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.detune.value = d;
      osc.frequency.setValueAtTime(freq, t0);
      if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * glide, t0 + (glideTime ?? attack));
      const og = ctx.createGain();
      og.gain.value = g / dets.length;
      osc.connect(og).connect(env);
      osc.start(t0);
      osc.stop(end + 0.05);
    }
  }
}
