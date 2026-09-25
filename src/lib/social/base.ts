import type { ZodType, ZodTypeDef } from "zod";
import type { AnalyticsResult, Network, PublishResult } from "@/lib/types";
import { describeIssue, endpointLabel, shapeOf } from "./contract";

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  externalAccountId: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  scopes: string;
  /** Personne qui a autorisé l'accès chez le réseau (voir SocialConnection.authUserId). */
  authUserId?: string;
}

export interface ConnectionLike {
  id: string;
  externalAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  // Présent sur les lignes SocialConnection complètes ; Bluesky y lit
  // l'adresse du serveur de données du compte (voir social/bluesky.ts).
  scopes?: string | null;
  // Nom du compte (« @cafe.nebula ») : repère les réponses du compte à ses
  // commentaires quand le réseau ne donne que le nom (Réussites, lot B).
  handle?: string | null;
}

// Réglages propres à YouTube pour une publication donnée — voir
// composer-types.ts (même forme côté client) et src/lib/social/youtube.ts
// qui les applique. Tous optionnels : absents, youtube.ts retombe sur des
// valeurs par défaut sûres (public, pas destiné aux enfants).
export interface YoutubeOptions {
  privacyStatus?: "public" | "unlisted" | "private";
  madeForKids?: boolean;
  categoryId?: string;
  tags?: string[];
  notifySubscribers?: boolean;
  playlistId?: string;
}

// Réglages Pinterest d'une publication (voir composer-types.ts et
// social/pinterest.ts). boardId absent : premier tableau du compte.
export interface PinterestOptions {
  boardId?: string;
  link?: string;
}

export interface PublishInput {
  title?: string; // utilisé notamment par YouTube comme titre de la vidéo
  caption: string;
  mediaUrls: string[]; // URLs publiquement accessibles (http/https) des médias à publier
  mediaType: "VIDEO" | "IMAGE";
  youtube?: YoutubeOptions;
  pinterest?: PinterestOptions;
  // Option « Contenu généré par l'IA » du Composer (un interrupteur par
  // réseau, voir PostTarget.metadata.aiGenerated). Transmis au réseau quand
  // son API le permet : YouTube (status.containsSyntheticMedia), TikTok
  // (post_info.is_aigc). Instagram et Facebook n'ont pas de champ pour ça :
  // publish.ts ajoute alors une mention visible à la fin de la légende.
  aiGenerated?: boolean;
  // Lieu choisi dans le Composer (voir components/composer/location-picker.tsx).
  // id = identifiant de la Page Facebook du lieu (Instagram : location_id ;
  // Facebook : place, photos uniquement) ; lat/lng quand la recherche les
  // fournit (YouTube : recordingDetails.location). TikTok : non pris en
  // charge par son API.
  location?: PublishLocation;
  // Heure limite (epoch ms) pour attendre dans la requête qu'un réseau ait
  // fini de traiter un média (lot 2). Au-delà, le client renvoie un
  // PendingPublish : la cible passe « en traitement » et le cron la
  // termine. Absent : attente courte par défaut (voir waitBudgetMs).
  waitUntil?: number;
  // Miniature choisie dans Publier pour la vidéo (MediaAsset.thumbnailUrl),
  // adresse publique. YouTube l'applique après l'envoi (thumbnails.set) ;
  // les autres réseaux l'ignorent pour l'instant.
  thumbnailUrl?: string;
}

/**
 * Publication commencée mais pas encore terminée par le réseau (vidéo en
 * cours de traitement…). Le point de reprise est enregistré sur la cible
 * (PostTarget.checkpoint) et repassé à resumePublish par le cron.
 */
export interface PendingPublish {
  pending: true;
  checkpoint: PublishCheckpoint;
  /** Délai conseillé avant la prochaine vérification. */
  retryInMs?: number;
}

export type PublishCheckpoint = { step: string } & Record<string, string | number | boolean | null>;

export type PublishOutcome = PublishResult | PendingPublish;

export function isPendingPublish(outcome: PublishOutcome): outcome is PendingPublish {
  return (outcome as PendingPublish).pending === true;
}

/** Temps restant pour attendre dans la requête (20 s au plus, jamais négatif). */
export function waitBudgetMs(input: { waitUntil?: number }, max = 20_000): number {
  const until = input.waitUntil ?? Date.now() + max;
  return Math.max(0, Math.min(max, until - Date.now()));
}

/**
 * Interroge `check` toutes les `intervalMs` jusqu'à ce qu'il renvoie une
 * valeur (≠ undefined) ou que le budget soit épuisé (renvoie undefined).
 */
