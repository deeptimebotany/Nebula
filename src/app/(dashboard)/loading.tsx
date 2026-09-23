import { PageSkeleton } from "@/components/ui/skeleton";

// Écran de transition entre deux pages de l'application (Next.js l'affiche
// automatiquement pendant le rendu serveur de la page suivante).
export default function DashboardLoading() {
  return <PageSkeleton />;
}
