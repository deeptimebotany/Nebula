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

/**
 * Arpège « succès débloqué » (choisi le 24/09/2026, proposition n° 3) :
 * quatre notes montantes (do, mi, sol, do) puis une petite cloche — joué
 * avec l'animation de achievement-toast-listener.tsx. Désactivable dans
 * Paramètres → Apparence & Succès (voir isAchievementSoundOn).
 */
export function playAchievementArpeggio() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const note = (freq: number, start: number, dur: number, gainValue: number, type: OscillatorType) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.05);
  };
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.09, 0.35, 0.12, "triangle"));
  // Cloche finale (fondamentale + deux harmoniques).
  note(1318.5, 0.38, 0.9, 0.1, "sine");
  note(1318.5 * 2.01, 0.38, 0.54, 0.035, "sine");
  note(1318.5 * 3.02, 0.38, 0.32, 0.015, "sine");
  window.setTimeout(() => ctx.close().catch(() => undefined), 1800);
}

const ACHIEVEMENT_SOUND_KEY = "nebula:achievement-sound";

/** Son des succès : activé sauf si coupé dans Paramètres (réglage de cet appareil). */
export function isAchievementSoundOn(): boolean {
  try {
    return localStorage.getItem(ACHIEVEMENT_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAchievementSoundOn(on: boolean): void {
  try {
    localStorage.setItem(ACHIEVEMENT_SOUND_KEY, on ? "on" : "off");
  } catch {
    // stockage indisponible : le son reste au réglage par défaut
  }
}
