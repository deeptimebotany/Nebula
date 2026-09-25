import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { achievementUnlockDb, userReussitesDb } from "@/lib/prisma-extra";
import { prisma } from "@/lib/prisma";
import { RANK_COLORS } from "@/components/reussites/rank-emblem";
import { rankAt } from "@/lib/reussites/catalog";
import { publishedPosts } from "@/lib/reussites/posts";
import { ALL_STARS, SKILLS, findStar, showcaseBadge, skillLevels, type ShowcaseBadge } from "@/lib/reussites/skills";
import { streakSnapshot } from "@/lib/reussites/weekly";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
// 30 s comme /api/reussites : même groupe de fonctions Vercel (pas une de plus).
export const maxDuration = 30;

// GET /api/reussites/card — carte de créateur (Réussites v2, lot B) : une
// image PNG générée pour le compte connecté (rang, constellation, série,
// vitrine), à télécharger ou partager. Aucune page publique : l'image
// n'existe que pour celui qui la demande (choix de Lucas, 27/09/2026).
// Rendu par next/og (police intégrée, aucun service externe, aucun coût).
const W = 1080;
const H = 1350;
const BG = "#0e0e10";

/** Nombre à la française, avec une espace simple (la police intégrée n'a pas l'espace fine). */
const num = (n: number) => n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");

function Star({ lit, color, size = 34 }: { lit: boolean; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22">
      <path
        d="M11 2 L13.4 8.2 L20 8.6 L14.9 12.8 L16.6 19.3 L11 15.6 L5.4 19.3 L7.1 12.8 L2 8.6 L8.6 8.2 Z"
        fill={lit ? color : "none"}
        stroke={lit ? color : "rgba(255,255,255,0.28)"}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const rate = await consumeRateLimit("creator-card", userId, 30, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de cartes générées : réessayez dans quelques minutes." }, { status: 429 });

  const [user, reussites, unlocks, posts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    userReussitesDb.findUnique({ where: { id: userId }, select: { creatorXp: true, creatorLevel: true, showcase: true } }),
    achievementUnlockDb.findMany({ where: { userId }, select: { key: true } }),
    publishedPosts(userId)
  ]);
  if (!user || !reussites) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  const streak = await streakSnapshot(userId, posts);
  const keys = unlocks.map((u) => u.key);
  const owned = new Set(keys);
  const levels = skillLevels(keys);
  const level = rankAt(reussites.creatorXp ?? 0, reussites.creatorLevel ?? 1);
  const rankColor = RANK_COLORS[level.rankId];
  const lit = ALL_STARS.filter((s) => owned.has(s.key)).length;
  const showcase = ((reussites.showcase as string[] | undefined) ?? [])
    .filter((k) => owned.has(k))
    .map((k) => showcaseBadge(k))
    .filter((b): b is ShowcaseBadge => Boolean(b))
    .slice(0, 3);
  const name = (user.name || "Créateur").slice(0, 28);
  const site = SITE_URL.replace(/^https?:\/\//, "");

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          background: BG,
          backgroundImage: `radial-gradient(circle at 15% 8%, rgba(160,102,255,0.38), transparent 42%), radial-gradient(circle at 90% 90%, rgba(95,224,240,0.2), transparent 46%), radial-gradient(circle at 85% 18%, ${rankColor}33, transparent 38%)`,
          color: "#ededef",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: "#a1a1aa" }}>NEBULA · CARTE DE CRÉATEUR</div>

        <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 44 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 168,
              height: 168,
              borderRadius: 999,
              border: `6px solid ${rankColor}`,
              background: "rgba(255,255,255,0.04)"
            }}
          >
            <svg width="104" height="104" viewBox="0 0 64 64">
              <path d="M32 6 L36 28 L58 32 L36 36 L32 58 L28 36 L6 32 L28 28 Z" fill={rankColor} />
              <circle cx="32" cy="32" r="5" fill="#ffffff" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 66, letterSpacing: -1 }}>{name}</div>
            <div style={{ display: "flex", fontSize: 44, color: rankColor, marginTop: 6 }}>{level.name}</div>
            <div style={{ display: "flex", fontSize: 28, color: "#a1a1aa", marginTop: 8 }}>
              {num(level.xp)} XP · rang {level.rank} sur 5
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 44, padding: "30px 40px", borderRadius: 32, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#a1a1aa" }}>
            <span>Constellation de compétences</span>
            <span>{lit} / 25 étoiles</span>
          </div>
          {SKILLS.map((sk) => (
            <div key={sk.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32 }}>
                <span style={{ display: "flex", width: 16, height: 16, borderRadius: 999, background: sk.color }} />
                {sk.name}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {sk.stars.map((st) => (
                  <Star key={st.key} lit={owned.has(st.key)} color={sk.color} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 28 }}>
          {[
            { label: "Série en cours", value: `${streak.current} sem.` },
            { label: "Meilleure série", value: `${streak.best} sem.` },
            { label: "Compétences niv. 3+", value: String(Object.values(levels).filter((l) => l >= 3).length) }
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "22px 26px", borderRadius: 24, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <span style={{ display: "flex", fontSize: 22, color: "#a1a1aa" }}>{s.label}</span>
              <span style={{ display: "flex", fontSize: 44, marginTop: 6 }}>{s.value}</span>
            </div>
          ))}
        </div>

        {showcase.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
            {showcase.map((b) => {
              const star = findStar(b.key);
              const skill = star ? SKILLS.find((s) => s.id === star.skill) : undefined;
              const color = skill?.color ?? "#f2cf6b";
              // Pas de « ★ » : la police intégrée ne l'a pas.
              const label = star && skill ? `${skill.name} · ${star.name}` : b.label;
              return (
                <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRadius: 999, border: `2px solid ${color}88`, background: `${color}1f`, fontSize: 24 }}>
                  <span style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: color }} />
                  {label.length > 34 ? `${label.slice(0, 33)}…` : label}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", flexGrow: 1, minHeight: 24 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "#8b8b94" }}>
          <span>Publier régulièrement, sans s&apos;épuiser.</span>
          <span style={{ color: "#c9d3ff" }}>{site}</span>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="carte-createur-nebula.png"' } }
  );
  return image;
}
