import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Page Publications (09/10/2026, demande de Lucas) : seul le titre ouvre la
// fiche, et chaque ligne a ses boutons (Modifier, Statistiques,
// Commentaires, Voir sur le réseau, Supprimer, « ⋮ »), comme YouTube Studio.
import { commentOfPost, commentOfTarget } from "@/lib/posts/comment-match";

const read = (p: string) => readFileSync(p, "utf8");

describe("page Publications : titre cliquable et boutons de ligne", () => {
  const page = read("src/app/(dashboard)/publications/page.tsx");
  it("la ligne n'est plus un lien ; le titre l'est, souligné au survol", () => {
    expect(page).toContain('<div className="group/row rounded-xl py-3 transition hover:bg-[color:var(--nb-hover)]">');
    expect(page).toContain("underline-offset-2 hover:underline");
    expect(page).not.toContain('className="group/row block rounded-xl');
  });
  it("boutons : Modifier / Détails, Statistiques, Commentaires, Voir sur, Supprimer, menu", () => {
    for (const label of ['"Statistiques"', '"Commentaires"', '"Supprimer"', '"Plus d\'options"', "Voir sur ${label(", "Dupliquer", "Fiche complète"]) {
      expect(page).toContain(label);
    }
    expect(page).toContain('href={`/interactions?post=${post.id}`}');
    expect(page).toContain("<PostEditModal");
    expect(page).toContain("<DeletePostDialog");
    // Au survol sur ordinateur, toujours visibles sur téléphone.
    expect(page).toContain("lg:group-hover/row:block");
  });
  it("la fenêtre de modification s'ouvre sur l'onglet demandé", () => {
    expect(read("src/components/dashboard/post-edit-modal.tsx")).toContain('useState<"stats" | "content">(initialTab)');
  });
});

describe("commentaires d'une publication (/comments?post=…)", () => {
  const t = { connectionId: "c1", externalPostId: "123_456", externalUrl: "https://www.facebook.com/123/posts/456" };
  it("même compte et même publication (identifiant, forme page_publication, ou lien)", () => {
    expect(commentOfTarget({ connectionId: "c1", postExternalId: "123_456", postPermalink: null }, t)).toBe(true);
    expect(commentOfTarget({ connectionId: "c1", postExternalId: "456", postPermalink: null }, t)).toBe(true);
    expect(commentOfTarget({ connectionId: "c1", postExternalId: null, postPermalink: "https://www.facebook.com/123/posts/456?ref=x" }, t)).toBe(true);
  });
  it("autre compte ou autre publication : non", () => {
    expect(commentOfTarget({ connectionId: "c2", postExternalId: "123_456", postPermalink: null }, t)).toBe(false);
    expect(commentOfTarget({ connectionId: "c1", postExternalId: "789", postPermalink: null }, t)).toBe(false);
    expect(commentOfPost({ connectionId: "c1", postExternalId: "789", postPermalink: null }, [t])).toBe(false);
  });
  it("la page Commentaires lit ?post= et propose de retirer le filtre", () => {
    const c = read("src/components/interactions/comments-view.tsx");
    expect(c).toContain('params.get("post")');
    expect(c).toContain("commentOfPost(it, postFilter.targets)");
    expect(c).toContain('router.replace("/interactions")');
  });
});
