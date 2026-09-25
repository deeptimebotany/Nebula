// Premier décollage (Réussites v2, lot C) — serveur.
//
// Les 7 premiers jours d'un compte, la page Réussites met en avant 5 étapes
// réelles plutôt que les missions de la semaine : connecter un réseau,
// ajouter une vidéo, programmer une publication, publier, synchroniser ses
// statistiques. Le compte créé compte déjà : départ à 20 %. Les 5 étapes
// faites (à n'importe quel moment) débloquent l'accomplissement « Décollage
// réussi » (catalog.ts, série « launch »).
import { prisma } from "@/lib/prisma";
import { ownedBy } from "@/lib/brand-access";
import type { PublishedPost } from "./posts";

export const LAUNCH_DAYS = 7;
const DAY = 86_400_000;

export interface LaunchStep {
  key: "connect" | "video" | "schedule" | "publish" | "stats";
  title: string;
  description: string;
  href: string;
  action: string;
  done: boolean;
}

export interface LaunchState {
  steps: LaunchStep[];
  done: number;
  /** 20 % au départ (compte créé), puis 16 % par étape. */
  pct: number;
  /** Compte de moins de 7 jours dont le décollage n'est pas terminé. */
  active: boolean;
  endsAt: string;
}

export async function launchState(userId: string, posts: PublishedPost[], opts: { createdAt: Date; analyticsSynced: boolean }, now: Date = new Date()): Promise<LaunchState> {
  const [connections, videos, scheduled] = await Promise.all([
    prisma.socialConnection.count({ where: { brand: ownedBy(userId) } }),
    prisma.mediaAsset.count({ where: { type: "VIDEO", brand: ownedBy(userId) } }),
    prisma.post.count({ where: { createdById: userId, scheduledAt: { not: null }, status: { not: "DRAFT" } } })
  ]);
  const steps: LaunchStep[] = [
    { key: "connect", title: "Connecter un réseau", description: "Instagram, Facebook, TikTok ou YouTube.", href: "/accounts", action: "Connecter", done: connections > 0 },
    { key: "video", title: "Ajouter une vidéo", description: "Depuis votre appareil, Canva, Drive, Dropbox ou OneDrive.", href: "/composer", action: "Ajouter", done: videos > 0 },
    { key: "schedule", title: "Programmer une publication", description: "Choisissez un jour et une heure : Nebula publie pour vous.", href: "/composer", action: "Programmer", done: scheduled > 0 },
    { key: "publish", title: "Publier", description: "Votre première publication réellement en ligne.", href: "/composer", action: "Publier", done: posts.length > 0 },
    { key: "stats", title: "Voir vos statistiques", description: "Synchronisez vos comptes dans Analytics.", href: "/analytics", action: "Synchroniser", done: opts.analyticsSynced }
  ];
  const done = steps.filter((s) => s.done).length;
  const endsAt = new Date(new Date(opts.createdAt).getTime() + LAUNCH_DAYS * DAY);
  return { steps, done, pct: 20 + done * 16, active: now < endsAt && done < steps.length, endsAt: endsAt.toISOString() };
}
