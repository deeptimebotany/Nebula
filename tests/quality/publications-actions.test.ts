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
    expect(page).toContain('<div className={clsx("group/row rounded-xl py-3 transition", checked ? "bg-aurora-500/[0.08]" : "hover:bg-[color:var(--nb-hover)]")}>');
    expect(page).toContain("underline-offset-2 hover:underline");
    expect(page).not.toContain('className="group/row block rounded-xl');
  });
  it("boutons : Modifier / Détails, Statistiques, Commentaires, Voir sur (un par réseau), Dupliquer, Supprimer — plus de menu « ⋮ »", () => {
    for (const label of ['"Statistiques"', '"Commentaires"', '"Supprimer"', "Voir sur ${label(", 'title="Dupliquer"']) {
      expect(page).toContain(label);
    }
    expect(page).not.toContain("Plus d'options");
    expect(page).not.toContain("IconDots");
    // Ordre demandé : Voir sur le réseau, Dupliquer, puis la corbeille.
    const row = page.slice(page.indexOf("function RowActions("));
    expect(row.indexOf("Voir sur ${label(")).toBeLessThan(row.indexOf('title="Dupliquer"'));
    expect(row.indexOf('title="Dupliquer"')).toBeLessThan(row.indexOf('title="Supprimer"'));
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

describe("page Publications : cases à cocher et suppression groupée", () => {
  const page = read("src/app/(dashboard)/publications/page.tsx");
  it("une case par ligne, « tout cocher » dans l'en-tête, barre « N publications sélectionnées »", () => {
    expect(page).toContain('<SelectBox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} label="Tout sélectionner" />');
    expect(page).toContain('data-testid="publications-selection-bar"');
    expect(page).toContain("grid-cols-[24px_minmax(0,1fr)_160px_150px_80px_116px_80px]");
    expect(page).toContain("const ok = await confirm({");
    expect(page).toContain('fetch("/api/posts/bulk-delete"');
  });
  it("route : seulement ses publications, pas celles en cours d'envoi, dans Nebula seulement", () => {
    const route = read("src/app/api/posts/bulk-delete/route.ts");
    expect(route).toContain("brand: ownedBy(userId)");
    expect(route).toContain('p.status !== "PUBLISHING"');
    expect(route).toContain("z.array(z.string().min(1).max(64)).min(1).max(100)");
    expect(route).toContain("deletePostAndOrphanMedia(p.id)");
  });
});

describe("calendrier : panneau Filtres", () => {
  it("fond plein de menu, fermé par un clic ailleurs ou Échap", () => {
    const cal = read("src/app/(dashboard)/calendar/page.tsx");
    expect(cal).toContain('className="nb-popover absolute left-0 top-[calc(100%+6px)] z-40 w-72 rounded-xl border bg-[color:var(--nb-elevated)] p-3 shadow-2xl"');
    expect(cal).toContain("if (!filtersRef.current?.contains(e.target as Node)) setFiltersOpen(false);");
    expect(cal).not.toContain("glass-panel absolute left-0");
  });
});
