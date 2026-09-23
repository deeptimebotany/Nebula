import type { Metadata } from "next";
import { CalendrierClient } from "./calendrier-client";

// Page accessible par lien privé (jeton ou slug) : jamais indexée par les
// moteurs de recherche, en plus de l'exclusion dans robots.ts.
export const metadata: Metadata = {
  title: "Calendrier des publications",
  robots: { index: false, follow: false }
};

export default function CalendrierPage({ params }: { params: { token: string } }) {
  return <CalendrierClient token={params.token} />;
}
