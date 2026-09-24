// Petit badge de niveau de créateur (« Niv. 4 »), avec le nom du niveau en
// info-bulle : Communauté (à côté du prénom), « Mon profil ».
import { clsx } from "@/lib/clsx";
import { levelName } from "@/lib/reussites/catalog";

export function LevelPill({ level, name, className }: { level: number | null | undefined; name?: string; className?: string }) {
  if (!level || level < 1) return null;
  const label = name ?? levelName(level);
  const top = level >= 7;
  return (
    <span
      title={`Niveau ${level} · ${label}`}
      aria-label={`Niveau de créateur ${level}, ${label}`}
      className={clsx(
        "inline-flex items-center rounded-full border px-1.5 text-[10px] font-semibold leading-4 tabular-nums",
        top ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : level >= 4 ? "border-aurora-400/40 bg-aurora-400/10 text-aurora-200" : "border-white/15 bg-white/[0.04] text-slate-300",
        className
      )}
    >
      Niv. {level}
      <span className="ml-1 font-normal opacity-80">{label}</span>
    </span>
  );
}
