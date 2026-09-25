// Versions des API des réseaux, en UN seul endroit (lot 2, fiabilité).
//
// Avant, chaque fichier avait la sienne et la version Meta (v19.0) avait
// expiré le 21/05/2026 sans que personne ne s'en aperçoive : Meta bascule
// alors les appels, en silence, vers la plus ancienne version encore en
// service. Chaque version a ici sa date de revue (quelques mois avant sa fin
// de vie annoncée) : à cette date, vérifier le changelog, tester, monter.
//
// Changelogs :
//  - Meta (Facebook, Instagram) : https://developers.facebook.com/docs/graph-api/changelog/versions
//  - Threads : https://developers.facebook.com/docs/threads/changelog
//  - TikTok : https://developers.tiktok.com/doc/changelog
//  - YouTube : https://developers.google.com/youtube/v3/revision_history
//  - LinkedIn : https://learn.microsoft.com/linkedin/marketing/versioning
//  - Pinterest : https://developers.pinterest.com/docs/changelog/
//  - Google Ads : https://developers.google.com/google-ads/api/docs/sunset-dates
//  - TikTok (publicité) : https://business-api.tiktok.com/portal/docs
export const API_VERSIONS = {
  // Graph API Meta (pages Facebook, Instagram, publicité Meta). v25.0 :
  // sortie le 18/02/2026, en service jusqu'au 29/07/2028.
  META_GRAPH: { version: "v25.0", reviewBy: "2028-03-01" },
  THREADS: { version: "v1.0", reviewBy: "2027-03-01" },
  // LinkedIn retire chaque version mensuelle au bout d'environ un an.
  LINKEDIN: { version: "202607", reviewBy: "2027-05-01" },
  PINTEREST: { version: "v5", reviewBy: "2027-09-01" },
  TIKTOK: { version: "v2", reviewBy: "2027-09-01" },
  YOUTUBE_DATA: { version: "v3", reviewBy: "2027-09-01" },
  // Régies publicitaires (lot 8). Google Ads retire chaque version environ
  // un an après sa sortie (rappels : ads-developers.googleblog.com).
  GOOGLE_ADS: { version: "v25", reviewBy: "2027-05-01" },
  TIKTOK_ADS: { version: "v1.3", reviewBy: "2027-09-01" },
  // Services du site (lot 9). Stripe garde les anciennes versions en
  // service : la monter est un choix (changelog : docs.stripe.com/upgrades).
  STRIPE: { version: "2024-06-20", reviewBy: "2027-06-01" }
} as const;

/** Version de la Graph API Meta (META_GRAPH_VERSION permet de la changer sans redéployer le code). */
export function metaGraphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || API_VERSIONS.META_GRAPH.version;
}

/** Version LinkedIn (LINKEDIN_API_VERSION permet de la changer sans toucher au code). */
export function linkedinApiVersion(): string {
  return process.env.LINKEDIN_API_VERSION?.trim() || API_VERSIONS.LINKEDIN.version;
}

/** Version de l'API Google Ads (GOOGLE_ADS_API_VERSION permet de la changer sans redéployer le code). */
export function googleAdsApiVersion(): string {
  return process.env.GOOGLE_ADS_API_VERSION?.trim() || API_VERSIONS.GOOGLE_ADS.version;
}
