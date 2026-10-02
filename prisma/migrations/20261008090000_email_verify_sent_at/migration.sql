-- Confirmation de l'adresse (01/10/2026) : date du dernier envoi du lien, pour
-- imposer un délai entre deux envois (anti-spam) et afficher le décompte.
ALTER TABLE "User" ADD COLUMN "emailVerifySentAt" TIMESTAMP(3);
