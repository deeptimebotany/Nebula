import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Middleware (Lot 5) : deux rôles.
//
// 1. Content-Security-Policy STRICTE, avec un nonce différent à chaque
//    requête : seuls les scripts de Next.js (marqués du nonce, puis tout ce
//    qu'ils chargent, via 'strict-dynamic') et le widget Cloudflare Turnstile
//    peuvent s'exécuter. Un script injecté par une extension malveillante, une
//    dépendance compromise ou une faille XSS serait bloqué par le navigateur.
//    Avant : la politique n'était qu'en mode « rapport » (Lot 0).
//    Next.js lit l'en-tête Content-Security-Policy de la REQUÊTE pour poser
//    le nonce sur ses propres balises <script> — d'où sa présence dans
//    requestHeaders ET dans la réponse.
//    Soupape : CSP_MODE=report-only (variable d'environnement Vercel) repasse
//    en rapport seul sans redéploiement de code, si jamais quelque chose est
//    bloqué en production. En développement, le mode rapport est automatique
//    (le rechargement à chaud de Next.js a besoin d'eval).
//
// 2. Pages de l'application connectée : redirection vers /login sans
//    session (auparavant next-auth/middleware, remplacé par getToken pour
//    pouvoir poser les en-têtes ci-dessus sur la même réponse).

const PROTECTED_PREFIXES = [
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
  "/retention",
  "/reports",
  "/calendar-share",
  "/settings",
  "/interactions",
  "/comments",
  "/engagements",
  "/succes",
  "/dev-preview"
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buildCsp(nonce: string, dev: boolean): string {
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' : les scripts chargés par un script de confiance
    // (les chunks de Next.js, le widget Turnstile injecté par next/script)
    // héritent de la confiance ; l'hôte Cloudflare reste listé pour les
    // navigateurs plus anciens. 'unsafe-eval' uniquement en développement.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
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
    `connect-src 'self' https://*.blob.vercel-storage.com https://vercel.com https://challenges.cloudflare.com${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ];
  if (!dev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isProtected(pathname)) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  const dev = process.env.NODE_ENV !== "production";
  const reportOnly = dev || process.env.CSP_MODE === "report-only";
  const nonce = makeNonce();
  const csp = buildCsp(nonce, dev);
  const headerName = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(headerName, csp);
  return res;
}

export const config = {
  // Tout sauf les fichiers statiques (chunks, images optimisées, polices,
  // icônes, médias envoyés) : ils n'exécutent rien et n'ont pas besoin de
  // CSP ni de contrôle de session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|uploads/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|txt|xml|webmanifest)$).*)"]
};
