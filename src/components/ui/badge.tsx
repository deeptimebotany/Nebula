// Pastille d'état/étiquette partagée : une seule échelle de tons pour tout
// le site (statut de publication, palier, verrou, nouveauté...), au lieu de
// pastilles recomposées à la main page par page avec des tailles
// différentes.
import type { HTMLAttributes, ReactNode } from "react";
import { clsx } from "@/lib/clsx";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "premium";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-slate-300",
  info: "border-aurora-400/40 bg-aurora-400/10 text-aurora-300",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  danger: "border-red-400/40 bg-red-400/10 text-red-300",
  premium: "border-amber-300/50 bg-gradient-to-r from-amber-400/15 to-fuchsia-400/15 text-amber-200"
};

export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; icon?: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        TONES[tone],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
