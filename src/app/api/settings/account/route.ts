import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/settings/account { password } — suppression définitive du
// compte. Redemande le mot de passe pour confirmer (au-delà de la boîte de
// dialogue déjà affichée côté interface).
//
// Les marques dont cet utilisateur est PROPRIÉTAIRE UNIQUE (aucun autre
// membre) sont supprimées avec lui — la cascade Prisma/Postgres (voir
// schema.prisma) efface alors automatiquement leurs publications, médias,
// comptes réseaux connectés, etc. Si une marque a d'autres membres, la
// suppression est refusée avec un message clair : il faut d'abord retirer
// ces membres ou transférer la propriété (fonctionnalité pas encore
// disponible ici), pour ne jamais effacer des données dont d'autres
// personnes dépendent sans le vouloir.
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { password } = await req.json().catch(() => ({ password: "" }));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  // Un compte créé via Google/Apple (voir src/lib/auth.ts) n'a pas de mot de
  // passe Nebula : on ne peut pas le vérifier, donc pas de re-confirmation
  // possible par ce biais — la suppression continue directement pour lui.
  if (user.passwordHash) {
    const valid = await bcrypt.compare(password ?? "", user.passwordHash);
    if (!valid) return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 400 });
  }

  const ownedMemberships = await prisma.membership.findMany({
    where: { userId, role: "OWNER" },
    select: { brandId: true, brand: { select: { name: true, _count: { select: { memberships: true } } } } }
  });
  type OwnedMembership = (typeof ownedMemberships)[number];

  const brandsWithOtherMembers = ownedMemberships.filter((m: OwnedMembership) => m.brand._count.memberships > 1);
  if (brandsWithOtherMembers.length > 0) {
    return NextResponse.json(
      {
        error: `Impossible de supprimer le compte : vous êtes seul(e) propriétaire de "${brandsWithOtherMembers[0].brand.name}", qui a d'autres membres. Retirez-les d'abord (page Comptes) pour continuer.`
      },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction([
      prisma.brand.deleteMany({ where: { id: { in: ownedMemberships.map((m: OwnedMembership) => m.brandId) } } }),
      prisma.user.delete({ where: { id: userId } })
    ]);
  } catch {
    return NextResponse.json(
      {
        error:
          "Suppression impossible : ce compte a créé des publications sur une marque appartenant à quelqu'un d'autre. Contactez le support."
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
