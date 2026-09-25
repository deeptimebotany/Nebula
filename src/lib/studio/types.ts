// Studio IA (produit n°9) — types partagés serveur et navigateur.
import type { Network } from "@/lib/types";
import type { StudioFacts, TopPost } from "./facts";

export type StudioKind = "ideas" | "script";
export type VideoFormat = "court" | "long";

export const FORMAT_LABEL: Record<VideoFormat, string> = { court: "Format court (60 s ou moins)", long: "Vidéo longue (8 à 12 min)" };

export interface IdeasInput {
  network: Network | null;
  theme: string;
}

export interface ScriptInput {
  subject: string;
  format: VideoFormat;
  network: Network | null;
  /** Idée d'origine (génération + numéro), quand le script part d'une idée. */
  fromIdea?: { generationId: string; index: number } | null;
}

export interface StudioIdea {
  title: string;
  angle: string;
  format: VideoFormat;
  network: Network | null;
  /** Publication réelle dont l'idée s'inspire (numéro de TopPost.ref), ou null. */
  basedOn: number | null;
  hooks: string[];
}

export interface ScriptSection {
  label: string;
  content: string;
  /** Repère de rétention calculé sur les VRAIES courbes (jamais écrit par l'IA). */
  retentionNote: string | null;
}

export interface StudioScript {
  title: string;
  format: VideoFormat;
  hook: string;
  sections: ScriptSection[];
  cta: string;
  description: string;
  hashtags: string[];
}

export type StudioOutput = { kind: "ideas"; ideas: StudioIdea[] } | { kind: "script"; script: StudioScript };

export interface StudioGenerationDTO {
  id: string;
  kind: StudioKind;
  createdAt: string;
  input: IdeasInput | ScriptInput;
  output: StudioOutput;
  /** Publications citées, avec leurs chiffres au moment de la génération. */
  sources: TopPost[];
}

export interface StudioHistoryItem {
  id: string;
  kind: StudioKind;
  createdAt: string;
  title: string;
}

export interface StudioQuota {
  /** 0 = palier sans génération (aperçu seulement). */
  limit: number;
  used: number;
  remaining: number;
  /** L'IA est configurée sur le site (GEMINI_API_KEY). */
  aiConfigured: boolean;
}

export interface StudioPageDTO {
  facts: StudioFacts;
  quota: StudioQuota;
  history: StudioHistoryItem[];
}

/** Titre court d'une génération (historique). */
export function generationTitle(output: StudioOutput): string {
  if (output.kind === "script") return output.script.title;
  const first = output.ideas[0]?.title ?? "Idées";
  return output.ideas.length > 1 ? `${first} (+${output.ideas.length - 1})` : first;
}

/** Ce que « Utiliser dans Publier » met dans l'éditeur. */
export function composerDraftFrom(output: StudioOutput, index = 0): { title: string; caption: string; network: Network | null } | null {
  if (output.kind === "script") {
    const s = output.script;
    const tags = s.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    return { title: s.title, caption: [s.description, tags].filter(Boolean).join("\n\n"), network: null };
  }
  const idea = output.ideas[index];
  if (!idea) return null;
  // L'angle s'adresse au créateur ; l'accroche, au public : c'est elle qui ouvre la légende.
  return { title: idea.title, caption: idea.hooks[0] ?? "", network: idea.network };
}
