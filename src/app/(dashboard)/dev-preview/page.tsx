import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/dev-preview";
import { COSMETICS } from "@/lib/cosmetics";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { EASTER_EGGS } from "@/lib/easter-eggs-registry";
import { DevPreviewClient } from "./dev-preview-client";

// Onglet privé "Test / QA" — réservé au compte propriétaire du site (voir
// dev-preview.ts et sidebar.tsx, qui n'affiche même le lien que pour lui).
// Double vérification volontaire : ce garde-fou serveur reste le vrai
// rempart même si quelqu'un devine l'URL directement, le lien caché dans le
// menu n'étant qu'un raccourci d'affichage.
//
// But : lister en un seul endroit tout ce qui a été ajouté/modifié
// récemment (cosmétiques, fonds d'écran, easter eggs), avec une explication
// de ce que ça fait et où l'observer sur le site, pour vérifier/tester plus
// vite sans devoir déclencher chaque déclencheur caché un par un. Les
// indices des easter eggs, normalement jamais révélés avant d'être trouvés
// (voir /api/easter-eggs), le sont volontairement ici : cette page n'est
// visible que par la personne qui les a elle-même écrits.
export default async function DevPreviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isOwnerEmail(session.user.email)) {
    redirect("/dashboard");
  }

  return <DevPreviewClient cosmetics={COSMETICS} backgrounds={BACKGROUNDS} eggs={EASTER_EGGS} />;
}
