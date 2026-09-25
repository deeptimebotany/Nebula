-- Réussites v2 (lot B) : constellation de compétences. Ajouts seulement.
--  - vitrine de 3 badges par compte ;
--  - bilan de la semaine (date et cap choisi) ;
--  - réponse du compte repérée sur un commentaire reçu ;
--  - miniature envoyée au réseau (YouTube).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showcase" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "WeeklyMissions" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewFocus" TEXT;

-- AlterTable
ALTER TABLE "EngagementItem" ADD COLUMN     "ownerRepliedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PostTarget" ADD COLUMN     "thumbnailStatus" TEXT;

-- Rang enregistré = palier des XP déjà gagnés (rangs à paliers de la v2).
-- La condition de variété des rangs ne s'applique qu'aux passages à venir :
-- un compte garde le palier que ses XP lui donnent aujourd'hui. Seuils :
-- src/lib/reussites/catalog.ts (RANKS). Ne baisse jamais un rang.
UPDATE "User" SET "creatorLevel" = GREATEST("creatorLevel", CASE
    WHEN "creatorXp" >= 8500 THEN 15
    WHEN "creatorXp" >= 6500 THEN 14
    WHEN "creatorXp" >= 5000 THEN 13
    WHEN "creatorXp" >= 3800 THEN 12
    WHEN "creatorXp" >= 3000 THEN 11
    WHEN "creatorXp" >= 2300 THEN 10
    WHEN "creatorXp" >= 1700 THEN 9
    WHEN "creatorXp" >= 1250 THEN 8
    WHEN "creatorXp" >= 900 THEN 7
    WHEN "creatorXp" >= 650 THEN 6
    WHEN "creatorXp" >= 450 THEN 5
    WHEN "creatorXp" >= 300 THEN 4
    WHEN "creatorXp" >= 150 THEN 3
    WHEN "creatorXp" >= 60 THEN 2
    ELSE 1
END);
