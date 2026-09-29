// Données structurées d'une page (voir src/lib/seo.ts). Un <script
// type="application/ld+json"> n'est jamais exécuté par le navigateur : les
// deux niveaux de CSP du site le laissent passer sans nonce.
import { ldGraph, serializeJsonLd } from "@/lib/seo";

export function JsonLd({ nodes }: { nodes: Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ldGraph(...nodes)) }} />;
}