export async function pollUntil<T>(check: () => Promise<T | undefined>, budgetMs: number, intervalMs = 3000): Promise<T | undefined> {
  const end = Date.now() + budgetMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() + intervalMs > end) return undefined;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export interface PublishLocation {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Un commentaire (ou, plus tard, un message privé) reçu sur une publication
 * déjà en ligne — voir SocialClient.fetchEngagement ci-dessous et la page
 * /interactions qui les affiche.
 */
export interface EngagementItemInput {
  type: "COMMENT" | "MESSAGE";
  externalId: string;
  postExternalId?: string;
  postPermalink?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  text?: string;
  permalink?: string;
  publishedAt?: Date;
  /**
   * Première réponse du compte lui-même à ce commentaire (Réussites v2,
   * lot B : étoiles « Première réponse » et « Conversation »), repérée dans
   * les réponses que le réseau renvoie avec le commentaire. Absent : aucune
   * réponse du compte vue (ou réseau qui ne les donne pas).
   */
  ownerRepliedAt?: Date;
}

/** Nom de compte sans « @ » ni majuscules, pour comparer. */
export function sameHandle(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (x: string | null | undefined) => (x ?? "").trim().replace(/^@/, "").toLowerCase();
  return Boolean(norm(a)) && norm(a) === norm(b);
}

/** Plus ancienne date d'une liste (ou undefined). */
export function earliest(dates: (Date | undefined)[]): Date | undefined {
  const valid = dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  return valid.length ? new Date(Math.min(...valid.map((d) => d.getTime()))) : undefined;
}

/**
 * Métriques d'engagement d'UNE publication déjà en ligne — voir
 * SocialClient.fetchPostMetrics ci-dessous et la page /engagements. Un champ
 * absent (undefined/null) signifie « non exposé par l'API de ce réseau »,
 * pas zéro : YouTube ne donne pas les partages, Instagram pas les vues des
 * photos, etc. La page l'affiche « — » plutôt que 0.
 */
export interface PostMetricInput {
  postExternalId: string;
  title?: string;
  permalink?: string;
  thumbnailUrl?: string;
  publishedAt?: Date;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
}

/** Publication récente d'un compte, telle que le réseau la décrit (lot 6). */
export interface RecentPost {
  externalPostId: string;
  /** Légende (ou titre pour YouTube), telle que publiée. */
  text?: string;
  permalink?: string;
  publishedAt?: Date;
}

/**
 * Contrat commun implémenté par chaque intégration réseau.
 *
 * Toutes les méthodes appellent réellement l'API officielle du réseau —
 * aucune n'est simulée. Elles échoueront tant que les identifiants
 * développeur (client id/secret) et l'approbation de l'app par la
 * plateforme concernée n'auront pas été obtenus (voir README.md et
 * src/lib/types.ts → NETWORK_META[...].requiresAudit).
 */
export interface SocialClient {
  network: Network;
  getAuthUrl(state: string): string;
  exchangeCodeForToken(code: string): Promise<OAuthTokenResult>;
  /**
   * Publie, ou commence à publier : un PendingPublish signifie que le réseau
   * traite encore le média (voir resumePublish).
   */
  publishPost(connection: ConnectionLike, input: PublishInput): Promise<PublishOutcome>;
  /**
   * Reprend une publication « en traitement » à partir de son point de
   * reprise (appelé par le cron, voir lib/publish.ts → advanceProcessingTargets).
   * Ne doit JAMAIS republier une étape déjà faite.
   */
  resumePublish?(connection: ConnectionLike, input: PublishInput, checkpoint: PublishCheckpoint): Promise<PublishOutcome>;
  fetchAnalytics(connection: ConnectionLike): Promise<AnalyticsResult>;
  /**
   * Ajoute le "premier commentaire" (voir bulle dédiée dans le Composer) sur
   * une publication déjà publiée. Optionnel : tous les réseaux ne le
   * supportent pas encore (voir src/lib/social/*.ts) — l'appelant
   * (src/lib/publish.ts) vérifie sa présence avant d'appeler, et traite tout
   * échec comme non-bloquant (la publication elle-même reste un succès).
   */
  postComment?(connection: ConnectionLike, externalPostId: string, comment: string): Promise<void>;
  /**
   * Récupère les commentaires reçus sur les publications récentes de ce
   * compte — alimente la boîte de réception /interactions (voir la page
   * Comptes → menu déroulant d'un compte → "Interactions"). Optionnel :
   * certains réseaux ne l'exposent pas via leur API publique (voir
   * tiktok.ts, qui ne l'implémente pas) — l'appelant (/api/engagement/sync)
   * vérifie sa présence avant d'appeler et affiche un message clair sinon.
   */
  fetchEngagement?(connection: ConnectionLike): Promise<EngagementItemInput[]>;
  /**
   * Récupère les métriques (vues, likes, commentaires, partages,
   * enregistrements) des publications récentes de ce compte — alimente la
   * page /engagements. Optionnel, comme fetchEngagement : l'appelant
   * (/api/engagements/sync) vérifie sa présence. Chaque réseau remplit ce
   * qu'il expose et laisse le reste à null.
   */
  fetchPostMetrics?(connection: ConnectionLike): Promise<PostMetricInput[]>;
  /**
   * Dernières publications du compte, en un seul appel léger (sans
   * statistiques). Sert à vérifier si un envoi incertain (délai dépassé,
   * envoi interrompu) est en fait en ligne, AVANT de le renvoyer — voir
   * lib/social/reconcile.ts (lot 6). Optionnel.
   */
  listRecentPosts?(connection: ConnectionLike): Promise<RecentPost[]>;
}

/**
 * Tout service externe appelé par la porte commune (lots 8 et 9) : réseaux
 * sociaux, régies publicitaires, sources d'import de médias, IA, e-mails et
 * anti-robot. Même délai, même classement des erreurs, mêmes contrats.
 */
export type Provider =
  | Network
  | "GOOGLE_ADS"
  | "META_ADS"
  | "TIKTOK_ADS"
  | "GOOGLE_DRIVE"
  | "DROPBOX"
  | "ONEDRIVE"
  | "UNSPLASH"
  | "CANVA"
  // Services du site (lot 9) : IA, e-mails, anti-robot.
  | "GEMINI"
  | "RESEND"
  | "TURNSTILE";

/** Erreur d'un service externe (réseau social, régie, source d'import). */
export class SocialApiError extends Error {
  /** Délai demandé par le réseau avant de réessayer (en-tête Retry-After), en ms. */
  public retryAfterMs?: number;

  constructor(
    public network: Provider,
    message: string,
    public status?: number,
    public raw?: unknown,
    /** Code d'erreur du réseau (Meta : code/sous-code, TikTok : error.code…), pour le diagnostic et le classement (voir errors.ts). */
    public code?: string
  ) {
    super(`[${network}] ${message}`);
  }

  /** Refus du réseau pour cette requête précise (4xx hors expiration de connexion). */
  get isRequestRejected(): boolean {
    return typeof this.status === "number" && this.status >= 400 && this.status < 500 && this.status !== 401 && this.status !== 429;
  }
}

/** Délai par défaut d'un appel à un réseau (lot 2) : plus jamais d'attente sans fin. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Options d'un appel à un réseau.
 *  - `timeoutMs` : délai (30 s par défaut) ;
 *  - `readOnly` : requête POST qui ne fait que LIRE (statut d'une vidéo
 *    TikTok, liste de vidéos…) : relancée comme une lecture et, sans
 *    réponse, décrite comme une lecture (rien n'a pu être publié) ;
 *  - `schema` (fetchJson) : contrat de la réponse (voir contract.ts).
 */
export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  readOnly?: boolean;
}

