// Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur :
// le contexte audio de l'intro de création de compte est donc créé AU CLIC
// sur « Créer mon espace » (avant tout `await` — Safari l'exige), puis
// transmis à l'intro (sound.ts) qui joue quand le compte est créé. Sans geste
// (arrivée après une inscription Google), le contexte reste suspendu :
// l'intro se joue alors en silence, sans erreur. Fichier séparé de sound.ts
// pour que la page d'inscription n'embarque pas tout le son.

/** Crée (ou réveille) le contexte audio pendant le geste de l'utilisateur. */
export function unlockIntroAudio(existing?: AudioContext | null): AudioContext | null {
  try {
    if (existing && existing.state !== "closed") {
      if (existing.state === "suspended") void existing.resume().catch(() => undefined);
      return existing;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}
