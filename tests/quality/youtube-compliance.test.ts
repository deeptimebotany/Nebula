// Audit « YouTube API Services » (09/10/2026) : ce que les règles de YouTube
// exigent de la page légale et du code (sections III.A, III.D.2, III.E.4 :
// https://developers.google.com/youtube/terms/developer-policies).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isStaleYoutubeComment, YOUTUBE_DATA_MAX_DAYS } from "@/lib/social/youtube-data-retention";
import { YOUTUBE_PRIVATE_LOCK_NOTE, YOUTUBE_UPLOADS_LOCKED_PRIVATE } from "@/lib/social/youtube-audit";

const read = (f: string) => readFileSync(f, "utf8");

describe("page légale : exigences de YouTube", () => {
  const legal = read("src/app/legal/page.tsx");
  it("conditions : lien vers les Conditions d'utilisation de YouTube et acceptation", () => {
    expect(legal).toContain('const YOUTUBE_TERMS_URL = "https://www.youtube.com/t/terms";');
    expect(legal).toContain("vous acceptez d&apos;être lié par les");
  });
  it("confidentialité : YouTube API Services, règles de Google, retrait sur la page Google, contact", () => {
    expect(legal).toContain('<Section id="youtube" title="2 bis. Données YouTube (YouTube API Services)">');
    expect(legal).toContain('const GOOGLE_PRIVACY_URL = "http://www.google.com/policies/privacy";');
    expect(legal).toContain('const GOOGLE_PERMISSIONS_URL = "https://security.google.com/settings/security/permissions";');
    expect(legal).toContain("Questions ou réclamations sur l&apos;usage de vos données YouTube");
    expect(legal).toContain("ne laisse aucun tiers afficher de");
  });
  it("conservation : 30 jours sans actualisation, autorisation vérifiée, effacement à la déconnexion", () => {
    expect(legal).toContain("ne\n            sont jamais gardées plus de 30 jours sans être actualisées");
    expect(legal).toContain("vérifie au moins tous les 30 jours que votre autorisation est toujours valable");
    expect(legal).toContain("traitée sous 7 jours au plus");
  });
});

describe("code : les règles sont vraiment appliquées", () => {
  it("commentaires de plus de 30 jours ni enregistrés ni gardés", () => {
    expect(YOUTUBE_DATA_MAX_DAYS).toBe(30);
    const now = new Date("2026-10-09T12:00:00Z");
    expect(isStaleYoutubeComment(new Date("2026-09-08T12:00:00Z"), now)).toBe(true);
    expect(isStaleYoutubeComment(new Date("2026-09-10T12:00:00Z"), now)).toBe(false);
    expect(isStaleYoutubeComment(null, now)).toBe(false);
    expect(read("src/lib/social/youtube.ts")).toContain(".filter((item) => !isStaleYoutubeComment(item.publishedAt))");
  });
  it("déconnexion d'une chaîne : données effacées ; cron : purge et vérification", () => {
    expect(read("src/lib/social/revoke.ts")).toContain('if (connection.network === "YOUTUBE") await deleteYoutubeAuthorizedData(connectionId);');
    expect(read("src/lib/account-jobs.ts")).toContain('safe("règles de données YouTube", () => runYoutubeDataPolicy())');
  });
  it("Publier prévient que les vidéos arrivent en privé tant que l'audit n'est pas validé", () => {
    expect(YOUTUBE_UPLOADS_LOCKED_PRIVATE).toBe(true);
    expect(YOUTUBE_PRIVATE_LOCK_NOTE).toContain("YouTube Studio");
    expect(read("src/app/(dashboard)/composer/page.tsx")).toContain("YOUTUBE_UPLOADS_LOCKED_PRIVATE && youtubeOptions.privacyStatus !== \"private\"");
  });
});