function describeTimeout(read: boolean): string {
  return read
    ? "le réseau n'a pas répondu à temps. Réessayez dans quelques minutes."
    : "le réseau n'a pas répondu à temps. La publication a peut-être quand même été faite : vérifiez sur le réseau avant de relancer.";
}

/** Codes posés quand aucune réponse (complète) n'est arrivée (voir errors.ts). */
export const NO_RESPONSE_CODES = {
  /** Délai dépassé : la requête a peut-être abouti. */
  TIMEOUT: "TIMEOUT",
  /** Connexion impossible AVANT l'envoi (DNS, refus) : rien n'a été envoyé. */
  UNREACHABLE: "UNREACHABLE",
  /** Connexion coupée en cours de route : la requête a peut-être abouti. */
  CONNECTION_LOST: "CONNECTION_LOST"
} as const;

/**
 * Code posé quand le réseau a répondu « OK » mais dans une forme qui ne
 * respecte pas le contrat attendu (lot 7, voir contract.ts). Pour une
 * publication, l'envoi a peut-être abouti : même prudence qu'un délai dépassé.
 */
export const UNEXPECTED_RESPONSE = "UNEXPECTED_RESPONSE";

const UNREACHABLE_CAUSES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);

/** Lit l'en-tête Retry-After (secondes ou date HTTP), en millisecondes. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, at - now);
  return undefined;
}

// Lectures (GET, ou POST marqué readOnly) : jusqu'à 2 nouvelles tentatives
// sur une panne passagère ou une limite de débit, en respectant Retry-After,
// avec 8 s d'attente au plus en tout. Jamais pour une écriture : un envoi
// répété pourrait publier deux fois (lot 5).
const GET_RETRIES = 2;
const GET_RETRY_MAX_WAIT_MS = 8_000;
const RETRYABLE_GET_STATUS = new Set([429, 500, 502, 503]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRead(method: string, readOnly?: boolean): boolean {
  return method === "GET" || readOnly === true;
}

/** Relance une LECTURE après une panne passagère (voir ci-dessus). */
export async function withReadRetries<T>(once: () => Promise<T>): Promise<T> {
  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await once();
    } catch (err) {
      if (!(err instanceof SocialApiError) || attempt >= GET_RETRIES) throw err;
      const retryable = err.code === NO_RESPONSE_CODES.UNREACHABLE || (err.status !== undefined && RETRYABLE_GET_STATUS.has(err.status) && !err.code?.startsWith("TIMEOUT"));
      if (!retryable) throw err;
      const delay = Math.min(err.retryAfterMs ?? 500 * 2 ** attempt, GET_RETRY_MAX_WAIT_MS - waited);
      if (delay <= 0 || (err.retryAfterMs ?? 0) > GET_RETRY_MAX_WAIT_MS) throw err;
      waited += delay;
      await sleep(delay);
    }
  }
}

