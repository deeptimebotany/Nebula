// Sons de l'interface refaits dans le style du Pulsar (10/10/2026, choix de
// Lucas : 2-D « Bulle », 3-B « Accord qui s'ouvre », 4-A « Grand pulsar » ;
// le Pulsar reste le fichier d'origine ; Décollage et Célébration en attente).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTE, pulsarChord } from "@/lib/sound-synth";

const read = (f: string) => readFileSync(f, "utf8");

describe("sons style Pulsar", () => {
  it("accord Pulsar : fondamentale, quinte, octave, puis aigus très bas (comme le fichier de Lucas : 220, 330, 440 Hz)", () => {
    expect(pulsarChord(NOTE.A3).map(([f]) => Math.round(f))).toEqual([220, 330, 440, 660, 880]);
    expect(pulsarChord(NOTE.A3).map(([, g]) => g)).toEqual([1, 0.55, 0.27, 0.06, 0.02]);
  });
  it("visite guidée et première publication : les trois sons choisis, graves, sans fichier audio", () => {
    const synth = read("src/lib/ui-sounds-synth.ts");
    expect(synth).toContain('from "./sound-synth"');
    // Bulle : Fa# grave qui remonte d'un cran.
    expect(synth).toContain("notes: [[NOTE.Fs3, 1], [NOTE.Fs3 * 2, 0.2]], attack: 0.03, release: 0.09, glide: 1.335");
    // Accord qui s'ouvre : La majeur grave, montée 0,55 s.
    expect(synth).toContain("notes: [[NOTE.A2, 1], [NOTE.E3, 0.8], [NOTE.A3, 0.6], [NOTE.Cs4, 0.45], [NOTE.E4, 0.2]]");
    // Grand pulsar.
    expect(synth).toContain("notes: [[NOTE.A2, 1], [NOTE.E3, 0.6], [NOTE.A3, 0.7], [NOTE.E4, 0.4], [NOTE.A4, 0.18], [660, 0.04]]");
    // Plus d'anciens sons aigus (1 760 Hz, accord do-mi-sol).
    expect(synth).not.toContain("1760");
    expect(synth).not.toContain("523.25");
  });
  it("le Pulsar reste le fichier d'origine", () => {
    expect(read("src/lib/cosmic-audio.ts")).toContain('export const PULSAR_SOUND_URL = "/sounds/notification-pulsar.mp3";');
  });
});

describe("Décollage et Célébration, style Pulsar (choix de Lucas : 5-G « Étages », 6-H « Mélodie »)", () => {
  it("Étages : trois petits accords qui montent, puis l'accord du Pulsar ; Mélodie : nappe grave et trois notes qui montent", () => {
    const audio = read("src/lib/cosmic-audio.ts");
    expect(audio).toContain('from "@/lib/sound-synth"');
    expect(audio).toContain("[NOTE.A2, 0],\n    [NOTE.D3, 0.11],\n    [NOTE.E3, 0.22]");
    expect(audio).toContain("swell(ctx, out, { t: 0.33, notes: pulsarChord(NOTE.A3)");
    expect(audio).toContain("[NOTE.Cs4, 0.15, 0.4],\n    [NOTE.E4, 0.34, 0.4],\n    [NOTE.A4, 0.53, 1.0]");
    // Plus d'ancien souffle en dents de scie ni d'arpège aigu.
    expect(audio).not.toContain('"sawtooth"');
    expect(audio).not.toContain("1318.5");
  });
});
