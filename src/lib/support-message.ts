// « Écrire à l'équipe » (page Soutenir Nebula, 10/10/2026) : sujets et
// longueurs, partagés par le formulaire et la route.
export const SUPPORT_MESSAGE_KINDS = ["idee", "bug", "merci", "question", "autre"] as const;
export type SupportMessageKind = (typeof SUPPORT_MESSAGE_KINDS)[number];
export const SUPPORT_MESSAGE_MIN = 10;
export const SUPPORT_MESSAGE_MAX = 4000;

export const SUPPORT_MESSAGE_LABEL: Record<SupportMessageKind, string> = {
  idee: "Une idée",
  bug: "Un bug",
  merci: "Un encouragement",
  question: "Une question",
  autre: "Autre chose"
};

/** Sujet enregistré (lu dans Administration → Messages). */
export function supportMessageSubject(kind: SupportMessageKind): string {
  return `Application · ${SUPPORT_MESSAGE_LABEL[kind]}`;
}
