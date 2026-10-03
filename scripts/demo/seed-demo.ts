// Compte de DÉMONSTRATION pour les captures d'écran du site (accueil, pages
// « Découvrir ») — 29/09/2026. Données entièrement fictives : une chaîne de
// café « Studio Nova » (Instagram, TikTok, YouTube, Facebook), ses
// publications, statistiques, page bio, rapport client et media kit.
//
// ⚠️ EFFACE TOUTE LA BASE avant de la remplir. Ne tourne que sur une base
// locale dont le nom contient « demo » (ex. postgresql://…@localhost/nebula_demo) :
// jamais sur la base de production.
//
// Utilisation (voir scripts/demo/README.md) :
//   DATABASE_URL="postgresql://postgres@localhost:5432/nebula_demo" npx tsx scripts/demo/seed-demo.ts
//
// Les images référencées (/demo-media/…) sont des illustrations fictives
// fournies dans public/demo-media (voir le README).
import type { PrismaClient } from "@prisma/client";

export const DEMO_EMAIL = "demo@nebulahub.space";
export const DEMO_PASSWORD = "Demo-Nebula-2026!";

const DAY = 86_400_000;

/** Refuse toute base qui n'est pas une base locale « demo ». */
export function assertDemoDatabase(url: string | undefined): void {
  if (!url) throw new Error("DATABASE_URL manquante.");
  const u = new URL(url.replace(/^postgres(ql)?:/, "http:"));
  const db = u.pathname.replace(/^\//, "");
  const local = ["localhost", "127.0.0.1", "[::1]", ""].includes(u.hostname) || u.searchParams.get("host")?.startsWith("/");
  if (!local || !/demo/i.test(db)) {
    throw new Error(`Refusé : la démo ne s'installe que sur une base locale dont le nom contient « demo » (reçu : ${u.hostname || "socket"}/${db}).`);
  }
}

/** Générateur pseudo-aléatoire reproductible (mêmes captures à chaque fois). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Net = "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "FACEBOOK";

const ACCOUNTS: { network: Net; name: string; handle: string; start: number; end: number; reach: number; er: number }[] = [
  { network: "TIKTOK", name: "studionova", handle: "studionova", start: 41_200, end: 58_400, reach: 96_000, er: 5.8 },
  { network: "YOUTUBE", name: "Studio Nova", handle: "StudioNovaCafe", start: 19_900, end: 24_800, reach: 41_000, er: 4.1 },
  { network: "INSTAGRAM", name: "studio.nova", handle: "studio.nova", start: 9_800, end: 12_300, reach: 18_500, er: 4.6 },
  { network: "FACEBOOK", name: "Studio Nova Café", handle: "studionovacafe", start: 5_600, end: 6_250, reach: 4_300, er: 2.3 }
];

// Titre, légende, média, réseaux ciblés.
const POSTS: { title: string; caption: string; media: string; nets: Net[]; long?: boolean }[] = [
  { title: "Latte art : le cœur parfait en 30 secondes", caption: "Le geste exact, au ralenti. Enregistrez pour votre prochain latte ☕ #latteart #baristaathome", media: "latte-heart", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Mon moulin à 50 € contre celui à 500 €", caption: "Test à l'aveugle avec trois amis. Le résultat nous a surpris. #cafe #testmateriel", media: "moulin", nets: ["YOUTUBE", "FACEBOOK"], long: true },
  { title: "Pourquoi votre café est amer (et comment corriger ça)", caption: "Trois réglages, zéro achat. #espresso #astucecafe", media: "espresso", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Le geste qui change tout pour la mousse de lait", caption: "Micro-mousse brillante, même avec une buse de base. #milkfoam #latte", media: "cappuccino", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Café filtre : V60 ou Chemex ?", caption: "Même grain, deux méthodes, deux cafés très différents. #v60 #slowcoffee", media: "v60", nets: ["YOUTUBE", "INSTAGRAM"], long: true },
  { title: "Cold brew maison, sans matériel", caption: "Un bocal, une nuit, et c'est tout. Recette complète en légende. #coldbrew #recette", media: "cold-brew", nets: ["TIKTOK", "INSTAGRAM", "FACEBOOK"] },
  { title: "3 erreurs qui ruinent votre espresso", caption: "La deuxième, on l'a tous faite. #espresso #barista", media: "espresso", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Iced latte pour l'été indien", caption: "Frais, crémeux, prêt en 2 minutes. #icedlatte #cafeglace", media: "iced-latte", nets: ["INSTAGRAM", "TIKTOK"] },
  { title: "Visite d'une torréfaction à Lyon", caption: "Des grains verts à la tasse : on vous emmène dans les coulisses. #torrefaction #lyon", media: "grains", nets: ["YOUTUBE", "FACEBOOK"], long: true },
  { title: "Le bon dosage, sans balance", caption: "La règle des deux cuillères, expliquée simplement. #cafe #astuce", media: "latte-heart", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Cappuccino ou flat white : la vraie différence", caption: "Spoiler : ce n'est pas qu'une question de taille. #cappuccino #flatwhite", media: "cappuccino", nets: ["INSTAGRAM", "TIKTOK"] },
  { title: "On a goûté 5 cafés de supermarché", caption: "Notre classement honnête, du pire au meilleur. #degustation #cafe", media: "grains", nets: ["YOUTUBE", "TIKTOK"], long: true },
  { title: "Nettoyer sa machine en 5 étapes", caption: "À faire une fois par mois pour garder un café au top. #entretien #machinecafe", media: "moulin", nets: ["TIKTOK", "FACEBOOK"] },
  { title: "Recette : latte à la cardamome", caption: "Notre boisson d'automne préférée. #recette #latte", media: "cappuccino", nets: ["INSTAGRAM", "TIKTOK"] },
  { title: "Q&R : vos questions sur les grains", caption: "Arabica, robusta, torréfaction… on répond à tout. #cafe #questions", media: "grains", nets: ["YOUTUBE", "INSTAGRAM"], long: true },
  { title: "Affogato : le dessert en 2 minutes", caption: "Une boule de glace, un espresso. C'est tout. #affogato #dessert", media: "espresso", nets: ["TIKTOK", "INSTAGRAM", "FACEBOOK"] },
  { title: "POV : vous découvrez le vrai goût du café", caption: "Le premier café de spécialité, ça fait ça. #pov #cafedespecialite", media: "latte-heart", nets: ["TIKTOK"] },
  { title: "Coulisses : notre matinée au café", caption: "6 h 30, première fournée de tests. #coulisses #vlog", media: "v60", nets: ["INSTAGRAM", "YOUTUBE"] },
  { title: "Moka : la méthode italienne bien faite", caption: "Feu doux, couvercle ouvert : on vous montre. #moka #cafeitalien", media: "espresso", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Le café le plus cher du monde vaut-il le coup ?", caption: "On a cassé la tirelire pour vous répondre. #cafe #test", media: "grains", nets: ["YOUTUBE", "TIKTOK", "FACEBOOK"], long: true },
  { title: "Chai latte : la vraie recette", caption: "Épices entières, lait moussé, et c'est l'automne. #chailatte #recette", media: "cappuccino", nets: ["INSTAGRAM", "TIKTOK"] },
  { title: "Décaféiné : bon ou pas ?", caption: "On a fait goûter trois décas à l'aveugle. #decafeine #degustation", media: "espresso", nets: ["TIKTOK", "YOUTUBE"] },
  { title: "Espresso tonic en 1 minute", caption: "Glaçons, tonic, espresso. Le mélange qui surprend. #espressotonic", media: "iced-latte", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Quelle eau pour un meilleur café ?", caption: "Du robinet, filtrée ou en bouteille : le test. #eau #cafe", media: "v60", nets: ["YOUTUBE", "FACEBOOK"], long: true },
  { title: "Le latte art en tulipe, pas à pas", caption: "Après le cœur, la tulipe. On décompose chaque geste. #latteart", media: "latte-heart", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Notre routine café du dimanche", caption: "Un V60 lent, une pâtisserie, zéro écran. #slowsunday", media: "v60", nets: ["INSTAGRAM"] },
  { title: "Machine à grain : notre avis après 6 mois", caption: "Ce qu'on aurait aimé savoir avant d'acheter. #machinecafe #avis", media: "moulin", nets: ["YOUTUBE", "FACEBOOK"], long: true },
  { title: "Mocha maison, version légère", caption: "Chocolat noir, espresso, lait. Rien d'autre. #mocha", media: "cappuccino", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Torréfaction claire ou foncée ?", caption: "Ce que ça change vraiment dans la tasse. #torrefaction", media: "grains", nets: ["TIKTOK", "YOUTUBE"] },
  { title: "Le cold brew à l'orange", caption: "La boisson de la saison, en deux gestes. #coldbrew", media: "cold-brew", nets: ["INSTAGRAM", "TIKTOK", "FACEBOOK"] },
  { title: "Carrousel : 5 recettes au lait d'avoine", caption: "Glissez pour les cinq recettes, toutes testées cette semaine. #laitvegetal", media: "iced-latte", nets: ["INSTAGRAM", "FACEBOOK"] },
  { title: "Le piston (French press) sans marc", caption: "L'astuce du double filtrage. #frenchpress", media: "v60", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "On répare une vieille machine italienne", caption: "Trouvée en brocante, remise en route en un week-end. #restauration", media: "moulin", nets: ["YOUTUBE", "FACEBOOK"], long: true },
  { title: "Café gourmand : trois mignardises faciles", caption: "Pour accompagner l'espresso du dimanche. #cafegourmand", media: "cappuccino", nets: ["INSTAGRAM", "TIKTOK"] },
  { title: "Nos grains du mois", caption: "Un Éthiopie fruité et un Brésil chocolaté. #grainsdumois", media: "grains", nets: ["INSTAGRAM", "FACEBOOK"] },
  { title: "Latte glacé caramel beurre salé", caption: "La recette la plus demandée en commentaires. #icedlatte", media: "iced-latte", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Moudre plus fin : avant / après", caption: "Même café, un cran de moulin : tout change. #mouture", media: "moulin", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Le vrai prix d'un café à la maison", caption: "Grain, lait, machine : on a tout calculé. #budget #cafe", media: "espresso", nets: ["YOUTUBE", "TIKTOK"], long: true },
  { title: "Espresso crème : la crema parfaite", caption: "Pression, température, mouture : le trio gagnant. #crema", media: "espresso", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Live du vendredi : vos questions", caption: "On répond en direct à tout ce que vous voulez savoir. #live", media: "latte-heart", nets: ["INSTAGRAM", "FACEBOOK"] },
  { title: "Dalgona coffee, le retour", caption: "Trois ingrédients et un fouet. #dalgona", media: "cappuccino", nets: ["TIKTOK", "INSTAGRAM"] },
  { title: "Notre coin café en 30 secondes", caption: "Petite visite de l'endroit où tout se tourne. #setup", media: "v60", nets: ["INSTAGRAM", "TIKTOK"] }
];

const COMMENTERS = ["Léa M.", "Hugo B.", "Inès R.", "Maxime D.", "Chloé P.", "Nathan L.", "Sarah K.", "Tom V.", "Julie A.", "Karim S."];
const COMMENTS = [
  "Testé ce matin, enfin un cœur qui ressemble à un cœur 😄",
  "Vous utilisez quel lait pour la mousse ?",
  "La comparaison des moulins m'a fait économiser 400 €, merci !",
  "Recette notée pour ce week-end.",
  "Vous pourriez faire une vidéo sur le décaféiné ?",
  "Le cold brew sans matériel, génial.",
  "Quelle torréfaction vous conseillez pour débuter ?",
  "Top comme d'habitude 👌",
  "Je ne savais pas pour la température de l'eau !",
  "Vivement la prochaine vidéo."
];

export interface DemoSeedResult {
  userId: string;
  brandId: string;
  reportToken: string;
  calendarToken: string;
  published: number;
}

export async function seedDemo(db: PrismaClient, opts: { now?: Date; passwordHash: string }): Promise<DemoSeedResult> {
  const now = opts.now ?? new Date();
  const rand = rng(20260929);
  const at = (days: number, hour: number, minute = 0) => {
    const d = new Date(now.getTime() + days * DAY);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // Base vide : toutes les tables sauf l'historique des migrations.
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);

  const user = await db.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Camille Durand",
      passwordHash: opts.passwordHash,
      emailVerifiedAt: new Date(now.getTime() - 200 * DAY),
      // 18 ans et plus confirmés (30/09/2026) : sinon la fenêtre d'âge cacherait les captures.
      ageConfirmedAt: new Date(now.getTime() - 200 * DAY),
      createdAt: new Date(now.getTime() - 200 * DAY),
      colorMode: "light",
      creatorXp: 2570,
      creatorLevel: 3,
      loginStreakDays: 12,
      reussitesCheckedAt: now,
      reussitesSeenAt: now
    }
  });
  await db.subscription.create({
    data: { userId: user.id, plan: "AGENCY", interval: "year", maxBrands: 15, status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + 200 * DAY) }
  });

  const brand = await db.brand.create({ data: { name: "Studio Nova", slug: "studio-nova", timezone: "Europe/Paris", logoUrl: "/demo-media/avatar-nova.jpg" } });
  await db.membership.create({ data: { userId: user.id, brandId: brand.id, role: "OWNER" } });
  for (const [name, slug, logo] of [
    ["Maison Lumière", "maison-lumiere", "avatar-lumiere"],
    ["Atelier Brun", "atelier-brun", "avatar-brun"]
  ]) {
    const b = await db.brand.create({ data: { name, slug, timezone: "Europe/Paris", logoUrl: `/demo-media/${logo}.jpg` } });
    await db.membership.create({ data: { userId: user.id, brandId: b.id, role: "OWNER" } });
  }

  // Comptes connectés et 120 jours de statistiques (croissance régulière,
  // accélérée par deux vidéos qui ont bien marché).
  const conns = new Map<Net, { id: string }>();
  for (const a of ACCOUNTS) {
    const c = await db.socialConnection.create({
      data: {
        brandId: brand.id,
        network: a.network,
        externalAccountId: `demo-${a.network.toLowerCase()}`,
        displayName: a.name,
        handle: a.handle,
        avatarUrl: "/demo-media/avatar-nova.jpg",
        accessToken: "demo",
        status: "CONNECTED",
        connectedAt: new Date(now.getTime() - 190 * DAY),
        lastSyncedAt: new Date(now.getTime() - 2 * 3_600_000),
        lastMetricsSyncedAt: new Date(now.getTime() - 2 * 3_600_000),
        lastEngagementSyncedAt: new Date(now.getTime() - 2 * 3_600_000)
      }
    });
    conns.set(a.network, c);
    const days = 120;
    let prev = a.start;
    const rows = [];
    for (let d = days; d >= 0; d--) {
      const t = (days - d) / days;
      // Courbe douce + deux paliers (vidéos virales il y a ~70 et ~25 jours).
      const bump = (center: number, width: number) => 1 / (1 + Math.exp(-(t - center) / width));
      const shape = 0.55 * t + 0.25 * bump(0.42, 0.02) + 0.2 * bump(0.8, 0.02);
      const followers = Math.round(a.start + (a.end - a.start) * shape + (rand() - 0.5) * a.end * 0.001);
      const weekday = at(-d, 12).getDay();
      const weekFactor = weekday === 0 || weekday === 6 ? 1.12 : 1;
      const reach = Math.round(a.reach * (0.7 + 0.3 * t) * weekFactor * (0.9 + rand() * 0.2));
      rows.push({
        connectionId: c.id,
        network: a.network,
        capturedAt: at(-d, 18, 40),
        followers,
        followersDelta: d === days ? 0 : followers - prev,
        reach,
        impressions: Math.round(reach * (1.6 + rand() * 0.3)),
        engagementRate: Math.round((a.er * (0.9 + rand() * 0.2)) * 100) / 100,
        postsCount: 140 + Math.round((days - d) / 2)
      });
      prev = followers;
    }
    await db.analyticsSnapshot.createMany({ data: rows });
  }

  // Médias (illustrations fictives) : une image et une vidéo par visuel.
  const mediaIds = new Map<string, string>();
  for (const name of ["latte-heart", "espresso", "v60", "moulin", "iced-latte", "cold-brew", "cappuccino", "grains"]) {
    const video = ["latte-heart", "espresso", "v60", "moulin", "iced-latte", "cold-brew"].includes(name);
    const m = await db.mediaAsset.create({
      data: video
        ? { brandId: brand.id, type: "VIDEO", url: `/demo-media/${name}.mp4`, filename: `${name}.mp4`, mimeType: "video/mp4", sizeBytes: 12_000_000, durationSeconds: 42, width: 1080, height: 1350, thumbnailUrl: `/demo-media/${name}.jpg` }
        : { brandId: brand.id, type: "IMAGE", url: `/demo-media/${name}.jpg`, filename: `${name}.jpg`, mimeType: "image/jpeg", sizeBytes: 380_000, width: 1080, height: 1350, thumbnailUrl: `/demo-media/${name}.jpg` }
    });
    mediaIds.set(name, m.id);
  }

  // Publications : ~8 semaines passées (publiées) et 5 semaines à venir
  // (programmées), 5 par semaine, aux heures qui marchent le mieux.
  const slots: { day: number; hour: number; minute: number }[] = [];
  for (let day = -56; day <= 34; day++) {
    const wd = at(day, 12).getDay();
    if ([2, 4].includes(wd)) slots.push({ day, hour: 18, minute: 0 });
    else if (wd === 6) slots.push({ day, hour: 11, minute: 30 });
    else if ([1, 5].includes(wd)) slots.push({ day, hour: 12, minute: 30 });
  }
  let published = 0;
  // Quelques publications nettement au-dessus de la moyenne (Studio IA,
  // Engagements) : une par sujet, pour un classement varié.
  const topBoost: Record<number, number> = { 0: 3.4, 7: 2.6, 15: 2.2, 23: 1.9, 3: 1.7 };
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const tpl = POSTS[i % POSTS.length];
    const when = at(slot.day, slot.hour, slot.minute);
    const past = when.getTime() < now.getTime() - 3_600_000;
    const draft = !past && i % 9 === 4;
    const post = await db.post.create({
      data: {
        brandId: brand.id,
        createdById: user.id,
        title: tpl.title,
        caption: tpl.caption,
        status: draft ? "DRAFT" : past ? "PUBLISHED" : "SCHEDULED",
        scheduledAt: draft ? null : when,
        createdAt: new Date(when.getTime() - 3 * DAY),
        media: { create: [{ mediaAssetId: mediaIds.get(tpl.media)!, order: 0 }] }
      }
    });
    if (draft) continue;
    const boost = past ? (topBoost[i] ?? 1) * (0.8 + rand() * 0.4) : 1;
    for (const net of tpl.nets) {
      const conn = conns.get(net)!;
      const externalPostId = `demo-${net.toLowerCase()}-${i}`;
      await db.postTarget.create({
        data: {
          postId: post.id,
          connectionId: conn.id,
          network: net,
          status: past ? "PUBLISHED" : "SCHEDULED",
          publishedAt: past ? when : null,
          externalPostId: past ? externalPostId : null,
          externalUrl: past ? `https://example.com/${net.toLowerCase()}/${i}` : null,
          attempts: past ? 1 : 0
        }
      });
      if (!past) continue;
      const acc = ACCOUNTS.find((a) => a.network === net)!;
      const base = { TIKTOK: 14_000, YOUTUBE: tpl.long ? 9_500 : 4_200, INSTAGRAM: 3_200, FACEBOOK: 900 }[net];
      const views = Math.round(base * boost * (0.75 + rand() * 0.5));
      const likes = Math.round(views * (acc.er / 100) * (0.8 + rand() * 0.4));
      const comments = Math.round(likes * (0.03 + rand() * 0.03));
      const shares = Math.round(likes * (0.05 + rand() * 0.06));
      const saves = net === "INSTAGRAM" || net === "TIKTOK" ? Math.round(likes * (0.08 + rand() * 0.1)) : null;
      await db.postMetric.create({
        data: {
          connectionId: conn.id,
          network: net,
          postExternalId: externalPostId,
          title: tpl.title,
          permalink: `https://example.com/${net.toLowerCase()}/${i}`,
          thumbnailUrl: `/demo-media/${tpl.media}${net === "YOUTUBE" && ["latte-heart", "v60", "moulin", "espresso"].includes(tpl.media) ? "-16x9" : ""}.jpg`,
          publishedAt: when,
          views,
          likes,
          comments,
          shares,
          saves,
          prevViews: Math.round(views * 0.92),
          prevLikes: Math.round(likes * 0.93),
          prevComments: Math.round(comments * 0.9),
          prevShares: Math.round(shares * 0.9),
          prevSaves: saves === null ? null : Math.round(saves * 0.92),
          capturedAt: new Date(now.getTime() - 2 * 3_600_000),
          prevCapturedAt: new Date(now.getTime() - 26 * 3_600_000)
        }
      });
      // Quelques commentaires récents (boîte « Commentaires »). Pas pour
      // TikTok : son API ne donne pas les commentaires (03/10/2026).
      if (slot.day > -12 && net !== "FACEBOOK" && net !== "TIKTOK") {
        for (let k = 0; k < 2; k++) {
          const idx = (i * 3 + k) % COMMENTS.length;
          await db.engagementItem.create({
            data: {
              connectionId: conn.id,
              network: net,
              type: "COMMENT",
              externalId: `${externalPostId}-c${k}`,
              postExternalId: externalPostId,
              authorName: COMMENTERS[(i + k) % COMMENTERS.length],
              text: COMMENTS[idx],
              publishedAt: new Date(when.getTime() + (k + 1) * 5_400_000),
              read: slot.day < -5
            }
          });
        }
      }
    }
    if (past) published++;
  }

  // Page bio, rapport client, calendrier partagé, media kit.
  const page = await db.linkPage.create({
    data: { brandId: brand.id, title: "Studio Nova", bio: "Recettes de café maison, tests de matériel et coulisses. Nouvelle vidéo chaque mardi.", avatarUrl: "/demo-media/avatar-nova.jpg", theme: "nebula", published: true }
  });
  const links: [string, string, number][] = [
    ["Notre sélection de grains", "https://example.com/grains", 1284],
    ["La dernière vidéo YouTube", "https://example.com/video", 962],
    ["Atelier latte art à Lyon", "https://example.com/atelier", 418],
    ["La newsletter du jeudi", "https://example.com/newsletter", 655]
  ];
  for (const [i, [label, url, clicks]] of links.entries()) {
    await db.linkItem.create({ data: { linkPageId: page.id, label, url, order: i, clicks } });
  }
  const report = await db.brandReport.create({ data: { brandId: brand.id, enabled: true, periodDays: 30, frequency: "MONTHLY", recipientEmail: null } });
  const share = await db.calendarShare.create({ data: { brandId: brand.id, enabled: true, windowDays: 30 } });
  await db.mediaKit.create({
    data: {
      brandId: brand.id,
      published: true,
      publishedAt: new Date(now.getTime() - 20 * DAY),
      headline: "Recettes de café maison et tests de matériel, une vidéo chaque mardi",
      about:
        "Studio Nova, c'est une chaîne tenue par deux baristas lyonnais : recettes simples, tests honnêtes de machines et de moulins, et beaucoup de coulisses.\n\nNotre public : des amateurs de café de 25 à 44 ans qui équipent leur cuisine et cherchent des conseils concrets.",
      offers: [
        { title: "Vidéo dédiée YouTube", detail: "Test complet d'un produit, 8 à 12 minutes", price: "Sur devis" },
        { title: "Format court TikTok + Reel", detail: "Recette ou démonstration, 30 à 60 secondes", price: "Sur devis" }
      ],
      views: 342
    }
  });

  // Une génération du Studio IA déjà faite (idées), pour l'historique.
  await db.studioGeneration.create({
    data: {
      brandId: brand.id,
      userId: user.id,
      kind: "ideas",
      input: { network: "TIKTOK", theme: "recettes d'automne" },
      output: {
        kind: "ideas",
        ideas: [
          { title: "Latte à la citrouille, version maison", angle: "Recette de saison, dans le format qui marche le mieux chez vous (recette en moins d'une minute).", format: "court", network: "TIKTOK", basedOn: null, hooks: ["Le latte d'automne, sans sirop industriel.", "3 ingrédients, 1 minute."] },
          { title: "Le cœur en latte art, raté puis réussi", angle: "Votre vidéo latte art a fait 3,4 fois votre moyenne : montrez les ratés avant la réussite.", format: "court", network: "TIKTOK", basedOn: null, hooks: ["Mon premier cœur ressemblait à ça…", "Le geste que personne ne montre."] },
          { title: "Chai latte : la vraie recette", angle: "Suite logique de la cardamome, très demandée en commentaires.", format: "court", network: "INSTAGRAM", basedOn: null, hooks: ["Oubliez les poudres toutes prêtes."] }
        ]
      },
      createdAt: new Date(now.getTime() - DAY)
    }
  });

  return { userId: user.id, brandId: brand.id, reportToken: report.token, calendarToken: share.token, published };
}

// Lancement direct : npx tsx scripts/demo/seed-demo.ts
if (process.argv[1] && /seed-demo\.ts$/.test(process.argv[1])) {
  (async () => {
    assertDemoDatabase(process.env.DATABASE_URL);
    const [{ PrismaClient }, bcrypt] = await Promise.all([import("@prisma/client"), import("bcryptjs")]);
    const db = new PrismaClient();
    const out = await seedDemo(db, { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 12) });
    console.log("Démo installée :", out);
    await db.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
