// Outils des tests d'intégration : ils tournent sur une VRAIE base Postgres
// (celle de la CI, voir .github/workflows/ci.yml), jamais sur la production.
// Sans INTEGRATION_DATABASE_URL, ils sont ignorés.
import { prisma } from "@/lib/prisma";

export const hasDatabase = Boolean(process.env.INTEGRATION_DATABASE_URL);

const TABLES = [
  "User",
  "Brand",
  "Membership",
  "Post",
  "PostTarget",
  "PostMedia",
  "MediaAsset",
  "SocialConnection",
  "Notification",
  "DataDeletionRequest",
  "AnalyticsSnapshot",
  "PostMetric",
  "EngagementItem",
  "WebhookEndpoint",
  "IntegrationAccount",
  "ToolLead",
  "NetworkControl",
  // Sans lien vers un compte : à vider explicitement (Réussites, lot C).
  "CollectiveChallenge",
  "BadgeRarity",
  // Audit de présence (produit n°8) et quotas des outils publics.
  "PublicAudit",
  "PublicToolUsage"
];

export async function resetDatabase(): Promise<void> {
  const target = process.env.INTEGRATION_DATABASE_URL;
  if (!target) throw new Error("INTEGRATION_DATABASE_URL manquante");
  // Garde-fou : on ne vide JAMAIS une base autre que celle des tests.
  if (process.env.DATABASE_URL !== target) {
    throw new Error("DATABASE_URL ne pointe pas sur INTEGRATION_DATABASE_URL : lancez « npm run test:integration », jamais ces tests avec une autre configuration.");
  }
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

let seq = 0;
export async function makeBrand() {
  seq++;
  const user = await prisma.user.create({ data: { email: `user${seq}-${Date.now()}@test.fr`, name: "Test" } });
  const brand = await prisma.brand.create({ data: { name: "Marque", slug: `marque-${seq}-${Date.now()}` } });
  await prisma.membership.create({ data: { userId: user.id, brandId: brand.id, role: "OWNER" } });
  return { user, brand };
}
