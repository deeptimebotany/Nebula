// Schéma zod des liens publics (serveur) — voir safe-url.ts.
import { z } from "zod";
import { isSafeLinkUrl } from "@/lib/safe-url";

/** Schéma zod d'un lien public (http, https, mailto, tel). */
export function linkUrlSchema(max = 500) {
  return z
    .string()
    .trim()
    .url()
    .max(max)
    .refine(isSafeLinkUrl, "Adresse non autorisée : utilisez un lien https://, http://, mailto: ou tel:.");
}
