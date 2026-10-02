// Données de la page « Veille des API » (/admin/api), partagées par la route
// et la page (sans dépendance serveur).
import type { DeadlineLevel } from "./deadlines";
import type { ApiGroup, KnownAnnouncement } from "./registry";

export interface ApiDeadlineDTO {
  id: string;
  label: string;
  group: ApiGroup;
  inUse: string;
  /** Valeur réglée sur le serveur quand elle remplace la valeur par défaut (META_GRAPH_VERSION…). */
  configured: string | null;
  envVar: string | null;
  sunset: string | null;
  sunsetNote: string | null;
  reviewBy: string;
  next: { kind: "revue" | "fin"; date: string; days: number; level: DeadlineLevel };
  changelog: string;
  howTo: string;
  checkedAt: string;
}

export interface ApiSignalDTO {
  id: string;
  provider: string;
  kind: string;
  endpoint: string;
  detail: string;
  sunsetAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  handled: boolean;
}

export interface ApiWatchItemDTO {
  id: string;
  sourceKey: string;
  sourceLabel: string;
  title: string;
  url: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  createdAt: string;
  important: boolean;
  handled: boolean;
}

export interface ApiWatchSourceDTO {
  key: string;
  label: string;
  kind: "feed" | "page";
  url: string;
  lastCheckedAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  failures: number;
}

export interface ApiWatchDashboardDTO {
  now: string;
  deadlines: ApiDeadlineDTO[];
  announcements: KnownAnnouncement[];
  signals: ApiSignalDTO[];
  items: ApiWatchItemDTO[];
  sources: ApiWatchSourceDTO[];
  emailConfigured: boolean;
}
