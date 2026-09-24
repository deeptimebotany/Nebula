"use client";

// Image distante (avatar, miniature, logo) servie par l'optimiseur d'images
// de Next.js : redimensionnée à la taille affichée, convertie en WebP/AVIF,
// chargée à la demande — au lieu d'un <img> brut qui télécharge le fichier
// original (souvent 1 080 px et plus pour une vignette de 36 px). Les
// aperçus locaux (blob:, data:) passent tels quels : rien à optimiser.
//
// Le conteneur porte les dimensions (classes h-*/w-*), l'image le remplit.
//
// Jamais d'icône d'« image cassée » (24/09/2026) : si l'adresse n'est pas
// une image (ex. le fichier d'une vidéo sans miniature) ou si le chargement
// échoue (fichier supprimé, lien expiré), on affiche `fallback` — ou, à
// défaut, une simple tuile neutre.
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { clsx } from "@/lib/clsx";

interface RemoteImageProps {
  src: string;
  alt?: string;
  /** Classes du conteneur : dimensions, arrondi, bordure… */
  className?: string;
  /** Largeur affichée, pour que l'optimiseur génère la bonne taille (ex. « 36px »). */
  sizes?: string;
  priority?: boolean;
  /** Affiché à la place de l'image si elle ne peut pas être chargée. */
  fallback?: ReactNode;
}

function isLocalPreview(src: string): boolean {
  return src.startsWith("blob:") || src.startsWith("data:");
}

/** Fichier vidéo (et non image) : l'optimiseur d'images ne peut rien en faire. */
export function looksLikeVideo(src: string): boolean {
  return /\.(mp4|mov|m4v|webm|mkv|avi)(\?|#|$)/i.test(src);
}

export function RemoteImage({ src, alt = "", className, sizes = "96px", priority = false, fallback }: RemoteImageProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed || looksLikeVideo(src)) {
    return (
      <span className={clsx("relative block overflow-hidden", className)}>
        {fallback ?? <span className="block h-full w-full bg-white/[0.06]" aria-hidden="true" />}
      </span>
    );
  }
  return (
    <span className={clsx("relative block overflow-hidden", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={isLocalPreview(src)} className="object-cover" onError={() => setFailed(true)} />
    </span>
  );
}
