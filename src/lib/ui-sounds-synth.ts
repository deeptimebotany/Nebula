// Synthèse des sons courts de l'interface (lot U5) — chargée au premier son
// seulement (import dynamique depuis ui-sounds.ts). Tous durent moins de
// 300 ms, à volume bas, sans fichier audio.

type Kind = "tick" | "finish" | "first-post";

function tone(ctx: AudioContext, out: AudioNode, freq: number, start: number, dur: number, peak: number, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function synthUiSound(ctx: AudioContext, kind: Kind): void {
  if (ctx.state === "closed") return;
  const t = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  if (kind === "tick") {
    // Tic léger : un clic doux, aigu et très bref (≈ 45 ms).
    tone(ctx, master, 1760, t, 0.045, 0.035, "sine");
    tone(ctx, master, 2640, t, 0.03, 0.012, "sine");
  } else if (kind === "finish") {
    // Petit accord montant : trois notes égrenées (mi, sol dièse, si), ≈ 280 ms.
    [659.25, 830.61, 987.77].forEach((f, i) => tone(ctx, master, f, t + i * 0.055, 0.17, 0.05, "triangle"));
  } else {
    // Accord court (do, mi, sol) plaqué, attaque douce, ≈ 250 ms.
    [523.25, 659.25, 783.99].forEach((f) => tone(ctx, master, f, t, 0.24, 0.035, "triangle"));
    tone(ctx, master, 1046.5, t + 0.02, 0.2, 0.015, "sine");
  }
}
