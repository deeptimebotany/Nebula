import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertBrandMembership, getOrCreateLinkPage } from "@/lib/link-in-bio";
import { getBrandPlan } from "@/lib/billing/plan";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { trackGrowth } from "@/lib/growth";
import { extractLinktreeLinks } from "@/lib/linktree";

// Import Linktree (brief growth, lot G6.b).
//   GET  ?url=https://linktr.ee/xxx  → { links: [{label,url}] } : le serveur
//        récupère la page publique (5 s, 1 Mo max, rate-limit), extrait
//        titre et URL de chaque lien (__NEXT_DATA__ si présent, sinon <a>).
//   POST { brandId, links: [{label,url}] } → crée les LinkItem. Au-delà de
//        la limite du palier, les liens sont créés DÉSACTIVÉS (conservés,
//        grisés « Pro » dans l'éditeur) et la réponse le signale pour que la
//        page ouvre UpgradeModal(links_limit).
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 5000;

function normalizeLinktreeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    if (!/^(www\.)?linktr\.ee$/i.test(u.hostname)) return null;
    const path = u.pathname.replace(/\/+$/, "");
    if (!/^\/[A-Za-z0-9_.-]{1,80}$/.test(path)) return null;
    return `https://linktr.ee${path}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const rate = await consumeRateLimit("linktree-import", clientIpFromHeaders(req.headers), 10, 10 * 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de tentatives, réessayez dans quelques minutes." }, { status: 429 });

  const url = normalizeLinktreeUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!url) return NextResponse.json({ error: "Collez une adresse de la forme linktr.ee/votre-nom." }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; NebulaImport/1.0; +https://nebulahub.space)", accept: "text/html" } });
    if (!res.ok) return NextResponse.json({ error: res.status === 404 ? "Cette page Linktree n'existe pas (ou n'est plus publique)." : `Linktree a répondu ${res.status}.` }, { status: 502 });
    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Réponse vide." }, { status: 502 });
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    reader.cancel().catch(() => undefined);
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    const links = extractLinktreeLinks(html);
    if (links.length === 0) return NextResponse.json({ error: "Aucun lien trouvé sur cette page. Vérifiez qu'elle est publique." }, { status: 422 });
    return NextResponse.json({ links: links.slice(0, 100) });
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    return NextResponse.json({ error: aborted ? "Linktree met trop de temps à répondre, réessayez." : "Impossible de lire cette page Linktree." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

const postSchema = z.object({
  brandId: z.string().min(1),
  links: z.array(z.object({ label: z.string().trim().min(1).max(60), url: z.string().url().max(500) })).min(1).max(100)
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Liens invalides." }, { status: 400 });
  const { brandId, links } = parsed.data;
  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

  const { limits } = await getBrandPlan(brandId);
  const linkPage = await getOrCreateLinkPage(brandId);
  const existingUrls = new Set(linkPage.links.map((l) => l.url));
  let order = (linkPage.links.at(-1)?.order ?? -1) + 1;
  let enabledCount = linkPage.links.filter((l) => l.enabled).length;
  let created = 0;
  let disabled = 0;
  let duplicates = 0;
  for (const link of links) {
    if (existingUrls.has(link.url)) {
      duplicates += 1;
      continue;
    }
    const enabled = enabledCount < limits.maxBioLinks;
    await prisma.linkItem.create({ data: { linkPageId: linkPage.id, label: link.label, url: link.url, order, enabled } });
    order += 1;
    created += 1;
    if (enabled) enabledCount += 1;
    else disabled += 1;
    existingUrls.add(link.url);
  }
  await trackGrowth("linktree_import", { created, disabled, duplicates }, userId);
  return NextResponse.json({ ok: true, created, disabled, duplicates, reason: disabled > 0 ? "links_limit" : undefined });
}
