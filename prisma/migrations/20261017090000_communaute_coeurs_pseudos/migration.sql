-- Communauté (10/10/2026, demandes de Lucas) :
--  1. Demandes d'avis : des cœurs au lieu d'un vote unique (un cœur par
--     personne et par proposition, plusieurs propositions possibles).
--  2. Pseudo de la Communauté (« @comete4821 ») : unique, affiché à la place
--     du nom ; chaque compte existant en reçoit un, modifiable dans Paramètres.
--  3. Forum façon YouTube : réponse à une réponse (un seul niveau).

-- 1. Cœurs
DROP INDEX IF EXISTS "FeedbackVote_requestId_userId_key";
DROP INDEX IF EXISTS "FeedbackVote_optionId_idx";
CREATE UNIQUE INDEX "FeedbackVote_optionId_userId_key" ON "FeedbackVote"("optionId", "userId");
CREATE INDEX "FeedbackVote_requestId_userId_idx" ON "FeedbackVote"("requestId", "userId");

-- 2. Pseudos : un mot de l'espace et 4 chiffres, tirés de l'identifiant du
-- compte (jamais du nom) ; doublons départagés par « _2 », « _3 »…
ALTER TABLE "User" ADD COLUMN "handle" TEXT;
WITH base AS (
  SELECT u."id",
         (ARRAY['comete','orbite','nova','pulsar','nebuleuse','astre','etoile','galaxie','aurore','quasar','eclipse','meteore','zenith','cosmos','lune'])[1 + (abs(hashtext(u."id")) % 15)]
           || lpad((abs(hashtext(u."id" || ':n')) % 10000)::text, 4, '0') AS h
  FROM "User" u
  WHERE u."handle" IS NULL
),
ranked AS (
  SELECT "id", h, row_number() OVER (PARTITION BY h ORDER BY "id") AS rn FROM base
)
UPDATE "User" u
SET "handle" = CASE WHEN r.rn = 1 THEN r.h ELSE r.h || '_' || r.rn END
FROM ranked r
WHERE u."id" = r."id";
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- 3. Réponses à une réponse
ALTER TABLE "ForumReply" ADD COLUMN "parentId" TEXT;
CREATE INDEX "ForumReply_parentId_idx" ON "ForumReply"("parentId");
ALTER TABLE "ForumReply" ADD CONSTRAINT "ForumReply_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ForumReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
