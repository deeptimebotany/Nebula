// Rétention IA et Gemini payant (30/09/2026) : fonctions pures. Nebula
// calcule les chutes, l'IA explique ; aucun chiffre inventé ; ce que l'IA
// voit dépend de la visibilité et de la durée de la vidéo ; prix par modèle
// et par jour. Les scénarios sur une vraie base sont dans
// tests/integration/gemini-paid.test.ts.
import { describe, expect, it } from "vitest";
import {
  FULL_VIDEO_MAX_SECONDS,
  RetentionContractError,
  allowedPercents,
  buildRetentionRequest,
  chooseRetentionMode,
  detectDrops,
  formatClock,
  parseRetentionAnswer,
  planClips,
  retentionThinking,
  stripInventedNumbers
} from "@/lib/ai/retention";
import { DEFAULT_IMAGE_MODEL, estimateCostUsd, priceFor, pricesInForce } from "@/lib/ai/pricing";
import { PLAN_LIMITS } from "@/lib/plans";

// Courbe type : 100 % → 70 % à 10 % de la vidéo, puis 66 % → 50 % à 40 %.
const CURVE = [
  { timeRatio: 0, watchRatio: 1 },
  { timeRatio: 0.1, watchRatio: 0.7 },
  { timeRatio: 0.2, watchRatio: 0.68 },
  { timeRatio: 0.3, watchRatio: 0.66 },
  { timeRatio: 0.4, watchRatio: 0.5 },
  { timeRatio: 0.5, watchRatio: 0.49 },
  { timeRatio: 1, watchRatio: 0.45 }
];

describe("chutes calculées par Nebula", () => {
  it("horodatages lisibles", () => {
    expect(formatClock(102)).toBe("1:42");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatClock(-4)).toBe("0:00");
  });

  it("les plus grosses chutes, dans l'ordre de la vidéo, avec la seconde et la part qui part", () => {
    const drops = detectDrops(CURVE, 600, 2);
    expect(drops.map((d) => d.id)).toEqual(["D1", "D2"]);
    expect(drops[0]).toMatchObject({ timeRatio: 0.1, second: 60, before: 1, after: 0.7 });
    expect(drops[0].lostShare).toBeCloseTo(0.3);
    expect(drops[1]).toMatchObject({ timeRatio: 0.4, second: 240, before: 0.66, after: 0.5 });
    expect(drops[1].lostShare).toBeCloseTo(0.16 / 0.66);
    // Durée inconnue : pas de seconde, jamais inventée.
    expect(detectDrops(CURVE, null, 1)[0].second).toBeNull();
    // Courbe plate : aucune chute.
    expect(detectDrops([{ timeRatio: 0, watchRatio: 0.5 }, { timeRatio: 1, watchRatio: 0.5 }], 60)).toEqual([]);
  });

  it("deux chutes voisines (moins de 3 % d'écart) ne comptent qu'une fois", () => {
    const curve = [
      { timeRatio: 0, watchRatio: 1 },
      { timeRatio: 0.1, watchRatio: 0.8 },
      { timeRatio: 0.11, watchRatio: 0.65 },
      { timeRatio: 0.5, watchRatio: 0.6 }
    ];
    expect(detectDrops(curve, 100).map((d) => d.timeRatio)).toEqual([0.1, 0.5]);
  });
});

