// Permissions Meta (30/09/2026) : la liste demandée à la connexion doit
// correspondre exactement à ce que Nebula appelle, et à ce qui est coché
// dans le portail Meta for Developers (cas d'utilisation « Gérer des Pages »
// et « Instagram avec connexion Facebook »). Une permission manquante fait
// échouer l'appel (souvent en silence : statistiques à 0) ; une permission
// en trop est refusée par Meta en App Review.
import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { META_INSTAGRAM_SCOPES, META_OAUTH_SCOPES, META_PAGES_SCOPES, instagramClient } from "@/lib/social/meta";

const source = readFileSync(path.join(__dirname, "../../src/lib/social/meta.ts"), "utf8");

afterEach(() => vi.unstubAllEnvs());

describe("permissions demandées à Meta", () => {
  it("liste exacte, rangée comme dans le portail", () => {
    expect([...META_PAGES_SCOPES].sort()).toEqual([
      "business_management",
      "pages_manage_engagement",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_read_user_content",
      "pages_show_list",
      "read_insights"
    ]);
    expect([...META_INSTAGRAM_SCOPES].sort()).toEqual(["instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_insights"]);
    expect(new Set(META_OAUTH_SCOPES).size).toBe(META_OAUTH_SCOPES.length);
  });

  it("l'adresse de connexion demande exactement cette liste (identifiants nettoyés)", () => {
    vi.stubEnv("META_APP_ID", "123456\n");
    vi.stubEnv("META_REDIRECT_URI", "https://nebulahub.space/api/social/callback/meta");
    const url = new URL(instagramClient.getAuthUrl("etat"));
    expect(url.searchParams.get("client_id")).toBe("123456");
    expect(url.searchParams.get("scope")!.split(",").sort()).toEqual([...META_OAUTH_SCOPES].sort());
  });

  it("chaque appel sensible a sa permission", () => {
    const needs: [RegExp, string][] = [
      [/graph\("INSTAGRAM", `\/\$\{[^}]+\}\/insights`/, "instagram_manage_insights"],
      [/graph\("FACEBOOK", `\/\$\{[^}]+\}\/insights`/, "read_insights"],
      [/graph\("FACEBOOK", `\/\$\{p\.id\}\/comments`/, "pages_read_user_content"],
      [/graph\("INSTAGRAM", `\/\$\{m\.id\}\/comments`/, "instagram_manage_comments"],
      [/\/media_publish`/, "instagram_content_publish"],
      [/\/feed`/, "pages_manage_posts"],
      [/\/me\/accounts`/, "pages_show_list"],
      // Commentaires (10/10/2026) : j'aime de la Page et suppression.
      [/graph\("FACEBOOK", `\/\$\{encodeURIComponent\(comment\.externalId\)\}\/likes`/, "pages_manage_engagement"],
      [/graph\("INSTAGRAM", `\/\$\{encodeURIComponent\(comment\.externalId\)\}`, connection\.accessToken, \{ method: "DELETE"/, "instagram_manage_comments"]
    ];
    for (const [pattern, scope] of needs) {
      expect(pattern.test(source), pattern.source).toBe(true);
      expect(META_OAUTH_SCOPES, scope).toContain(scope);
    }
  });

  it("aucune permission inutile (refusée en App Review)", () => {
    for (const unused of ["pages_manage_metadata", "email", "publish_video", "pages_messaging", "instagram_manage_messages", "ads_management"]) {
      expect(META_OAUTH_SCOPES).not.toContain(unused);
    }
  });
});
