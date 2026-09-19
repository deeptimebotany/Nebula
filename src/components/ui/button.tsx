"use client";

import { type ButtonHTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

type Variant = "glow" | "ghost" | "outline" | "danger";

export function Button({
  className,
  variant = "glow",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<Variant, string> = {
    glow: "btn-glow text-white",
    outline: "border border-nebula-500/40 text-nebula-100 hover:border-aurora-400/60 hover:bg-nebula-900/40",
    ghost: "text-slate-300 hover:text-white hover:bg-white/5",
    danger: "bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20"
  };
  return <button className={clsx(base, variants[variant], className)} {...props} />;
}
