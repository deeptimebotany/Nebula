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
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5",
        variant === "pill" ? "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300" : "text-xs text-slate-400",
        className
      )}
    >
      <SourceIcon id={id} className="h-3.5 w-3.5 shrink-0" />
      {importedFromText(id, type)}
    </span>
  );
}
