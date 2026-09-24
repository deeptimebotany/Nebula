// Nom d'un membre dans la Communauté, avec son badge de niveau de créateur
// et son titre (Réussites) : « Lucas Niv. 4 Régulier · Créateur régulier ».
import { LevelPill } from "./level-pill";

export interface CommunityAuthorInfo {
  id: string;
  name: string;
  level?: number;
  levelName?: string;
  title?: string | null;
}

export function CommunityAuthor({ author, fallback = "utilisateur" }: { author: CommunityAuthorInfo | null | undefined; fallback?: string }) {
  if (!author) return <span>{fallback}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      <span>{author.name || fallback}</span>
      <LevelPill level={author.level} name={author.levelName} />
      {author.title && <span className="text-[10px] italic text-aurora-300/90">{author.title}</span>}
    </span>
  );
}
