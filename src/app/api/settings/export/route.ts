import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/settings/export — export des données personnelles au format
// JSON (droit à la portabilité) : profil, marques possédées, publications,
// comptes réseaux connectés (sans jetons d'accès ni secrets). Téléchargé
// directement par le navigateur (Content-Disposition: attachment).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      themePreference: true,
      referralCode: true,
      memberships: {
        select: {
          role: true,
          brand: {
            select: {
              name: true,
              slug: true,
              createdAt: true,
              connections: { select: { network: true, displayName: true, handle: true, status: true, connectedAt: true } },
              posts: {
                select: {
                  title: true,
                  caption: true,
                  status: true,
                  scheduledAt: true,
                  createdAt: true,
                  targets: { select: { network: true, status: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const json = JSON.stringify(user, null, 2);
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="nebula-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`
    }
  });
}
