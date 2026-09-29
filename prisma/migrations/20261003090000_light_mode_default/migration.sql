-- Mode clair par défaut (29/09/2026). Tous les comptes existants passent en
-- clair : avant la mise en production, le sombre était la valeur par défaut
-- et personne ne l'avait choisi volontairement. Le sombre reste au choix
-- (bouton soleil/lune de la barre latérale, palette de commandes).
ALTER TABLE "User" ALTER COLUMN "colorMode" SET DEFAULT 'light';
UPDATE "User" SET "colorMode" = 'light' WHERE "colorMode" <> 'light';
