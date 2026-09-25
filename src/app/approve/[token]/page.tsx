import type { Metadata } from "next";
import { ApprovalClient } from "./approval-client";

// Page accessible par lien privé (jeton ou slug) : jamais indexée par les
// moteurs de recherche, en plus de l'exclusion dans robots.ts.
export const metadata: Metadata = {
  title: "Validation des publications",
  robots: { index: false, follow: false }
};

// CSP stricte (nonce différent à chaque requête, voir src/lib/csp.ts) :
// rendu à chaque visite, jamais pré-généré.
export const dynamic = "force-dynamic";

export default function ApprovalPage({ params }: { params: { token: string } }) {
  return <ApprovalClient token={params.token} />;
}
