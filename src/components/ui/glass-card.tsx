import { type HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

export function GlassCard({ className, hover = true, ...props }: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={clsx(
        "glass-panel rounded-2xl p-5",
        hover && "glass-panel-hover",
        className
      )}
      {...props}
    />
  );
}
