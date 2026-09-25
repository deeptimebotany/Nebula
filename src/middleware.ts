import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_SECONDS, attributionFromSearchParams, parseAttributionCookie, serializeAttribution } from "@/lib/growth-attribution";
import { buildCsp, isAppPath, usesStrictCsp } from "@/lib/csp";

// Middleware (Lot 5) : trois rôles.
//
// 1. Content-Security-Policy, en deux niveaux depuis le lot 11 (voir
//    src/lib/csp.ts) :
//    - STRICTE, avec un nonce différent à chaque requête, pour l'application,
//      la page bio, les pages client à jeton, la connexion et /api : seuls
//      les scripts de Next.js (marqués du nonce, puis tout ce qu'ils
//      chargent, via 'strict-dynamic') et le widget Cloudflare Turnstile
//      peuvent s'exécuter. Un script injecté par une extension malveillante,
//      une dépendance compromise ou une faille XSS serait bloqué.
//      Next.js lit l'en-tête Content-Security-Policy de la REQUÊTE pour poser
//      le nonce sur ses propres balises <script> — d'où sa présence dans
//      requestHeaders ET dans la réponse.
//    - VITRINE, sans nonce, pour les pages pré-générées (accueil, tarifs,
//      outils…) : elles sont servies depuis le cache de Vercel, sans rendu
//      ni base de données. Le middleware s'exécute quand même avant le
//      cache : en-têtes, redirection et cookie d'attribution restent posés.
//    Soupape : CSP_MODE=report-only (variable d'environnement Vercel) repasse
//    en rapport seul sans redéploiement de code, si jamais quelque chose est
//    bloqué en production. En développement, le mode rapport est automatique
//    (le rechargement à chaud de Next.js a besoin d'eval).
//
// 2. Pages de l'application connectée : redirection vers /login sans
//    session (auparavant next-auth/middleware, remplacé par getToken pour
//    pouvoir poser les en-têtes ci-dessus sur la même réponse). Et, depuis
//    le lot 11, l'inverse pour l'accueil : un visiteur déjà connecté va
//    directement au tableau de bord (la page d'accueil, pré-générée, ne
//    peut plus lire la session elle-même).
//
// 3. Attribution d'acquisition (brief growth, lot G0) : si l'URL porte
//    utm_source / utm_medium / utm_campaign / utm_content / via / ref, un
//    cookie nb_attr (httpOnly, SameSite=Lax, 30 jours) mémorise le PREMIER
//    contact — jamais écrasé ensuite, sauf pour compléter `ref` s'il
//    manquait. /api/auth/register et la connexion rapide le lisent à la
//    création du compte (voir src/lib/growth.ts).

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isAppPath(pathname)) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  } else if (pathname === "/" && (await getToken({ req, secret: process.env.NEXTAUTH_SECRET }))) {
    // Déjà connecté : directement au tableau de bord (session révoquée
    // entre-temps : le tableau de bord renvoie vers /login).
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const dev = process.env.NODE_ENV !== "production";
  const reportOnly = dev || process.env.CSP_MODE === "report-only";
  const headerName = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

  let res: NextResponse;
  let csp: string;
  if (usesStrictCsp(pathname)) {
    const nonce = makeNonce();
    csp = buildCsp({ nonce, dev });
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    res = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    // Vitrine : aucun nonce transmis à Next.js (la page est pré-générée).
    csp = buildCsp({ nonce: null, dev });
    res = NextResponse.next();
  }
  res.headers.set(headerName, csp);

  // Cookie d'attribution (premier contact conservé). Les routes API ne
  // posent jamais le cookie (une URL d'API avec ?ref= n'est pas une visite).
  if (!pathname.startsWith("/api/")) {
    const incoming = attributionFromSearchParams(req.nextUrl.searchParams, pathname);
    if (incoming) {
      const existing = parseAttributionCookie(req.cookies.get(ATTRIBUTION_COOKIE)?.value);
      let next = existing ? null : incoming;
      if (existing && !existing.ref && incoming.ref) next = { ...existing, ref: incoming.ref };
      if (next) {
        res.cookies.set({
          name: ATTRIBUTION_COOKIE,
          value: serializeAttribution(next),
          httpOnly: true,
          sameSite: "lax",
          secure: !dev,
          path: "/",
          maxAge: ATTRIBUTION_MAX_AGE_SECONDS
        });
      }
    }
  }
  return res;
}

export const config = {
  // Tout sauf les fichiers statiques (chunks, images optimisées, polices,
  // icônes, médias envoyés) : ils n'exécutent rien et n'ont pas besoin de
  // CSP ni de contrôle de session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|uploads/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|txt|xml|webmanifest)$).*)"]
};
