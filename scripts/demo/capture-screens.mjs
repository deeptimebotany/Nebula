// Captures d'écran du site (accueil, pages « Découvrir ») — 29/09/2026.
//
// Photographie les VRAIS écrans de l'application, connectée au compte de
// démonstration (scripts/demo/seed-demo.ts), en mode clair et en mode
// sombre, puis les enregistre en WebP dans public/screens/. À relancer
// quand l'application change : l'accueil montre toujours l'app telle
// qu'elle est. Mode d'emploi complet : scripts/demo/README.md.
//
//   node scripts/demo/capture-screens.mjs media   → illustrations de démo (public/demo-media)
//   node scripts/demo/capture-screens.mjs shots   → captures (application lancée sur BASE_URL)
//   SCREENS_ONLY=reussites,publier node …  shots   → seulement ces écrans
//
// Outils : Playwright (Chromium) et sharp (déjà présent avec Next.js).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.DEMO_EMAIL || "demo@nebulahub.space";
const PASSWORD = process.env.DEMO_PASSWORD || "Demo-Nebula-2026!";
const MEDIA_SRC = path.join(ROOT, "scripts/demo/media");
const MEDIA_OUT = path.join(ROOT, "public/demo-media");
const SHOTS_OUT = path.join(ROOT, "public/screens");

async function loadPlaywright() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    throw new Error("Playwright introuvable : npm i -D playwright --ignore-scripts && npx playwright install chromium");
  }
}

async function loadSharp() {
  return (await import("sharp")).default;
}

/** Écrans capturés. `widths` : tailles WebP produites (1x et 2x de l'affichage). */
const SCREENS = [
  { name: "tableau-de-bord", path: "/dashboard", viewport: { width: 1440, height: 900 }, widths: [1200, 2400] },
  // L'application sur téléphone (V2, 08/10/2026) : haut de l'accueil, à côté de Publier.
  { name: "tableau-de-bord-mobile", path: "/dashboard", viewport: { width: 390, height: 844 }, widths: [390, 780] },
  { name: "publier", path: "/composer", viewport: { width: 1440, height: 900 }, widths: [1200, 2400], prepare: fillComposer },
  { name: "calendrier", path: "/calendar", viewport: { width: 1440, height: 900 }, widths: [1200, 2400], prepare: (p) => scrollToText(p, /Aujourd'hui/, 150) },
  { name: "analytics", path: "/analytics", viewport: { width: 1440, height: 900 }, widths: [1200, 2400] },
  { name: "studio", path: "/studio", viewport: { width: 1440, height: 900 }, widths: [1200, 2400] },
  { name: "page-bio", path: "/link-in-bio", viewport: { width: 1440, height: 900 }, widths: [1200, 2400] },
  { name: "rapports", path: "/reports", viewport: { width: 1440, height: 900 }, widths: [1200, 2400], prepare: (p) => scrollToText(p, /Aperçu du rapport/, 20) },
  // Réussites (30/09/2026) : mises en avant dès l'introduction de l'accueil.
  { name: "reussites", path: "/reussites", viewport: { width: 1440, height: 900 }, widths: [1200, 2400] },
  // Pages publiques (vues par les abonnés et les clients) : design propre, toujours sombres.
  { name: "rapport-client", path: "/rapport/{reportToken}", viewport: { width: 1280, height: 800 }, widths: [1200, 2400], modes: ["dark"] },
  { name: "bio-mobile", path: "/l/studio-nova", viewport: { width: 390, height: 844 }, widths: [390, 780], modes: ["dark"] },
  { name: "kit-mobile", path: "/kit/studio-nova", viewport: { width: 390, height: 844 }, widths: [390, 780], modes: ["dark"] }
];

async function scrollToText(page, text, offset = 0) {
  const el = page.getByText(text).first();
  await el.waitFor({ timeout: 15_000 });
  const y = await el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((top) => window.scrollTo(0, Math.max(0, top)), y - offset - 80);
  await page.waitForTimeout(600);
}

async function fillComposer(page) {
  // Une image : Chromium sans codec H.264 n'afficherait pas l'aperçu d'une vidéo MP4.
  await page.locator('input[type=file][accept="video/*,image/*"]').first().setInputFiles(path.join(MEDIA_OUT, "latte-heart.jpg"));
  await page.waitForTimeout(2500);
  // Refonte V2 (08/10/2026) : titre et description sont des zones de texte sans cadre.
  await page.locator("textarea[aria-label^='Titre de la publication']").fill("Latte art : le cœur parfait en 30 secondes");
  await page.locator("textarea[aria-label^='Description commune']").fill(
    "Le geste exact, au ralenti. Lait entier bien froid, pichet incliné, et on remonte d'un coup à la fin.\n\nEnregistrez pour votre prochain latte ☕ #latteart #baristaathome #cafe"
  );
  // Instagram en premier : c'est son aperçu qui s'affiche. Pastilles « Publier sur » (V2).
  for (const label of ["Instagram", "TikTok", "Facebook"]) {
    const chip = page.locator("button[aria-pressed]", { hasText: new RegExp(`^\\s*${label}`) }).first();
    if ((await chip.count()) && (await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
  }
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
}

// Rien qui ne soit pas l'application : bouton flottant de l'assistant masqué
// (il recouvre le contenu), animations figées, curseur de saisie caché.
const CAPTURE_CSS = `
  .nebula-chat-launcher { display: none !important; }
  /* Célébration « Accomplissement débloqué » (Réussites visibles, Mode focus désactivé). */
  .nebula-achievement-card { display: none !important; }
  /* Messages passagers (« Brouillon enregistré »…) : hors champ. */
  .nb-toasts { display: none !important; }
  *, *::before, *::after { animation-play-state: paused !important; caret-color: transparent !important; }
  ::-webkit-scrollbar { display: none; }
`;

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });
  // Réussites et notifications vues : pas de pastille « nouveau » sur les captures.
  await page.goto(`${BASE}/reussites`, { waitUntil: "networkidle" });
  await page.evaluate(() => fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined));
}

