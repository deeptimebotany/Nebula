import { NextResponse } from "next/server";
import { deleteAudit } from "@/lib/audit/run";

// DELETE /api/public/audit/<jeton> — « Supprimer ce rapport » : quiconque a
// le lien peut le supprimer, dont la personne analysée (droit de retrait,
// les rapports portant souvent sur le compte de quelqu'un d'autre).
export async function DELETE(_req: Request, { params }: { params: { token: string } }) {
  const deleted = await deleteAudit(params.token);
  if (!deleted) return NextResponse.json({ error: "Rapport introuvable ou déjà supprimé." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
