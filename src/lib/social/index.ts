import type { Network } from "@/lib/types";
import type { SocialClient } from "./base";
import { instagramClient, facebookClient } from "./meta";
import { tiktokClient } from "./tiktok";
import { youtubeClient } from "./youtube";
import { blueskyClient } from "./bluesky";
import { threadsClient } from "./threads";
import { pinterestClient } from "./pinterest";
import { linkedinClient } from "./linkedin";

export const SOCIAL_CLIENTS: Record<Network, SocialClient> = {
  INSTAGRAM: instagramClient,
  FACEBOOK: facebookClient,
  TIKTOK: tiktokClient,
  YOUTUBE: youtubeClient,
  BLUESKY: blueskyClient,
  THREADS: threadsClient,
  PINTEREST: pinterestClient,
  LINKEDIN: linkedinClient
};

export function getSocialClient(network: Network): SocialClient {
  const client = SOCIAL_CLIENTS[network];
  if (!client) throw new Error(`Réseau non supporté : ${network}`);
  return client;
}

export * from "./base";
