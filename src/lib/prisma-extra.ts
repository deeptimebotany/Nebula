import { prisma } from "@/lib/prisma";

// Accès typé aux modèles ajoutés le 25/09/2026 (Notification,
// ReferralReward, IntegrationAccount, API, publicité, Réussites). Le client Prisma est régénéré au build (npm run build →
// prisma generate), mais on ne dépend pas ici de ses types générés : ces
// interfaces minimales décrivent exactement ce que le code utilise, et
// restent compatibles avec le client réel.

export interface NotificationRow {
  id: string;
  userId: string;
  kind: string;
  category: string;
  title: string;
  body: string;
  href: string | null;
  actionLabel: string | null;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface ReferralRewardRow {
  id: string;
  beneficiaryId: string;
  refereeId: string;
  reason: string;
  status: string;
  eligibleAt: Date;
  grantedAt: Date | null;
  mode: string | null;
  brandSlug: string | null;
  refereeName: string | null;
  createdAt: Date;
}

export interface IntegrationAccountRow {
  id: string;
  userId: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyRow {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string;
  brandId: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface WebhookEndpointRow {
  id: string;
  userId: string;
  brandId: string | null;
  url: string;
  description: string | null;
  events: string[];
  secret: string;
  active: boolean;
  failureCount: number;
  lastDeliveryAt: Date | null;
  lastStatus: number | null;
  disabledReason: string | null;
  createdAt: Date;
}

export interface WebhookDeliveryRow {
  id: string;
  endpointId: string;
  event: string;
  payload: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export interface AdAccountRow {
  id: string;
  brandId: string;
  platform: string;
  externalId: string;
  name: string;
  currency: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  loginCustomerId: string | null;
  status: string;
  lastError: string | null;
  lastSyncedAt: Date | null;
  nextSyncAt: Date;
  campaigns: string | null;
  connectedAt: Date;
}

export interface AdMetricDailyRow {
  id: string;
  adAccountId: string;
  date: Date;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number | null;
}

export interface PendingAdAuthRow {
  id: string;
  userId: string;
  brandId: string;
  platform: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  accounts: string;
  createdAt: Date;
}

export interface AchievementUnlockRow {
  id: string;
  userId: string;
  key: string;
  xp: number;
  unlockedAt: Date;
  celebratedAt: Date | null;
}

export interface ChallengeCompletionRow {
  id: string;
  userId: string;
  period: string;
  challengeKey: string;
  kind: string;
  xp: number;
  completedAt: Date;
  celebratedAt: Date | null;
}

/** Champs « Réussites » du modèle User (ajoutés le 25/09/2026). */
export interface UserReussitesFields {
  creatorXp: number;
  creatorLevel: number;
  reussitesCheckedAt: Date | null;
  reussitesSeenAt: Date | null;
}

// Arguments volontairement souples (mêmes objets que l'API Prisma habituelle).
type Args = Record<string, unknown>;

interface Delegate<Row> {
  findMany(args?: Args): Promise<Row[]>;
  findFirst(args?: Args): Promise<Row | null>;
  findUnique(args: Args): Promise<Row | null>;
  create(args: Args): Promise<Row>;
  update(args: Args): Promise<Row>;
  updateMany(args: Args): Promise<{ count: number }>;
  deleteMany(args?: Args): Promise<{ count: number }>;
  count(args?: Args): Promise<number>;
}

const extra = prisma as unknown as {
  notification: Delegate<NotificationRow>;
  referralReward: Delegate<ReferralRewardRow>;
  integrationAccount: Delegate<IntegrationAccountRow> & { upsert(args: Args): Promise<IntegrationAccountRow> };
  apiKey: Delegate<ApiKeyRow>;
  webhookEndpoint: Delegate<WebhookEndpointRow>;
  webhookDelivery: Delegate<WebhookDeliveryRow>;
  adAccount: Delegate<AdAccountRow> & { upsert(args: Args): Promise<AdAccountRow> };
  adMetricDaily: Delegate<AdMetricDailyRow> & { upsert(args: Args): Promise<AdMetricDailyRow> };
  pendingAdAuth: Delegate<PendingAdAuthRow>;
  achievementUnlock: Delegate<AchievementUnlockRow> & { aggregate(args: Args): Promise<{ _sum: { xp: number | null } }> };
  challengeCompletion: Delegate<ChallengeCompletionRow> & { aggregate(args: Args): Promise<{ _sum: { xp: number | null } }> };
  user: {
    findUnique(args: Args): Promise<(UserReussitesFields & Record<string, unknown>) | null>;
    update(args: Args): Promise<unknown>;
    updateMany(args: Args): Promise<{ count: number }>;
  };
};

export const notificationDb = extra.notification;
export const referralRewardDb = extra.referralReward;
export const integrationAccountDb = extra.integrationAccount;
export const apiKeyDb = extra.apiKey;
export const webhookEndpointDb = extra.webhookEndpoint;
export const webhookDeliveryDb = extra.webhookDelivery;
export const adAccountDb = extra.adAccount;
export const adMetricDailyDb = extra.adMetricDaily;
export const pendingAdAuthDb = extra.pendingAdAuth;
export const achievementUnlockDb = extra.achievementUnlock;
export const challengeCompletionDb = extra.challengeCompletion;
/** Accès au modèle User pour les champs « Réussites » (voir UserReussitesFields). */
export const userReussitesDb = extra.user;
