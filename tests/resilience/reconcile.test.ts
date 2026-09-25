import { describe, expect, it } from "vitest";
import { matchRecentPost, normalizeForMatch } from "@/lib/social/reconcile";

// « Déjà en ligne ? » (lot 6) : retrouver sa publication parmi les dernières du compte.
const at = (iso: string) => new Date(iso);
const since = at("2026-09-25T10:00:00Z");
const until = at("2026-09-25T10:05:00Z");
const post = (id: string, text: string | undefined, iso?: string) => ({ externalPostId: id, text, publishedAt: iso ? at(iso) : undefined });

describe("vérification « déjà en ligne ? »", () => {
  it("normalise casse, accents et espaces", () => {
    expect(normalizeForMatch("  Été\n  À   Paris ")).toBe("ete a paris");
  });

  it("retrouve la publication par le début du texte, dans la fenêtre d'envoi", () => {
    const list = [
      post("old", "Nouvelle vidéo : les coulisses du tournage", "2026-09-24T10:00:00Z"),
      post("mine", "Nouvelle vidéo : les coulisses du tournage #nebula\n\n✨ Contenu créé avec l'aide de l'IA", "2026-09-25T10:03:00Z"),
      post("other", "Autre chose", "2026-09-25T10:04:00Z")
    ];
    expect(matchRecentPost(list, { text: "Nouvelle vidéo : les coulisses du tournage #nebula", since, until })?.externalPostId).toBe("mine");
  });

  it("accepte un texte tronqué par le réseau et une petite marge d'horloge", () => {
    const list = [post("yt", "Les coulisses du tournage — épisode 3", "2026-09-25T09:58:30Z")];
    expect(matchRecentPost(list, { text: "Les coulisses du tournage — épisode 3 (version longue avec bonus)", since, until })?.externalPostId).toBe("yt");
  });

  it("ignore hors fenêtre, sans date, ou déjà rattachée à une autre publication", () => {
    const text = "Programme de la semaine prochaine";
    expect(matchRecentPost([post("late", text, "2026-09-25T11:00:00Z")], { text, since, until })).toBeNull();
    expect(matchRecentPost([post("nodate", text)], { text, since, until })).toBeNull();
    expect(matchRecentPost([post("known", text, "2026-09-25T10:01:00Z")], { text, since, until, excludeIds: ["known"] })).toBeNull();
  });

  it("deux publications identiques dans la fenêtre : on ne choisit pas au hasard", () => {
    const text = "Programme de la semaine prochaine";
    const list = [post("a", text, "2026-09-25T10:01:00Z"), post("b", text, "2026-09-25T10:02:00Z")];
    expect(matchRecentPost(list, { text, since, until })).toBeNull();
  });

  it("média sans texte : seulement s'il n'y a qu'une publication dans la fenêtre", () => {
    expect(matchRecentPost([post("solo", undefined, "2026-09-25T10:02:00Z")], { text: "", since, until })?.externalPostId).toBe("solo");
    expect(matchRecentPost([post("a", "x", "2026-09-25T10:01:00Z"), post("b", "", "2026-09-25T10:02:00Z")], { text: "", since, until })).toBeNull();
  });
});
