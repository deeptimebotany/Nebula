-- Pré-lancement (30/09/2026) : liste « lancement » de NetworkWaitlist,
-- date de l'e-mail d'annonce de l'ouverture (un seul envoi par adresse).
ALTER TABLE "NetworkWaitlist" ADD COLUMN "notifiedAt" TIMESTAMP(3);
