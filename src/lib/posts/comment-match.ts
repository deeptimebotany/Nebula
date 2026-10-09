// Commentaires d'une publication Nebula (09/10/2026, bouton « Commentaires »
// de la page Publications → /comments?post=<id>). Un commentaire synchronisé
// appartient à une cible de la publication s'il vient du même compte et
// porte sur la même publication du réseau : même identifiant (ou la forme
// « page_publication » de Facebook dans un sens ou dans l'autre), sinon
// même lien. Module sans base de données : importable côté navigateur.

export interface CommentRef {
  connectionId: string;
  postExternalId: string | null;
  postPermalink: string | null;
}

export interface TargetRef {
  connectionId: string;
  externalPostId: string | null;
  externalUrl: string | null;
}

const bare = (url: string) => url.split("?")[0].replace(/\/$/, "");

export function commentOfTarget(comment: CommentRef, target: TargetRef): boolean {
  if (comment.connectionId !== target.connectionId) return false;
  const a = comment.postExternalId;
  const b = target.externalPostId;
  if (a && b && (a === b || a.endsWith(`_${b}`) || b.endsWith(`_${a}`))) return true;
  if (comment.postPermalink && target.externalUrl && bare(comment.postPermalink) === bare(target.externalUrl)) return true;
  return false;
}

export function commentOfPost(comment: CommentRef, targets: TargetRef[]): boolean {
  return targets.some((t) => commentOfTarget(comment, t));
}