function noResponseError(network: Provider, err: unknown, read: boolean): SocialApiError {
  const name = (err as Error).name;
  if (name === "TimeoutError" || name === "AbortError") {
    return new SocialApiError(network, describeTimeout(read), 504, undefined, NO_RESPONSE_CODES.TIMEOUT);
  }
  const cause = ((err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code) || "";
  const code = UNREACHABLE_CAUSES.has(cause) ? NO_RESPONSE_CODES.UNREACHABLE : NO_RESPONSE_CODES.CONNECTION_LOST;
  return new SocialApiError(network, `connexion au réseau impossible (${(err as Error).message}).`, 503, undefined, code);
}

/**
 * LA porte de sortie vers un réseau (lot 7) : tout appel d'un client réseau
 * passe ici (ou par fetchJson, qui l'utilise). Délai garanti, et une absence
 * de réponse devient une SocialApiError classée (TIMEOUT, UNREACHABLE,
 * CONNECTION_LOST) au lieu d'une erreur brute « inconnue ».
 * Ne lit pas le corps et ne lève rien sur un statut d'erreur : voir
 * readBody / errorFromResponse.
 */
export async function sendRequest(network: Provider, url: string, init: RequestOptions = {}): Promise<Response> {
  const { timeoutMs, readOnly, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  try {
    return await fetch(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS) });
  } catch (err) {
    throw noResponseError(network, err, isRead(method, readOnly));
  }
}

/**
 * JSON d'un réseau, sans jamais arrondir un grand entier : un identifiant
 * de 19 chiffres (vidéo TikTok…) dépasse la précision des nombres
 * JavaScript et deviendrait un AUTRE identifiant. Il est gardé en texte
 * (lecture du texte source, Node 22).
 */
export function parseProviderJson(text: string): unknown {
  return JSON.parse(text, function (_key: string, value: unknown, context?: { source?: string }) {
    if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value) && context?.source && /^-?\d+$/.test(context.source)) {
      return context.source;
    }
    return value;
  });
}

/** Corps d'une réponse (texte + JSON s'il y en a). Coupure pendant la lecture : erreur classée. */
export async function readBody(network: Provider, res: Response, method = "GET", readOnly?: boolean): Promise<{ text: string; json: unknown }> {
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    const classified = noResponseError(network, err, isRead(method.toUpperCase(), readOnly));
    // La réponse avait commencé : jamais « injoignable avant l'envoi ».
    if (classified.code === NO_RESPONSE_CODES.UNREACHABLE) classified.code = NO_RESPONSE_CODES.CONNECTION_LOST;
    throw classified;
  }
  let json: unknown = undefined;
  try {
    json = text ? parseProviderJson(text) : undefined;
  } catch {
    // réponse non-JSON (rare, souvent une erreur HTML de la plateforme)
  }
  return { text, json };
}

