// Pseudo d'un membre dans la Communauté (lien vers sa page de profil depuis
// le 10/10/2026), avec son rang de créateur (Réussites),
// sa vitrine (jusqu'à 3 badges choisis) et la mention « Mentor » (étoile
// Communauté ★5), et le badge « Fondateur » (offres fondateurs, à vie) :
// « Lucas [Confirmé II] Fondateur Mentor 🎬 📅 ».
import Link from "next/link";
import { LevelPill } from "./level-pill";
import type { RingStyle } from "@/lib/reussites/catalog";
import { FounderBadge } from "./founder-badge";

export interface CommunityAuthorInfo {
  id: string;
  /** « @pseudo » (10/10/2026 : plus jamais le nom du compte). */
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  ring?: RingStyle | null;
  level?: number;
  levelName?: string;
  title?: string | null;
  showcase?: { key: string; emoji: string; label: string }[];
  mentor?: boolean;
  founder?: boolean;
}

export function CommunityAuthor({ author, fallback = "utilisateur" }: { author: CommunityAuthorInfo | null | undefined; fallback?: string }) {
  if (!author) return <span>{fallback}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {/* Le pseudo mène à la page de profil (10/10/2026). */}
      {author.handle ? (
        <Link href={`/community/membre/${author.handle}`} className="relative z-10 font-medium text-slate-200 transition hover:text-white hover:underline" onClick={(e) => e.stopPropagation()}>
          {author.name}
        </Link>
      ) : (
        <span>{author.name || fallback}</span>
      )}
      <LevelPill level={author.level} name={author.levelName} />
      {author.founder && <FounderBadge />}
      {author.mentor && (
        <span
          className="rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 py-px text-[10px] font-semibold leading-4 text-amber-200"
          title="Mentor : 25 réponses d'entraide dans la Communauté, dont 5 saluées par une réaction"
        >
          Mentor
        </span>
      )}
      {author.showcase && author.showcase.length > 0 && (
        <span className="inline-flex items-center gap-0.5" role="list" aria-label="Vitrine">
          {author.showcase.map((b) => (
            <span key={b.key} role="listitem" title={b.label} aria-label={b.label} className="text-[13px] leading-none">
              {b.emoji}
            </span>
          ))}
        </span>
      )}
      {author.title && <span className="text-[10px] italic text-aurora-300/90">{author.title}</span>}
    </span>
  );
}
