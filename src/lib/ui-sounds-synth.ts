// Synthèse des sons de l'interface (lot U5) — chargée au premier son
// seulement (import dynamique depuis ui-sounds.ts), sans fichier audio.
//
// 10/10/2026 : sons refaits dans le style du Pulsar (plus graves, ils gonflent
// puis retombent), choisis par Lucas parmi 5 propositions chacun :
//  - « Suivant » de la visite guidée : « Bulle » (proposition 2-D) ;
//  - fin de la visite : « Accord qui s'ouvre » (3-B) ;
//  - première publication : « Grand pulsar » (4-A).
// Volumes : comme le Pulsar joué par le site (~-12 dB au plus fort), le tic
// 4 dB plus bas car il revient à chaque étape.
import { NOTE, soundBus, swell } from "./sound-synth";

type Kind = "tick" | "finish" | "first-post";

export function synthUiSound(ctx: AudioContext, kind: Kind): void {
  if (ctx.state === "closed") return;
  if (kind === "tick") {
    // Bulle : une note grave (Fa#) qui remonte d'un cran (Si), ≈ 0,15 s.
    const out = soundBus(ctx, { reverb: 0.07, seconds: 0.6, level: 0.35 });
    swell(ctx, out, { notes: [[NOTE.Fs3, 1], [NOTE.Fs3 * 2, 0.2]], attack: 0.03, release: 0.09, glide: 1.335, glideTime: 0.1, lp: [600, 1800, 500] });
  } else if (kind === "finish") {
    // Accord qui s'ouvre : La majeur grave qui s'ouvre lentement, ≈ 1,3 s.
    const out = soundBus(ctx, { reverb: 0.3, level: 0.34 });
    swell(ctx, out, {
      notes: [[NOTE.A2, 1], [NOTE.E3, 0.8], [NOTE.A3, 0.6], [NOTE.Cs4, 0.45], [NOTE.E4, 0.2]],
      attack: 0.55,
      release: 0.75,
      peak: 0.35,
      lp: [250, 3200, 600],
      lpClose: 0.25,
      trem: { rate: 5, depth: 0.12 }
    });
  } else {
    // Grand pulsar : le Pulsar en plus grand et plus grave, ≈ 1,6 s.
    const out = soundBus(ctx, { reverb: 0.35, seconds: 2, level: 0.3 });
    swell(ctx, out, {
      notes: [[NOTE.A2, 1], [NOTE.E3, 0.6], [NOTE.A3, 0.7], [NOTE.E4, 0.4], [NOTE.A4, 0.18], [660, 0.04]],
      attack: 0.6,
      release: 1.0,
      peak: 0.36,
      lp: [300, 3500, 500],
      lpClose: 0.3,
      trem: { rate: 6, depth: 0.1 }
    });
  }
}