/** Erreur d'un réseau à partir d'une réponse non-OK (message, code, Retry-After). */
export function errorFromResponse(network: Provider, res: Response, text: string, json: unknown): SocialApiError {
  const error = (json as { error?: { message?: string; code?: number | string; error_subcode?: number; fbtrace_id?: string } })?.error;
  const message =
    (typeof error === "object" && error?.message) ||
    (json as { message?: string })?.message ||
    (json as { error_description?: string })?.error_description ||
    // Jamais tout un document HTML dans un message d'erreur.
    (text && !text.trimStart().startsWith("<") ? text.slice(0, 300) : "") ||
    res.statusText ||
    `erreur ${res.status}`;
  const code = typeof error === "object" && error?.code !== undefined ? `${error.code}${error.error_subcode ? `/${error.error_subcode}` : ""}` : undefined;
  const apiError = new SocialApiError(network, String(message), res.status, json, code);
  apiError.retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
  return apiError;
}

/**
 * Vérifie une réponse contre son contrat (lot 7). Écart : SocialApiError
 * UNEXPECTED_RESPONSE qui nomme le champ et l'adresse, et forme reçue
 * (sans valeurs) dans les journaux, pour mettre le contrat à jour.
 */
export function checkShape<T>(network: Provider, schema: ZodType<T, ZodTypeDef, unknown>, json: unknown, endpoint: string, status?: number): T {
  const parsed = schema.safeParse(json);
  if (parsed.success) return parsed.data;
  const issue = describeIssue(parsed.error.issues[0]);
  const shape = shapeOf(json);
  console.warn(`[contrat] ${network} ${endpoint} : ${issue}. Forme reçue : ${JSON.stringify(shape).slice(0, 2000)}`);
  return throwUnexpected(network, `réponse dans un format inattendu (${endpoint} : ${issue}).`, status, shape);
}

/** Lève l'erreur « réponse inattendue » (utile quand l'écart est hors JSON : en-tête manquant…). */
export function throwUnexpected(network: Provider, message: string, status?: number, shape?: unknown): never {
  throw new SocialApiError(network, message, status, shape === undefined ? undefined : { shape }, UNEXPECTED_RESPONSE);
}

/**
 * Appel JSON à un réseau. Avec `schema`, la réponse est vérifiée et typée
 * par son contrat ; sans, elle est renvoyée telle quelle (`unknown`) — à
 * réserver aux réponses que l'appelant n'utilise pas.
 */
export async function fetchJson<T = unknown>(
  network: Provider,
  url: string,
  init?: RequestOptions & { schema?: ZodType<T, ZodTypeDef, unknown> }
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (!isRead(method, init?.readOnly)) return fetchJsonOnce<T>(network, url, init);
  return withReadRetries(() => fetchJsonOnce<T>(network, url, init));
}

async function fetchJsonOnce<T>(network: Provider, url: string, init?: RequestOptions & { schema?: ZodType<T, ZodTypeDef, unknown> }): Promise<T> {
  const { schema, ...rest } = init ?? {};
  const method = (rest.method ?? "GET").toUpperCase();
  const res = await sendRequest(network, url, rest);
  const { text, json } = await readBody(network, res, method, rest.readOnly);
  if (!res.ok) throw errorFromResponse(network, res, text, json);
  return schema ? checkShape(network, schema, json, endpointLabel(method, url), res.status) : (json as T);
}

/**
 * Télécharge un média de Nebula (fichier à envoyer au réseau). Rien n'a
 * encore été envoyé au réseau : une panne ici se relance sans risque
 * (code UNREACHABLE), un fichier introuvable est un problème de média.
 */
export async function downloadMedia(network: Provider, url: string, timeoutMs = 60_000): Promise<{ bytes: ArrayBuffer; type: string }> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new SocialApiError(network, `média momentanément inaccessible (${(err as Error).name === "TimeoutError" ? "téléchargement trop long" : (err as Error).message}).`, 503, undefined, NO_RESPONSE_CODES.UNREACHABLE);
  }
  if (res.status >= 500) throw new SocialApiError(network, `média momentanément inaccessible (${res.status}).`, 503, undefined, NO_RESPONSE_CODES.UNREACHABLE);
  if (!res.ok) throw new SocialApiError(network, `média introuvable ou inaccessible (${res.status}) : remplacez le fichier puis relancez.`);
  try {
    return { bytes: await res.arrayBuffer(), type: (res.headers.get("content-type") || "application/octet-stream").split(";")[0] };
  } catch (err) {
    throw new SocialApiError(network, `média momentanément inaccessible (${(err as Error).message}).`, 503, undefined, NO_RESPONSE_CODES.UNREACHABLE);
  }
}