describe("ce que l'IA voit", () => {
  it("publique ≤ 20 min : la vidéo ; plus longue : des extraits ; privée ou non listée : images ou miniature", () => {
    expect(chooseRetentionMode({ privacyStatus: "public", durationSeconds: 600, hasFrames: false })).toBe("video");
    expect(chooseRetentionMode({ privacyStatus: "public", durationSeconds: FULL_VIDEO_MAX_SECONDS, hasFrames: false })).toBe("video");
    expect(chooseRetentionMode({ privacyStatus: "public", durationSeconds: FULL_VIDEO_MAX_SECONDS + 1, hasFrames: false })).toBe("clips");
    expect(chooseRetentionMode({ privacyStatus: "unlisted", durationSeconds: 300, hasFrames: false })).toBe("thumbnail");
    expect(chooseRetentionMode({ privacyStatus: "private", durationSeconds: 300, hasFrames: true })).toBe("frames");
    expect(chooseRetentionMode({ privacyStatus: "public", durationSeconds: null, hasFrames: false })).toBe("thumbnail");
  });

  it("extraits : la première minute, ±20 s autour des chutes, fusionnés, 5 au plus", () => {
    const drop = (second: number) => ({ id: "D", timeRatio: 0, second, before: 1, after: 0.5, lostShare: 0.5 });
    expect(planClips([drop(30), drop(70)], 3600)).toEqual([{ start: 0, end: 90 }]);
    expect(planClips([drop(600), drop(1200)], 3600)).toEqual([
      { start: 0, end: 60 },
      { start: 580, end: 620 },
      { start: 1180, end: 1220 }
    ]);
    expect(planClips([300, 600, 900, 1200, 1500, 1800].map(drop), 3600)).toHaveLength(5);
  });

  it("requête : URL YouTube (agentique ou basse résolution), extraits avec leurs bornes, miniature en image", () => {
    const drops = detectDrops(CURVE, 600, 2);
    const base = { title: "Mon vlog", description: "Une journée", durationSeconds: 600, drops, youtubeUrl: "https://www.youtube.com/watch?v=abc" };
    const video = buildRetentionRequest({ ...base, mode: "video" });
    expect(video.video).toBe(true);
    expect(video.parts[1]).toEqual({ file_data: { file_uri: base.youtubeUrl } });
    const text = (video.parts[0] as { text: string }).text;
    expect(text).toContain("D1 : à 1:00, les spectateurs restants passent de 100 % à 70 % (30 % des personnes encore là partent).");
    expect(text).toContain("Tu as la vidéo entière");

    const agentic = buildRetentionRequest({ ...base, mode: "video", agentic: true });
    expect(agentic.parts[1]).toEqual({ file_data: { file_uri: base.youtubeUrl }, media_processing: "AGENTIC" });
    expect(agentic.video).toBe(false);

    const clips = buildRetentionRequest({ ...base, mode: "clips", durationSeconds: 3000, clips: [{ start: 0, end: 60 }, { start: 580, end: 620 }] });
    expect(clips.parts.slice(1)).toEqual([
      { file_data: { file_uri: base.youtubeUrl }, video_metadata: { start_offset: "0s", end_offset: "60s" } },
      { file_data: { file_uri: base.youtubeUrl }, video_metadata: { start_offset: "580s", end_offset: "620s" } }
    ]);

    const thumb = buildRetentionRequest({ ...base, mode: "thumbnail", thumbnail: { base64: "AAAA", mimeType: "image/jpeg" } });
    expect(thumb.parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: "AAAA" } });
    expect((thumb.parts[0] as { text: string }).text).toContain("hypothèses");
    expect(thumb.video).toBe(false);
  });

  it("réflexion plus poussée au niveau Agence", () => {
    expect(retentionThinking(PLAN_LIMITS.AGENCY.featureLevel)).toBe("high");
    expect(retentionThinking(PLAN_LIMITS.PRO.featureLevel)).toBe("medium");
    expect(retentionThinking(PLAN_LIMITS.TRIAL.featureLevel)).toBe("medium");
  });
});

