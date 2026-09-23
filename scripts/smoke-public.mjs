#!/usr/bin/env node
// Tests de fumée des pages publiques (Lot 5) — zéro dépendance, Node 18+.
//
//   node scripts/smoke-public.mjs https://nebulahub.space
//   node scripts/smoke-public.mjs http://localhost:3000
//
// Vérifie, pour chaque page publique : le code HTTP, le <title>, un texte
// attendu dans le HTML, puis les en-têtes de sécurité et le comportement
// des routes protégées (redirection vers /login) et des API sensibles
// (401/503 sans secret). À lancer après chaque déploiement : une régression
// de la CSP ou du middleware se voit ici en dix secondes, avant qu'un
// visiteur ne la rencontre. Code de sortie 1 si un test échoue.

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage : node scripts/smoke-public.mjs https://nebulahub.space");
  process.exit(2);
}

const PAGES = [
  { path: "/", title: /Nebula/, contains: "Propulsé" },
  { path: "/tarifs", title: /Tarifs/, contains: "Gratuit" },
  { path: "/securite", title: /Sécurité/, contains: "Sécurité" },
  { path: "/contact", title: /Contact/, contains: "Contact" },
  { path: "/legal", title: /Mentions|Légal|légal/i, contains: "Mentions" },
  { path: "/outils", title: /Outils/, contains: "Outils" },
  { path: "/outils/legendes", title: /Légendes|légendes/i, contains: "légende" },
  { path: "/outils/miniatures", title: /Miniatures|miniatures/i, contains: "miniature" },
  { path: "/login", title: /Connexion/, contains: "Se connecter" },
  { path: "/register", title: /Inscription|Créer/i, contains: "conditions" },
  { path: "/forgot-password", title: /Mot de passe/i, contains: "Envoyer le lien" }
];

// Pages de l'application : sans session → redirection vers /login.
const PROTECTED = ["/dashboard", "/composer", "/publications", "/calendar", "/settings"];

const REQUIRED_HEADERS = [
  ["content-security-policy", /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/, "CSP stricte avec nonce (mode appliqué)"],
  ["strict-transport-security", /max-age=\d+/, "HSTS"],
  ["x-frame-options", /SAMEORIGIN|DENY/i, "X-Frame-Options"],
  ["referrer-policy", /strict-origin-when-cross-origin|no-referrer/, "Referrer-Policy"],
  ["permissions-policy", /camera=\(\)/, "Permissions-Policy"]
];

let failures = 0;
function ok(label, detail = "") {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}
function ko(label, detail = "") {
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function get(path, opts = {}) {
  const started = Date.now();
  const res = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "nebula-smoke/1.0" }, ...opts });
  const text = res.status === 200 ? await res.text() : "";
  return { res, text, ms: Date.now() - started };
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

console.log(`Nebula — tests de fumée sur ${base}\n`);

console.log("Pages publiques");
for (const page of PAGES) {
  try {
    const { res, text, ms } = await get(page.path);
    if (res.status !== 200) {
      ko(page.path, `HTTP ${res.status}`);
      continue;
    }
    const title = titleOf(text);
    const problems = [];
    if (!page.title.test(title)) problems.push(`titre « ${title || "(vide)"} »`);
    if (!text.includes(page.contains)) problems.push(`texte « ${page.contains} » absent`);
    if (/Application error|Internal Server Error/.test(text)) problems.push("page d'erreur Next.js");
    if (problems.length) ko(page.path, problems.join(", "));
    else ok(page.path, `${ms} ms · « ${title} »`);
  } catch (err) {
    ko(page.path, String(err.message || err));
  }
}

console.log("\nEn-têtes de sécurité (sur /)");
try {
  const { res } = await get("/");
  for (const [name, pattern, label] of REQUIRED_HEADERS) {
    const value = res.headers.get(name) || "";
    if (pattern.test(value)) ok(label);
    else if (name === "content-security-policy" && /'nonce-/.test(res.headers.get("content-security-policy-report-only") || "")) {
      ko(label, "CSP présente mais en mode rapport seul (CSP_MODE=report-only ?)");
    } else ko(label, value ? `valeur inattendue : ${value.slice(0, 80)}` : "absent");
  }
  const csp = res.headers.get("content-security-policy") || "";
  if (csp && /'unsafe-eval'/.test(csp)) ko("CSP sans 'unsafe-eval'", "unsafe-eval présent en production");
  else if (csp) ok("CSP sans 'unsafe-eval'");
} catch (err) {
  ko("En-têtes", String(err.message || err));
}

console.log("\nRoutes protégées (sans session)");
for (const path of PROTECTED) {
  try {
    const { res } = await get(path);
    const location = res.headers.get("location") || "";
    if ([302, 303, 307, 308].includes(res.status) && /\/login/.test(location)) ok(path, `→ ${location.replace(base, "")}`);
    else ko(path, `HTTP ${res.status}${location ? ` → ${location}` : ""} (attendu : redirection vers /login)`);
  } catch (err) {
    ko(path, String(err.message || err));
  }
}

console.log("\nAPI sensibles");
try {
  const { res } = await get("/api/me");
  if (res.status === 401) ok("/api/me sans session", "401");
  else ko("/api/me sans session", `HTTP ${res.status} (attendu 401)`);
} catch (err) {
  ko("/api/me", String(err.message || err));
}
try {
  const { res } = await get("/api/cron");
  if (res.status === 401 || res.status === 503) ok("/api/cron sans secret", `${res.status}`);
  else ko("/api/cron sans secret", `HTTP ${res.status} (attendu 401 ou 503)`);
} catch (err) {
  ko("/api/cron", String(err.message || err));
}
try {
  const { res } = await get("/robots.txt");
  if (res.status === 200) ok("/robots.txt");
  else ko("/robots.txt", `HTTP ${res.status}`);
  const sm = await get("/sitemap.xml");
  if (sm.res.status === 200) ok("/sitemap.xml");
  else ko("/sitemap.xml", `HTTP ${sm.res.status}`);
} catch (err) {
  ko("robots/sitemap", String(err.message || err));
}
try {
  const { res } = await get("/cette-page-n-existe-pas");
  if (res.status === 404) ok("Page inconnue", "404");
  else ko("Page inconnue", `HTTP ${res.status} (attendu 404)`);
} catch (err) {
  ko("404", String(err.message || err));
}

console.log(failures === 0 ? "\nTout est bon." : `\n${failures} test(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
