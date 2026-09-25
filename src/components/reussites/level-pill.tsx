// Pastille du rang de créateur (« Comète II » avec son emblème) :
// Communauté (à côté du prénom), « Mon profil ». Réussites v2 : remplace
// « Niv. 4 » et les titres de la Communauté.
import { clsx } from "@/lib/clsx";
import { stepDef } from "@/lib/reussites/catalog";
import { RankEmblem } from "./rank-emblem";

export function LevelPill({ level, name, className }: { level: number | null | undefined; name?: string; className?: string }) {
  if (!level || level < 1) return null;
  const step = stepDef(level);
  const label = name ?? step.name;
  return (
    <span title={`Rang de créateur : ${label}`} aria-label={`Rang de créateur : ${label}`} className={clsx("rank-chip inline-flex items-center gap-1 rounded-full border py-px pl-0.5 pr-1.5 text-[10px] font-semibold leading-4", `rank-chip-${step.rankId}`, className)}>
      <RankEmblem rankId={step.rankId} size={14} />
      {label}
    </span>
  );
}
