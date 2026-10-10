import { beforeEach, describe, expect, it } from "vitest";

// Easter eggs (10/10/2026, demandes de Lucas), sur une vraie base :
//  - n° 9, 15, 21, 22 et 23 retirés : leurs lignes déjà en base ne comptent
//    plus nulle part (collection, profil, XP) et ne peuvent plus être gagnées ;
//  - « Chasseur d'étoiles » demande les 18 easter eggs d'origine restants ;
//  - « Centenaire » = 100ᵉ publication réellement en ligne (au moins un réseau),
//    comptée une seule fois même partie sur plusieurs réseaux.
import { prisma } from "@/lib/prisma";
import { checkMetaAchievements, markEasterEggFound } from "@/lib/easter-eggs/server";
import { ORIGINAL_TWENTY_KEYS } from "@/lib/easter-eggs-registry";
import { checkPersonalPublishMilestone } from "@/lib/publish";
import { computeXp } from "@/lib/reussites/engine";
import { EGG_XP } from "@/lib/reussites/catalog";
import { loadMemberProfile } from "@/lib/community/member-profile";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const REMOVED = ["ai-identity", "inbox-zero", "banana-word", "ai-answer-42", "support-thanks"];

describe.skipIf(!hasDatabase)("Easter eggs retirés, Chasseur d'étoiles, Centenaire", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("les easter eggs retirés ne se gagnent plus et ne comptent plus (XP, profil)", async () => {
    const { user } = await makeBrand();
    await prisma.easterEggFound.createMany({ data: [...REMOVED.map((key) => ({ userId: user.id, key })), { userId: user.id, key: "konami" }] });
    for (const key of REMOVED) expect(await markEasterEggFound(user.id, key)).toBe(false);
    expect(await computeXp(user.id)).toBe(EGG_XP);
    expect((await loadMemberProfile(user.id))?.stats.eggs).toBe(1);
  });

  it("Chasseur d'étoiles : les 18 easter eggs d'origine restants suffisent", async () => {
    const { user } = await makeBrand();
    expect(ORIGINAL_TWENTY_KEYS).toHaveLength(18);
    await prisma.easterEggFound.createMany({ data: ORIGINAL_TWENTY_KEYS.slice(0, 17).map((key) => ({ userId: user.id, key })) });
    await checkMetaAchievements(user.id);
    expect(await prisma.easterEggFound.count({ where: { userId: user.id, key: "original-20-found" } })).toBe(0);
    await prisma.easterEggFound.create({ data: { userId: user.id, key: ORIGINAL_TWENTY_KEYS[17] } });
    // Sans rien trouver de nouveau : rappelé à l'ouverture de la collection.
    await checkMetaAchievements(user.id);
    expect(await prisma.easterEggFound.count({ where: { userId: user.id, key: "original-20-found" } })).toBe(1);
  });

  it("Centenaire : 100 publications en ligne, une publication multi-réseaux compte une fois, les échecs ne comptent pas", async () => {
    const { user, brand } = await makeBrand();
    const ig = await prisma.socialConnection.create({
      data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: "ig-1", displayName: "IG", accessToken: "tok", status: "CONNECTED" }
    });
    const tt = await prisma.socialConnection.create({
      data: { brandId: brand.id, network: "TIKTOK", externalAccountId: "tt-1", displayName: "TT", accessToken: "tok", status: "CONNECTED" }
    });
    const publication = async (title: string, status: string, targets: [string, string, string][]) => {
      const post = await prisma.post.create({ data: { brandId: brand.id, createdById: user.id, title, caption: title, status } });
      for (const [connectionId, network, s] of targets) await prisma.postTarget.create({ data: { postId: post.id, connectionId, network, status: s } });
    };

    for (let i = 0; i < 98; i++) await publication(`p${i}`, "PUBLISHED", [[ig.id, "INSTAGRAM", "PUBLISHED"]]);
    // 99ᵉ : partie sur deux réseaux, comptée une seule fois.
    await publication("deux réseaux", "PUBLISHED", [[ig.id, "INSTAGRAM", "PUBLISHED"], [tt.id, "TIKTOK", "PUBLISHED"]]);
    // Échouée ou seulement programmée : jamais comptée.
    await publication("échec", "FAILED", [[ig.id, "INSTAGRAM", "FAILED"]]);
    await publication("programmée", "SCHEDULED", [[tt.id, "TIKTOK", "SCHEDULED"]]);
    expect(await checkPersonalPublishMilestone(user.id)).toBe(false);

    // 100ᵉ : partie sur un réseau sur deux (PARTIAL) — c'est une publication.
    await publication("partielle", "PARTIAL", [[ig.id, "INSTAGRAM", "PUBLISHED"], [tt.id, "TIKTOK", "FAILED"]]);
    expect(await checkPersonalPublishMilestone(user.id)).toBe(true);
  });
});
