// Mention « Importé depuis Canva » (03/10/2026) : sous le média dans
// Publier, sur la page d'une publication et dans la liste des publications.
// Même glyphe que la barre « Importer depuis ». Sans hook : utilisable dans
// un composant serveur.
import { clsx } from "@/lib/clsx";
import { importedFromText, mediaImportSource } from "@/lib/media-sources";
import { SourceIcon } from "./source-icon";

export function ImportSourceBadge({
  source,
  type,
  variant = "pill",
  className
}: {
  /** MediaAsset.importSource ; rien n'est affiché pour un envoi depuis l'appareil. */
  source: string | null | undefined;
  type?: string | null;
  /** pill : pastille ; inline : texte discret dans une ligne d'informations. */
  variant?: "pill" | "inline";
  className?: string;
}) {
  const id = mediaImportSource(source);
  if (!id) return null;
  // Logos officiels (06/10/2026) : en pastille, avec 8 px de marge autour pour
  // Canva ; dans une ligne de texte, le texte seul, pour toutes les sources.
  const canva = id === "canva";
  return (
    <span
      className={clsx(
        "inline-flex items-center",
        variant === "pill"
          ? clsx("rounded-full border border-white/10 bg-white/[0.04] text-xs text-slate-300", canva ? "gap-2 py-2 pl-2 pr-3" : "gap-1.5 px-2.5 py-1")
          : "gap-1.5 text-xs text-slate-400",
        className
      )}
    >
      {variant === "pill" && <SourceIcon id={id} brand className={canva ? "h-4 w-4" : "h-3.5 w-3.5 shrink-0"} />}
      {importedFromText(id, type)}
    </span>
  );
}