describe("contrat de la réponse : aucun chiffre inventé", () => {
  const drops = detectDrops(CURVE, 600, 2);

  it("chiffres autorisés : ceux que Nebula a calculés", () => {
    expect(allowedPercents(drops)).toEqual(expect.arrayContaining([100, 70, 30, 66, 50, 24, 16]));
  });

  it("une phrase qui cite un pourcentage absent, ou un moment après la fin, est retirée", () => {
    const allowed = allowedPercents(drops);
    expect(stripInventedNumbers("Vous perdez 30 % des spectateurs. 45 % décrochent aussi. La musique change.", allowed, 600)).toBe(
      "Vous perdez 30 % des spectateurs. La musique change."
    );
    expect(stripInventedNumbers("À 2:30, un plan fixe. À 12:10, le générique.", allowed, 600)).toBe("À 2:30, un plan fixe.");
  });

  it("réponse de l'IA + chiffres de Nebula ; identifiant inconnu ignoré ; bloc de code accepté", () => {
    const raw = "```json\n" + JSON.stringify({
      summary: "L'intro traîne. 80 % partent tout de suite.",
      drops: [
        { id: "d1", scene: "Logo animé de 15 secondes.", cause: "Rien ne promet la suite." },
        { id: "D9", scene: "Inventé", cause: "Inventé" }
      ],
      recommendations: ["Montrez le résultat dès la première seconde.", "Gardez 50 % du rythme."]
    }) + "\n```";
    const out = parseRetentionAnswer(raw, drops, 600);
    expect(out.summary).toBe("L'intro traîne.");
    expect(out.dropOffPoints).toHaveLength(2);
    expect(out.dropOffPoints[0]).toMatchObject({ id: "D1", second: 60, before: 1, after: 0.7, watchRatio: 0.7, scene: "Logo animé de 15 secondes.", note: "Logo animé de 15 secondes. — Rien ne promet la suite." });
    expect(out.dropOffPoints[1]).toMatchObject({ id: "D2", scene: "", cause: "" });
    expect(out.recommendations).toEqual(["Montrez le résultat dès la première seconde.", "Gardez 50 % du rythme."]);
  });

  it("réponse illisible ou hors contrat : erreur de contrat (la porte ne décompte rien)", () => {
    expect(() => parseRetentionAnswer("Voici mon analyse…", drops, 600)).toThrow(RetentionContractError);
    expect(() => parseRetentionAnswer(JSON.stringify({ summary: "ok", drops: [], recommendations: [] }), drops, 600)).toThrow(RetentionContractError);
    expect(() => parseRetentionAnswer(JSON.stringify({ summary: "90 % partent.", drops: [], recommendations: ["95 % de clics."] }), drops, 600)).toThrow(RetentionContractError);
  });
});

describe("prix de Gemini par modèle et par jour", () => {
  it("gemini-3.8-flash : 0,75 $ / 3,75 $ jusqu'au 31/12/2026, puis le double", () => {
    expect(priceFor("gemini-3.8-flash", "2026-12-31")).toMatchObject({ inputPerMillion: 0.75, outputPerMillion: 3.75 });
    expect(priceFor("gemini-3.8-flash", "2027-01-01")).toMatchObject({ inputPerMillion: 1.5, outputPerMillion: 7.5 });
    const [p] = pricesInForce(["gemini-3.8-flash", ""], "2026-10-01");
    expect(p.next).toMatchObject({ from: "2027-01-01", inputPerMillion: 1.5 });
  });

  it("image : 0,50 $ le million en entrée, 0,067 $ l'image 1K ; modèle inconnu → modèle par défaut de même nature", () => {
    expect(priceFor(DEFAULT_IMAGE_MODEL, "2026-10-01")).toMatchObject({ inputPerMillion: 0.5, perImage: 0.067 });
    expect(priceFor("gemini-9-flash-image-preview", "2026-10-01").perImage).toBe(0.067);
    // Une analyse Rétention de 10 min en basse résolution (≈ 60 000 jetons) + 1 000 en sortie.
    expect(estimateCostUsd({ inputTokens: 60_000, outputTokens: 1_000, images: 0 }, "gemini-3.8-flash", "2026-10-01")).toBeCloseTo(0.04875);
  });
});