async function setMode(page, mode) {
  await page.evaluate(async (m) => {
    localStorage.setItem("nebula:color-mode", m);
    const json = { method: "PATCH", headers: { "Content-Type": "application/json" } };
    await fetch("/api/settings/mode", { ...json, body: JSON.stringify({ mode: m }) });
    // Notifications apparues entre deux captures : lues (pas de pastille).
    await fetch("/api/notifications", { ...json, body: JSON.stringify({ all: true }) }).catch(() => undefined);
  }, mode);
}

async function shots() {
  const chromium = await loadPlaywright();
  const sharp = await loadSharp();
  await mkdir(SHOTS_OUT, { recursive: true });
  const tokens = { reportToken: process.env.DEMO_REPORT_TOKEN || "" };
  const browser = await chromium.launch();
  const written = [];
  try {
    // Une seule connexion (les tentatives de connexion sont limitées) : la
    // session est réutilisée par chaque capture.
    const loginCtx = await browser.newContext();
    const loginPage = await loginCtx.newPage();
    await login(loginPage);
    const storageState = await loginCtx.storageState();
    await loginCtx.close();
    const only = (process.env.SCREENS_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const mode of ["light", "dark"]) {
      for (const screen of SCREENS) {
        if (only.length && !only.includes(screen.name)) continue;
        if (screen.modes && !screen.modes.includes(mode)) continue;
        const ctx = await browser.newContext({ storageState, viewport: screen.viewport, deviceScaleFactor: screen.viewport.width < 600 ? 3 : 2, locale: "fr-FR", timezoneId: "Europe/Paris" });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
        await setMode(page, mode);
        if (screen.path.includes("{reportToken}") && !tokens.reportToken) {
          await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
          const text = await page.locator("text=/\\/rapport\\/[a-z0-9]+/").first().textContent();
          tokens.reportToken = (text.match(/\/rapport\/([a-z0-9]+)/) || [])[1] || "";
        }
        await page.goto(BASE + screen.path.replace("{reportToken}", tokens.reportToken), { waitUntil: "networkidle" });
        await page.addStyleTag({ content: CAPTURE_CSS });
        await page.waitForTimeout(1200);
        if (screen.prepare) await screen.prepare(page);
        const png = await page.screenshot({ type: "png" });
        for (const w of screen.widths) {
          const file = path.join(SHOTS_OUT, `${screen.name}-${mode}-${w}.webp`);
          await sharp(png).resize({ width: w }).webp({ quality: 80, effort: 6 }).toFile(file);
          written.push(path.relative(ROOT, file));
        }
        // Les pages au design propre sont identiques dans les deux modes.
        if (screen.modes?.length === 1) {
          for (const w of screen.widths) {
            const other = mode === "dark" ? "light" : "dark";
            const buf = await readFile(path.join(SHOTS_OUT, `${screen.name}-${mode}-${w}.webp`));
            await writeFile(path.join(SHOTS_OUT, `${screen.name}-${other}-${w}.webp`), buf);
          }
        }
        await ctx.close();
      }
    }
    // Remet le compte de démo en clair.
    const ctx = await browser.newContext({ storageState });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await setMode(page, "light");
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`${written.length} images écrites dans public/screens/`);
}

/** Illustrations fictives du compte de démo : SVG → JPEG (+ courtes vidéos si ffmpeg est là). */
async function media() {
  const chromium = await loadPlaywright();
  await mkdir(MEDIA_OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const f of (await readdir(MEDIA_SRC)).filter((f) => f.endsWith(".svg"))) {
    const svg = await readFile(path.join(MEDIA_SRC, f), "utf8");
    const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.screenshot({ path: path.join(MEDIA_OUT, f.replace(/\.svg$/, ".jpg")), type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: w, height: h } });
  }
  await browser.close();
  for (const f of await readdir(MEDIA_OUT)) {
    if (!/^(latte-heart|espresso|v60|moulin|iced-latte|cold-brew)(-16x9)?\.jpg$/.test(f)) continue;
    const wide = f.includes("16x9");
    try {
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-i", path.join(MEDIA_OUT, f), "-t", "3", "-r", "10", "-vf", `scale=${wide ? "1280:720" : "720:900"},format=yuv420p`, "-c:v", "libx264", "-crf", "30", path.join(MEDIA_OUT, f.replace(/\.jpg$/, ".mp4"))]);
    } catch {
      console.warn("ffmpeg absent : vidéos de démo non créées (les images suffisent pour la plupart des écrans).");
      break;
    }
  }
  console.log("Illustrations prêtes dans public/demo-media/");
}

const step = process.argv[2];
if (step === "media") await media();
else if (step === "shots") await shots();
else console.log("Usage : node scripts/demo/capture-screens.mjs media|shots");
