// Communauté (10/10/2026, demandes de Lucas) : pseudo, cœurs sur les
// demandes d'avis, forum façon YouTube, bulle et page de profil, accueil
// façon YouTube, et message clair des codes secrets de la palette.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HANDLE_WORDS, displayHandle, handleError, normalizeHandle, randomHandle } from "@/lib/community/handle-rules";
import { votePercent } from "@/lib/community/feedback-rules";

const read = (f: string) => readFileSync(f, "utf8");

describe("pseudo de la Communauté", () => {
  it("normalisé : sans @, sans accent, en minuscules, seulement lettres, chiffres, point et tiret bas", () => {
    expect(normalizeHandle("  @Lucas Été! ")).toBe("lucasete");
    expect(normalizeHandle("@@Café_Néb.ula")).toBe("cafe_neb.ula");
  });
  it("règles : 3 à 24 caractères, pas de point ni tiret bas au bord ou doublé, mots réservés refusés", () => {
    expect(handleError("ab")).toMatch(/au moins 3/);
    expect(handleError("a".repeat(25))).toMatch(/au plus 24/);
    expect(handleError("lucas.")).not.toBeNull();
    expect(handleError("lu..cas")).not.toBeNull();
    expect(handleError("admin")).toMatch(/réservé/);
    expect(handleError("nebulaofficiel")).toMatch(/réservé/);
    expect(handleError("cafe.nebula")).toBeNull();
    expect(handleError("comete4821")).toBeNull();
  });
  it("pseudo d'office : un mot de l'espace et des chiffres ; affiché avec @", () => {
    const h = randomHandle(4, () => 0.5);
    expect(h).toMatch(new RegExp(`^(${HANDLE_WORDS.join("|")})\\d{4}$`));
    expect(displayHandle("comete4821")).toBe("@comete4821");
    expect(displayHandle(null)).toBe("@membre");
  });
  it("le nom du compte n'est plus envoyé à la Communauté ; Paramètres → Compte permet de changer de pseudo", () => {
    const author = read("src/lib/reussites/public-author.ts");
    expect(author).toContain("name: displayHandle(a.handle),");
    expect(read("src/components/settings/settings-dialog.tsx")).toContain("<HandleSettings />");
    expect(read("src/lib/me.ts")).toContain("await ensureHandle(userId)");
    expect(read("src/app/api/auth/register/route.ts")).toContain("await ensureHandle(user.id);");
    expect(read("src/lib/auth.ts")).toContain("await ensureHandle(user.id);");
    const migration = read("prisma/migrations/20261017090000_communaute_coeurs_pseudos/migration.sql");
    expect(migration).toContain('CREATE UNIQUE INDEX "User_handle_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "FeedbackVote_optionId_userId_key"');
    expect(migration).toContain('ADD COLUMN "parentId"');
  });
});

describe("cœurs sur les demandes d'avis", () => {
  it("part des votants (plusieurs cœurs par personne : la somme peut dépasser 100 %)", () => {
    expect(votePercent(3, 4)).toBe(75);
    expect(votePercent(4, 4)).toBe(100);
  });
  it("on touche l'image pour mettre ou retirer un cœur, affiché dessus", () => {
    const card = read("src/components/community/feedback/feedback-card.tsx");
    expect(card).toContain("<HeartBadge on={hearted}");
    expect(card).toContain("r.myHearts.includes(o.id)");
    expect(card).toContain("Touchez à nouveau pour retirer un cœur");
  });
});

describe("forum façon YouTube, bulle et page de profil, accueil", () => {
  it("sujet : J'aime (nombre), Je n'aime pas (sans nombre), Répondre, « N réponses » repliées sous un trait", () => {
    const page = read("src/app/(dashboard)/community/[id]/page.tsx");
    expect(page).toContain('data-testid="vote-like"');
    expect(page).toContain('data-testid="vote-dislike"');
    expect(page).toContain('data-testid="toggle-replies"');
    expect(page).toContain("Afficher plus de réponses");
    expect(page).toContain("<MemberAvatar author={r.author}");
  });
  it("clic sur la photo : bulle ; clic sur le pseudo : page de profil", () => {
    expect(read("src/components/community/member-avatar.tsx")).toContain("<ProfileBubble");
    expect(read("src/components/reussites/community-author.tsx")).toContain("href={`/community/membre/${author.handle}`}");
    expect(read("src/components/community/profile-bubble.tsx")).toContain("Voir le profil");
    expect(read("src/app/(dashboard)/community/membre/[handle]/page.tsx")).toContain("Derniers sujets");
  });
  it("accueil par défaut : à la une, « Aidez-les à choisir » (cœurs), vidéos des créateurs, discussions", () => {
    const page = read("src/app/(dashboard)/community/page.tsx");
    expect(page).toContain('useState<Tab>("accueil")');
    expect(page).toContain('["accueil", "Accueil", 0]');
    const home = read("src/components/community/community-home.tsx");
    for (const t of ["★ À la une", "Aidez-les à choisir", "Les vidéos des créateurs", "Les discussions du moment"]) expect(home, t).toContain(t);
    expect(home).toContain("snap-x");
  });
  it("« Mettre ma vidéo à la une » mène au panneau Vidéo à la une (plus à la vitrine)", () => {
    expect(read("src/components/reussites/featured-strip.tsx")).toContain("/reussites?focus=une#recompenses");
    expect(read("src/components/community/community-home.tsx")).toContain("/reussites?focus=une#recompenses");
    expect(read("src/components/reussites/featured-panel.tsx")).toContain('id="une"');
    expect(read("src/app/(dashboard)/reussites/page.tsx")).toContain('"near", "une"]');
    expect(read("src/components/dashboard/navigation.ts")).toContain('{ prefix: "/community/membre/", label: "Profil"');
  });
});

describe("codes secrets de la palette (« hyperespace »)", () => {
  it("dit si l'easter egg est nouveau ou déjà dans la collection", () => {
    const palette = read("src/components/dashboard/command-palette.tsx");
    expect(palette).toContain("Vous l'aviez déjà");
    expect(palette).toContain("rejoint votre collection");
    expect(read("src/lib/report-easter-egg.ts")).toContain("export function reportEasterEggFound(key: string): Promise<boolean | null>");
  });
});
