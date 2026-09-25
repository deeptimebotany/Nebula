// Liste des comptes administrateurs (variable ADMIN_EMAILS, séparés par des
// virgules) — voir src/lib/admin.ts pour ce qu'ils peuvent faire. Module
// sans dépendance, utilisable partout (y compris par lib/auth.ts).
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
