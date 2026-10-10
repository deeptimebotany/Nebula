// Suppression groupée (page Publications) — 10/10/2026, retour de Lucas :
// la fenêtre renvoyait à la corbeille de chaque ligne pour retirer une
// publication d'un réseau, phrase incompréhensible. Elle propose maintenant
// elle-même, réseau par réseau, « Supprimer aussi sur … » pour les
// publications déjà en ligne, comme la corbeille d'une seule publication.
// Règles pures (lues par la route, la fenêtre et les tests).
import { isOnlineTarget, remoteDeleteSupport, type RemoteDeleteTarget } from "@/lib/social/remote-delete-support";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";

export interface BulkTarget extends RemoteDeleteTarget {
  id: string;
  connection: { scopes?: string | null; status?: string | null } | null;
}

export interface BulkPost {
  id: string;
  status: string;
  targets: BulkTarget[];
}

/** Ce que la fenêtre affiche pour un réseau où des publications cochées sont en ligne. */
export interface BulkNetworkSummary {
  network: string;
  /** Publications en ligne que Nebula peut supprimer sur ce réseau. */
  viaApi: number;
  /** Publications en ligne qui y resteront (le réseau ne le permet pas, ou compte à reconnecter). */
  manual: number;
  /** Pourquoi elles resteront en ligne (si `manual` > 0). */
  why: string | null;
  /** Reconnecter le compte suffirait (lien vers Comptes connectés). */
  reconnect: boolean;
}

const label = (network: string) => NETWORK_META[network as Network]?.label ?? network;

/** « 1 vidéo », « 3 publications »… selon le réseau. */
export function bulkUnit(network: string, n: number): string {
  const word = network === "YOUTUBE" || network === "TIKTOK" ? "vidéo" : "publication";
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

/** Pourquoi des publications resteront en ligne sur un réseau (phrase au pluriel). */
export function bulkManualReason(network: string, reconnect: boolean): string {
  if (network === "YOUTUBE") return "YouTube ne permet pas à Nebula de supprimer des vidéos : supprimez-les dans YouTube Studio si vous voulez les retirer.";
  if (network === "TIKTOK") return "TikTok ne permet pas aux applications de supprimer des vidéos : supprimez-les depuis l'application TikTok si vous voulez les retirer.";
  if (reconnect) return `Reconnectez le compte ${label(network)} dans Comptes connectés pour pouvoir les supprimer depuis Nebula, ou supprimez-les depuis ${label(network)}.`;
  return `${label(network)} ne permet pas à Nebula de les supprimer : supprimez-les directement sur ${label(network)} si vous voulez les retirer.`;
}

/** Publications cochées qui seront vraiment traitées (une publication en cours d'envoi n'est jamais touchée). */
export function bulkDeletablePosts<T extends { status: string }>(posts: T[]): T[] {
  return posts.filter((p) => p.status !== "PUBLISHING");
}

/** Réseaux où des publications cochées sont en ligne, dans l'ordre habituel des réseaux. */
export function summarizeBulkOnline(posts: BulkPost[], options: { instagramDeleteEnabled?: boolean } = {}): BulkNetworkSummary[] {
  const byNetwork = new Map<string, BulkNetworkSummary>();
  for (const post of bulkDeletablePosts(posts)) {
    for (const target of post.targets) {
      if (!isOnlineTarget(target)) continue;
      const support = remoteDeleteSupport(target, target.connection, options);
      const row = byNetwork.get(target.network) ?? { network: target.network, viaApi: 0, manual: 0, why: null, reconnect: false };
      if (support.mode === "api") row.viaApi += 1;
      else {
        row.manual += 1;
        if (support.reconnect) row.reconnect = true;
      }
      byNetwork.set(target.network, row);
    }
  }
  const order = (n: string) => {
    const i = (NETWORKS as readonly string[]).indexOf(n);
    return i === -1 ? 99 : i;
  };
  return Array.from(byNetwork.values())
    .map((row) => ({ ...row, why: row.manual > 0 ? bulkManualReason(row.network, row.reconnect) : null }))
    .sort((a, b) => order(a.network) - order(b.network));
}

/** Cibles d'une publication à supprimer sur les réseaux cochés (en ligne, et que Nebula peut supprimer). */
export function bulkRemoteTargetIds(post: BulkPost, networks: string[], options: { instagramDeleteEnabled?: boolean } = {}): string[] {
  const wanted = new Set(networks);
  return post.targets
    .filter((t) => wanted.has(t.network) && isOnlineTarget(t) && remoteDeleteSupport(t, t.connection, options).mode === "api")
    .map((t) => t.id);
}

/** Message après une suppression groupée réussie. */
export function bulkDeleteMessage(deleted: number, removedOn: Record<string, number>): string {
  const nets = Object.keys(removedOn).filter((n) => removedOn[n] > 0).map(label);
  const what = deleted > 1 ? `${deleted} publications supprimées` : deleted === 1 ? "Publication supprimée" : "Aucune publication supprimée";
  if (deleted === 0) return what + ".";
  if (nets.length === 0) return `${what} de Nebula.`;
  const list = nets.length === 1 ? nets[0] : `${nets.slice(0, -1).join(", ")} et ${nets[nets.length - 1]}`;
  return `${what} de Nebula et de ${list}.`;
}
