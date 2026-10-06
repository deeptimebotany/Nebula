import { BilanClient } from "./bilan-client";

// Bilan du mois (03/10/2026) : le même bilan que l'e-mail du 3 du mois, pour
// la marque active (ou celle du lien de l'e-mail, ?brand=…) et un mois au choix.
export const metadata = { title: "Bilan du mois — Nebula" };

export default function BilanPage() {
  return <BilanClient />;
}
