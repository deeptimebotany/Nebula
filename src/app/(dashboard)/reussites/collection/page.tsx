import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EggCollection } from "@/components/reussites/succes-section";

// Collection des Easter eggs (lot U3, brief « Essai 14 jours ») : sortie de
// la page Réussites pour l'alléger, chargée seulement quand on l'ouvre
// (« Voir la collection » dans l'onglet Récompenses). Page à part entière :
// le bouton retour du navigateur ramène à Réussites.
export const metadata = { title: "Collection des Easter eggs — Nebula", robots: { index: false, follow: false } };

export default function EggCollectionPage() {
  return (
    <div className="space-y-6">
      <Link href="/reussites#recompenses" className="text-xs text-slate-500 transition hover:text-slate-300">
        ← Retour aux récompenses
      </Link>
      <PageHeader title="Collection des Easter eggs" description="Ce que vous découvrez en explorant Nebula. Les accomplissements, eux, récompensent ce que vous faites." />
      <EggCollection />
    </div>
  );
}
