"use client";

import Link, { type LinkProps } from "next/link";
import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { clsx } from "@/lib/clsx";

type Variant = "glow" | "ghost" | "outline" | "danger";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANTS: Record<Variant, string> = {
  glow: "btn-glow text-white",
  outline: "border border-nebula-500/40 text-nebula-100 hover:border-aurora-400/60 hover:bg-nebula-900/40",
  ghost: "text-slate-300 hover:text-white hover:bg-white/5",
  danger: "bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20"
};

/** Classes d'un bouton, réutilisables sur un lien (voir ButtonLink). */
export function buttonClasses(variant: Variant = "glow", className?: string): string {
  return clsx(BASE, VARIANTS[variant], className);
}

export function Button({
  className,
  variant = "glow",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}

// Lien habillé en bouton : un vrai <a> (navigation, ouverture dans un nouvel
// onglet, un seul arrêt de focus au clavier) — et non plus un <button>
// imbriqué dans un <Link>, qui produisait du HTML invalide.
export function ButtonLink({
  className,
  variant = "glow",
  children,
  ...props
}: LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { variant?: Variant; children: ReactNode }) {
  return (
    <Link className={buttonClasses(variant, className)} {...props}>
      {children}
    </Link>
  );
}
