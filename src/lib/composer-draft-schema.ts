import { z } from "zod";
import { COMPOSER_DRAFT_LIMITS } from "@/lib/composer-draft";

// Schéma serveur du brouillon du Composer (route /api/composer/draft).
export const composerDraftSchema = z.object({
  title: z.string().max(COMPOSER_DRAFT_LIMITS.title).default(""),
  caption: z.string().max(COMPOSER_DRAFT_LIMITS.caption).default(""),
  firstComment: z.string().max(COMPOSER_DRAFT_LIMITS.firstComment).optional(),
  selectedNetworks: z.array(z.string().max(30)).max(COMPOSER_DRAFT_LIMITS.networks).default([]),
  savedAt: z.number().int().nonnegative().default(0)
});
