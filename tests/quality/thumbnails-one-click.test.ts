// Miniatures « en un clic » (07/10/2026, demande de Lucas) : plus jamais de
// question sur le sujet ou le public de la vidéo ; l'IA la regarde.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { ASSISTANT_CONTEXTS } from "@/lib/ai/assistant-contexts";
import { CONTEXT_PROMPTS, extractThumbnailBrief } from "@/lib/ai/assistant-prompts";
import { formatDuration, formatTimestamp } from "@/lib/video/format-time";

const composer = readFileSync(path.join(__dirname, "../../src/app/(dashboard)/composer/page.tsx"), "utf8");

describe("miniatures en un clic", () => {
  it("Publier ne fait plus remplir le sujet ni le public : un seul bouton, qui analyse la vidéo", () => {
    expect(composer).not.toMatch(/sujet : …, public visé : …/);
    expect(composer).not.toContain("Demander à l&apos;assistant");
    expect(composer).toContain("Générer 3 miniatures");
    expect(composer).toContain("/thumbnails/analyze");
    // Chaque miniature part d'une image de la vidéo, au format de la vidéo.
    expect(composer).toMatch(/captureVideoFramesAt\(asset\.previewUrl, concepts\.map\(\(c\) => c\.second\)/);
  });

  it("le chat ne redemande jamais le sujet ou le public ; son accueil renvoie au bouton", () => {
    const instruction = CONTEXT_PROMPTS.thumbnails.instruction;
    expect(instruction).toMatch(/ne redemande JAMAIS le sujet ou le public/);
    expect(instruction).not.toMatch(/pose d'abord 2 questions/);
    expect(ASSISTANT_CONTEXTS.thumbnails.welcome).toContain("Générer 3 miniatures");
    expect(ASSISTANT_CONTEXTS.thumbnails.welcome).not.toMatch(/Décrivez-moi votre vidéo/);
  });

  it("« rends la 2 plus contrastée » : le brief dit quelle proposition retravailler (1 à 3)", () => {
    const reply = (option: unknown) => `## Concept\nPlus de contraste.\n\`\`\`json\n${JSON.stringify({ hook: "L'ERREUR", imagePrompt: "Même image, contraste renforcé.", option })}\n\`\`\``;
    expect(extractThumbnailBrief(reply(2)).brief).toEqual({ hook: "L'ERREUR", imagePrompt: "Même image, contraste renforcé.", option: 2 });
    expect(extractThumbnailBrief(reply(null)).brief?.option).toBeNull();
    expect(extractThumbnailBrief(reply(7)).brief?.option).toBeNull();
    expect(extractThumbnailBrief(reply(2)).text).not.toContain("```");
  });

  it("durées et instants lisibles", () => {
    expect(formatDuration(134)).toBe("2 min 14 s");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(180)).toBe("3 min");
    expect(formatTimestamp(42.9)).toBe("0:42");
    expect(formatTimestamp(725)).toBe("12:05");
  });

  it("la page Confidentialité dit que la vidéo part chez Google, puis y est supprimée", () => {
    const legal = readFileSync(path.join(__dirname, "../../src/app/legal/page.tsx"), "utf8");
    expect(legal).toMatch(/« Générer 3 miniatures », la vidéo importée dans Publier, image et son, est envoyée à Google qui la regarde, puis supprimée de chez Google juste après l'analyse/);
  });
});
