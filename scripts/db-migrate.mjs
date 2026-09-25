// Mise à jour du schéma de la base au déploiement (lot 3, qualité).
//
// Remplace « prisma db push » dans le build : les changements de schéma sont
// désormais des MIGRATIONS versionnées (prisma/migrations/<date>_<nom>/
// migration.sql), relues, testées et appliquées dans l'ordre, avec un
// historique en base (table _prisma_migrations). Un renommage n'est plus
// traduit en « suppression + ajout », et on sait toujours quelle version du
// schéma tourne en production.
//
// Déroulé :
//  - déploiement de prévisualisation (Vercel « Preview ») : la base n'est
//    PAS modifiée (avant, un simple aperçu pouvait changer la base de
//    production) — MIGRATE_PREVIEW=true pour forcer ;
//  - base déjà suivie par les migrations → « prisma migrate deploy » ;
//  - base vide → « prisma migrate deploy » (crée tout) ;
//  - base créée avant les migrations (par « db push ») → une DERNIÈRE
//    synchronisation « db push » (sans jamais accepter de perte de données),
//    puis les migrations existantes sont marquées comme appliquées. Les
//    déploiements suivants n'utilisent plus que « migrate deploy ».
//  - si la vérification de la base échoue (connexion), on retombe sur
//    l'ancien comportement (« db push ») pour ne pas bloquer un déploiement.
//
// Neon : les migrations ont besoin d'une connexion DIRECTE (pas du
// « pooler ») ; DIRECT_URL si elle existe, sinon l'adresse du pooler sans
// « -pooler ».
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import pg from "pg";

const PRISMA = process.env.PRISMA_CLI || "npx prisma";

function directUrl(url) {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL;
  try {
    const u = new URL(url);
    if (u.hostname.includes("-pooler.")) {
      u.hostname = u.hostname.replace("-pooler.", ".");
      u.searchParams.delete("pgbouncer");
      return u.toString();
    }
  } catch {
    // adresse non standard : utilisée telle quelle
  }
  return url;
}

function run(args, url) {
  console.log(`[db] prisma ${args}`);
  execSync(`${PRISMA} ${args}`, { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}

async function inspect(url) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select to_regclass('public._prisma_migrations') is not null as managed,
              (select count(*)::int from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') as tables`
    );
    return rows[0];
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production" && process.env.MIGRATE_PREVIEW !== "true") {
    console.log(`[db] déploiement « ${vercelEnv} » : base de données non modifiée (seule la production applique les migrations).`);
    return;
  }
  // Build local (« npm run build ») : DATABASE_URL est souvent seulement
  // dans .env, que Prisma lisait tout seul avec l'ancien « db push ».
  if (!process.env.DATABASE_URL && existsSync(".env") && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(".env");
    } catch {
      // .env illisible : message d'erreur ci-dessous
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("[db] DATABASE_URL manquante : impossible de mettre à jour la base.");
  }
  const url = directUrl(process.env.DATABASE_URL);
  const migrations = existsSync("prisma/migrations")
    ? readdirSync("prisma/migrations", { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(`prisma/migrations/${d.name}/migration.sql`))
        .map((d) => d.name)
        .sort()
    : [];

  let state;
  try {
    state = await inspect(url);
  } catch (err) {
    console.warn(`[db] vérification de la base impossible (${err.message}) : ancien mode « db push ».`);
    run("db push --skip-generate", url);
    return;
  }

  if (state.managed || state.tables === 0) {
    run("migrate deploy", url);
    return;
  }

  console.log("[db] base créée avant les migrations : dernière synchronisation, puis migrations marquées comme appliquées.");
  run("db push --skip-generate", url);
  for (const name of migrations) run(`migrate resolve --applied ${name}`, url);
  run("migrate deploy", url);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
