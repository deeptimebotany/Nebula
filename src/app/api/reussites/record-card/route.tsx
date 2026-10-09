import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { achievementUnlockDb, userReussitesDb } from "@/lib/prisma-extra";
import { prisma } from "@/lib/prisma";
import { RANK_COLORS, rankEmblemParts } from "@/components/reussites/rank-emblem";
import { COUNT_RECORD_SERIES, QUALITY_KEYS, findTier, rankAt } from "@/lib/reussites/catalog";
import { parseEvidence } from "@/lib/reussites/evidence";
import { NETWORK_META, type Network } from "@/lib/types";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
// 30 s comme /api/reussites et la carte de créateur (même groupe de fonctions).
export const maxDuration = 30;

// GET /api/reussites/record-card?key=… — carte d'un record de qualité
// (Réussites v3, 02/10/2026) : une image PNG à partager (story, profil,
// media kit), seulement pour un record que le compte connecté a gagné. Les
// chiffres sont ceux relevés par Nebula sur l'API officielle du réseau, avec
// la date du relevé : rien n'est saisi à la main. Aucune page publique.
// Rendu par next/og (police intégrée, aucun service externe, aucun coût).
const W = 1080;
const H = 1350;
const BG = "#0f0f0f";

/** Texte pour la police intégrée : espaces simples, pas d'emoji ni de « × » douteux. */
const plain = (s: string) => s.replace(/[  ]/g, " ");
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const tier = findTier(key);
  if (!tier || !QUALITY_KEYS.includes(key)) return NextResponse.json({ error: "Record inconnu." }, { status: 404 });
  const rate = await consumeRateLimit("record-card", userId, 30, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de cartes générées : réessayez dans quelques minutes." }, { status: 429 });

  const [user, reussites, unlock] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    userReussitesDb.findUnique({ where: { id: userId }, select: { creatorXp: true, creatorLevel: true } }),
    achievementUnlockDb.findFirst({ where: { userId, key } })
  ]);
  if (!user || !reussites) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  if (!unlock) return NextResponse.json({ error: "Ce record n'est pas encore gagné." }, { status: 404 });

  const evidence = parseEvidence(unlock.detail);
  const level = rankAt(reussites.creatorXp ?? 0, reussites.creatorLevel ?? 1);
  const rankColor = RANK_COLORS[level.rankId];
  const name = clip(user.name || "Créateur", 28);
  const network = evidence?.network ? NETWORK_META[evidence.network as Network]?.label ?? null : null;
  const networkColor = evidence?.network ? NETWORK_META[evidence.network as Network]?.color ?? "#a066ff" : "#a066ff";
  const measured = new Date(evidence?.measuredAt ?? unlock.unlockedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  // Palier « N publications au-dessus du repère » : le palier en grand, la
  // meilleure publication en preuve.
  const counted = COUNT_RECORD_SERIES.includes(tier.series.id) && tier.target > 1;
  const headline = plain(counted || !evidence ? tier.description : evidence.headline);
  const detail = evidence ? plain(counted ? `Meilleure : ${evidence.headline.charAt(0).toLowerCase()}${evidence.headline.slice(1)}. ${evidence.detail}` : evidence.detail) : null;
  const community = tier.series.category === "communaute";
  const source = community ? "la Communauté Nebula" : network ? `l'API officielle de ${network}` : "les API officielles des réseaux";
  const site = SITE_URL.replace(/^https?:\/\//, "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          background: BG,
          backgroundImage: `radial-gradient(circle at 12% 10%, rgba(160,102,255,0.34), transparent 44%), radial-gradient(circle at 92% 92%, rgba(95,224,240,0.18), transparent 46%), radial-gradient(circle at 88% 14%, ${networkColor}30, transparent 40%)`,
          color: "#ededef",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: "#a1a1aa" }}>NEBULA · RECORD</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 22px", borderRadius: 999, border: "2px solid rgba(110,231,183,0.55)", background: "rgba(110,231,183,0.1)", color: "#a7f3d0", fontSize: 22 }}>
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {community ? "Communauté Nebula" : "Données officielles"}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 34, color: "#c4b5fd", marginTop: 64 }}>{plain(tier.title)}</div>
        <div style={{ display: "flex", fontSize: headline.length > 32 ? 74 : 92, lineHeight: 1.05, letterSpacing: -2, marginTop: 18 }}>{headline}</div>
        {detail && <div style={{ display: "flex", fontSize: 32, lineHeight: 1.35, color: "#c9c9d1", marginTop: 28 }}>{clip(detail, 180)}</div>}

        {evidence?.title && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 40, padding: "28px 34px", borderRadius: 28, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, color: "#a1a1aa" }}>
              <span style={{ display: "flex", width: 14, height: 14, borderRadius: 999, background: networkColor }} />
              {network ? `Publication ${network}` : "Publication"}
            </div>
            <div style={{ display: "flex", fontSize: 34, marginTop: 10 }}>« {clip(plain(evidence.title), 70)} »</div>
          </div>
        )}

        <div style={{ display: "flex", flexGrow: 1, minHeight: 24 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 112, height: 112, borderRadius: 999, border: `4px solid ${rankColor}`, background: "rgba(255,255,255,0.04)" }}>
            <svg width="72" height="72" viewBox="0 0 64 64">
              {rankEmblemParts(level.rankId, { ink: "#ffffff", gradId: "record-rank" })}
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 44 }}>{name}</div>
            <div style={{ display: "flex", fontSize: 30, color: rankColor, marginTop: 4 }}>Créateur {level.name}</div>
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 22, lineHeight: 1.4, color: "#8b8b94", marginTop: 34, paddingTop: 26, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {`Relevé par Nebula via ${source}, le ${measured}. Aucun chiffre saisi à la main.`}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 24, color: "#c9d3ff", marginTop: 14 }}>{site}</div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="record-${key}-nebula.png"` } }
  );
}
