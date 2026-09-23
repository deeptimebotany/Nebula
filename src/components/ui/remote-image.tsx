"use client";

// Image distante (avatar, miniature, logo) servie par l'optimiseur d'images
// de Next.js : redimensionnée à la taille affichée, convertie en WebP/AVIF,
// chargée à la demande — au lieu d'un <img> brut qui télécharge le fichier
// original (souvent 1 080 px et plus pour une vignette de 36 px). Les
// aperçus locaux (blob:, data:) passent tels quels : rien à optimiser.
//
// Le conteneur porte les dimensions (classes h-*/w-*), l'image le remplit.
import Image from "next/image";
import { clsx } from "@/lib/clsx";

interface RemoteImageProps {
  src: string;
  alt?: string;
  /** Classes du conteneur : dimensions, arrondi, bordure… */
  className?: string;
  /** Largeur affichée, pour que l'optimiseur génère la bonne taille (ex. « 36px »). */
  sizes?: string;
  priority?: boolean;
}

function isLocalPreview(src: string): boolean {
  return src.startsWith("blob:") || src.startsWith("data:");
}

export function RemoteImage({ src, alt = "", className, sizes = "96px", priority = false }: RemoteImageProps) {
  return (
    <span className={clsx("relative block overflow-hidden", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={isLocalPreview(src)} className="object-cover" />
    </span>
  );
}
