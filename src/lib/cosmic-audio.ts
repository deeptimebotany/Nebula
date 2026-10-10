// Petits sons de l'interface. La plupart sont synthétisés à la volée via
// WebAudio (briques communes : sound-synth.ts, style Pulsar depuis le
// 10/10/2026) : chaque fonction crée son propre AudioContext et le referme
// après usage. Seule exception, le « Son Pulsar » des notifications : depuis
// le 08/10/2026, c'est le son fourni par Lucas (« Nebula Mail – Arrivée et
// départ », public/sounds/notification-pulsar.mp3, 0,9 s). Les navigateurs
// qui bloquent l'audio sans interaction préalable échouent silencieusement
// (catch vide), ce qui est le comportement souhaité pour un agrément sonore.

import { getPref, setPref } from "@/lib/ui-prefs-client";
import { NOTE, pulsarChord, soundBus, swell } from "@/lib/sound-synth";

function getCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor();
  } catch {
    return null;
  }
}

/** Fichier du « Son Pulsar » (servi depuis public/, même origine : CSP media-src 'self'). */
export const PULSAR_SOUND_URL = "/sounds/notification-pulsar.mp3";
/** Volume de lecture : discret, sous la musique ou la vidéo en cours. */
const PULSAR_VOLUME = 0.7;

let pulsarAudio: HTMLAudioElement | null = null;

/**
 * Son des notifications de succès — cosmétique « Son Pulsar » (voir
 * toast.tsx). Le fichier est chargé une fois, puis copié à chaque lecture :
 * deux notifications rapprochées jouent chacune leur son en entier.
 */
export function playPulsarChime() {
  try {
    if (typeof Audio === "undefined") return;
    if (!pulsarAudio) {
      pulsarAudio = new Audio(PULSAR_SOUND_URL);
      pulsarAudio.preload = "auto";
    }
    const sound = pulsarAudio.cloneNode(true) as HTMLAudioElement;
    sound.volume = PULSAR_VOLUME;
    void sound.play().catch(() => undefined);
  } catch {
    // agrément sonore facultatif — jamais bloquant
  }
}

/**
 * Son « Décollage » — easter egg (voir publish.ts / composer/page.tsx).
 * 10/10/2026 : « Étages » (proposition 5-G, choisie par Lucas) : trois petits
 * accords graves qui montent comme des étages, puis l'accord du Pulsar, ≈ 1,3 s.
 */
export function playLaunchWhoosh() {
  const ctx = getCtx();
  if (!ctx) return;
  const out = soundBus(ctx, { reverb: 0.25, level: 0.34 });
  for (const [f, t] of [
    [NOTE.A2, 0],
    [NOTE.D3, 0.11],
    [NOTE.E3, 0.22]
  ] as const) {
    swell(ctx, out, { t, notes: [[f, 1], [f * 1.5, 0.5], [f * 2, 0.25]], attack: 0.09, release: 0.22, peak: 0.3, lp: [500, 1800, 500] });
  }
  swell(ctx, out, { t: 0.33, notes: pulsarChord(NOTE.A3), attack: 0.12, release: 0.7, peak: 0.42, lp: [600, 2800, 550], lpClose: 0.25 });
  window.setTimeout(() => ctx.close().catch(() => undefined), 3000);
}

/**
 * Son des succès, joué avec l'animation de achievement-toast-listener.tsx
 * (mission, accomplissement, easter egg, coffre). Désactivable dans
 * Paramètres → Sons (voir isAchievementSoundOn).
 * 10/10/2026 : « Mélodie » (proposition 6-H, choisie par Lucas) : une nappe
 * grave et trois notes douces qui montent par-dessus (do#, mi, la), ≈ 2 s.
 */
export function playAchievementArpeggio() {
  const ctx = getCtx();
  if (!ctx) return;
  const out = soundBus(ctx, { reverb: 0.35, seconds: 2, level: 0.44 });
  swell(ctx, out, { notes: [[NOTE.A2, 1], [NOTE.E3, 0.6], [NOTE.A3, 0.3]], attack: 0.4, release: 1.5, peak: 0.3, lp: [250, 1800, 500], lpClose: 0.6 });
  for (const [f, t, release] of [
    [NOTE.Cs4, 0.15, 0.4],
    [NOTE.E4, 0.34, 0.4],
    [NOTE.A4, 0.53, 1.0]
  ] as const) {
    swell(ctx, out, { t, notes: [[f, 1], [f * 2, 0.12]], attack: 0.1, release, peak: 0.18, lp: [1500, 2600, 1200], lpClose: 0.3 });
  }
  window.setTimeout(() => ctx.close().catch(() => undefined), 3500);
}

const ACHIEVEMENT_SOUND_KEY = "nebula:achievement-sound";

/** Son des succès : activé sauf si coupé dans Paramètres (réglage de cet appareil). */
export function isAchievementSoundOn(): boolean {
  try {
    return getPref(ACHIEVEMENT_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAchievementSoundOn(on: boolean): void {
  try {
    setPref(ACHIEVEMENT_SOUND_KEY, on ? "on" : "off");
  } catch {
    // stockage indisponible : le son reste au réglage par défaut
  }
}
