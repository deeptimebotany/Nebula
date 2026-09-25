// Politique de sécurité du contenu (CSP) et classement des pages — lot 11.
//
// Deux niveaux, choisis par le middleware selon l'adresse :
//
//  - STRICT (nonce) : un code aléatoire différent à chaque requête est posé
//    sur les scripts de Next.js ; tout autre script est bloqué, même écrit
//    dans la page. Réservé aux pages qui affichent du contenu écrit par des
//    utilisateurs (application, page bio, pages client à jeton), aux pages
//    de connexion et aux routes /api. Ces pages sont rendues à chaque
//    visite (le nonce change) : `export const dynamic = "force-dynamic"`
//    dans la page ou son layout, vérifié par tests/quality/csp.test.ts.
//
//  - VITRINE (sans nonce) : scripts du site et scripts écrits dans la page
//    ('unsafe-inline'), pour pouvoir servir la page pré-générée depuis le
//    cache de Vercel (le nonce d'une page pré-générée serait figé). Pour les
//    pages dont Lucas écrit tout le contenu : accueil, tarifs, outils,
//    comparatifs… (liste STATIC_PAGES). Toute autre règle est identique.
//
// Module sans dépendance serveur : utilisé par le middleware (Edge) et par
// le navigateur (CspDocumentGuard).

/** Application connectée : connexion obligatoire (redirection vers /login). */
export const APP_PREFIXES = [
  "/dashboard",
  "/calendar",
  "/composer",
  "/publications",
  "/analytics",
  "/accounts",
  "/billing",
  "/posts",
  "/support",
  "/community",
  "/link-in-bio",
  "/media-kit",
  "/retention",
  "/reports",
  "/calendar-share",
  "/settings",
  "/interactions",
  "/comments",
  "/engagements",
  "/succes",
  "/reussites",
  "/studio",
  "/automatisations",
  "/admin",
  "/dev-preview"
] as const;

/** Pages publiques qui affichent du contenu écrit par un utilisateur. */
export const USER_CONTENT_PREFIXES = ["/l", "/approve", "/calendrier", "/rapport", "/decouvrir/page-bio", "/audit", "/kit", "/decouvrir/media-kit"] as const;

/** Connexion, inscription, mot de passe : pas de contenu d'utilisateur, mais des identifiants. */
export const AUTH_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password"] as const;

/** Autres adresses rendues à chaque requête. */
export const OTHER_STRICT_PREFIXES = ["/suppression-donnees", "/api"] as const;

/**
 * Pages de la vitrine, pré-générées au build et servies depuis le cache
 * (CSP vitrine). Toute nouvelle page doit être classée : ici, ou dans un
 * des préfixes ci-dessus (tests/quality/csp.test.ts échoue sinon).
 */
export const STATIC_PAGES = [
  "/",
  "/tarifs",
  "/alternatives",
  "/alternatives/[slug]",
  "/reseaux",
  "/reseaux/[slug]",
  "/prix/[slug]",
  "/outils",
  "/outils/audit",
  "/outils/bio-instagram",
  "/outils/hashtags",
  "/outils/legendes",
  "/outils/meilleur-moment",
  "/outils/miniatures",
  "/outils/taux-engagement",
  "/outils/titre-youtube",
  "/legal",
  "/securite",
  "/contact",
  "/decouvrir/rapports-clients"
] as const;

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Connexion obligatoire. */
export function isAppPath(pathname: string): boolean {
  return matches(pathname, APP_PREFIXES);
}

/** CSP stricte (nonce) pour cette adresse ; sinon CSP vitrine. */
export function usesStrictCsp(pathname: string): boolean {
  return (
    matches(pathname, APP_PREFIXES) ||
    matches(pathname, USER_CONTENT_PREFIXES) ||
    matches(pathname, AUTH_PREFIXES) ||
    matches(pathname, OTHER_STRICT_PREFIXES)
  );
}

/**
 * Pages qui ne doivent jamais tourner dans un document chargé avec la CSP
 * vitrine (contenu d'utilisateurs) : si on y arrive par un lien interne
 * depuis la vitrine, la page est rechargée (voir CspDocumentGuard).
 */
export function needsStrictDocument(pathname: string): boolean {
  return matches(pathname, APP_PREFIXES) || matches(pathname, USER_CONTENT_PREFIXES);
}

export function buildCsp({ nonce, dev }: { nonce: string | null; dev: boolean }): string {
  const scriptSrc = nonce
    ? // 'strict-dynamic' : les scripts chargés par un script de confiance
      // (les chunks de Next.js, le widget Turnstile injecté par next/script)
      // héritent de la confiance ; l'hôte Cloudflare reste listé pour les
      // navigateurs plus anciens.
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`
    : // Vitrine : scripts du site (fichiers de Next.js) et scripts écrits
      // dans la page pré-générée (données de rendu de Next.js).
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com";
  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' uniquement en développement (rechargement à chaud).
    `${scriptSrc}${dev ? " 'unsafe-eval'" : ""}`,
    // Styles inline : styled-jsx, framer-motion et Recharts posent des
    // attributs style — indispensable, et sans risque d'exécution de code.
    "style-src 'self' 'unsafe-inline'",
    // Images et médias : avatars des réseaux sociaux (CDN variés), Vercel
    // Blob, aperçus locaux (blob:/data:).
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Appels réseau : API du site, envoi direct vers Vercel Blob, Turnstile ;
    // le websocket de rechargement à chaud en développement.
    // vercel.com : le SDK @vercel/blob (upload() côté navigateur) contacte
    // https://vercel.com/api/blob pendant l'étape de génération du jeton,
    // avant même le transfert vers *.blob.vercel-storage.com — sans cette
    // entrée, la CSP bloque l'envoi de fichier dès le départ (constaté en
    // production : erreur "Refused to connect" sur vercel.com/api/blob).
    // Import de médias (lot 3) : le sélecteur Google Drive charge ses
    // scripts depuis apis.google.com / accounts.google.com (autorisés par
    // 'strict-dynamic', puisqu'ils sont injectés par notre propre code) et
    // s'affiche dans une iframe docs.google.com ; Dropbox et Microsoft
    // ouvrent des fenêtres séparées, non concernées. Les fichiers eux-mêmes
    // sont téléchargés par le serveur, jamais par le navigateur.
    `connect-src 'self' https://*.blob.vercel-storage.com https://vercel.com https://challenges.cloudflare.com https://*.googleapis.com${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src https://challenges.cloudflare.com https://docs.google.com https://drive.google.com https://accounts.google.com https://content.googleapis.com https://www.dropbox.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ];
  if (!dev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
