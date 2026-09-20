// Petit "ding" doré généré directement via l'API Web Audio — aucun fichier
// audio à héberger ni à faire approuver. Joué (a) au moment du spark-burst
// de souscription (voir billing/page.tsx) et (b) quand un membre Premium
// pose une réaction exclusive (voir reaction-bar.tsx). Best-effort : si
// l'audio est bloqué (politique navigateur, onglet en arrière-plan...), on
// échoue silencieusement plutôt que de casser l'interaction utilisateur.

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

/**
 * Joue un petit arpège à deux notes (façon carillon doré) — court (≈450ms),
 * discret, pensé pour accompagner un moment "premium" sans être intrusif.
 */
export function playVipChime(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    const notes = [880, 1318.5]; // La5 puis Mi6 — intervalle de quinte, lumineux
    const now = ctx.currentTime;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const start = now + i * 0.09;
      const duration = 0.35;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  } catch {
    // silencieux — le son est un bonus, jamais un pré-requis fonctionnel
  }
}
