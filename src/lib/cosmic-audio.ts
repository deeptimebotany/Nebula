// Petits sons synthétisés à la volée via WebAudio (aucun fichier audio dans
// le projet — voir la note dans le suivi de ce lot : pas question d'en
// fabriquer un). Chaque fonction crée son propre AudioContext à la volée et
// le referme après usage ; les navigateurs qui bloquent l'audio sans
// interaction utilisateur préalable échouent silencieusement (catch vide),
// ce qui est le comportement souhaité pour un simple agrément sonore.

function getCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor();
  } catch {
    return null;
  }
}

/** Petit carillon aigu à deux notes — cosmétique "Son Pulsar" (voir toast.tsx). */
export function playPulsarChime() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.09);
    gain.gain.linearRampToValueAtTime(0.06, now + i * 0.09 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.09);
    osc.stop(now + i * 0.09 + 0.4);
  });
  window.setTimeout(() => ctx.close().catch(() => undefined), 900);
}

/** Souffle de décollage montant — easter egg "Son Décollage" (voir publish.ts / composer/page.tsx). */
export function playLaunchWhoosh() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(180, now);
  filter.frequency.exponentialRampToValueAtTime(2200, now + 0.9);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(340, now + 0.9);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 1.2);
  window.setTimeout(() => ctx.close().catch(() => undefined), 1600);
}
