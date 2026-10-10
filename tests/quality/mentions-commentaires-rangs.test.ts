import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractMentions, insertMention, mentionAtCursor, splitMentions } from "@/lib/community/mention-rules";
import { commentActionSupport } from "@/lib/social/comment-actions-support";
import { RANKS } from "@/lib/reussites/catalog";
import { supportMessageSubject } from "@/lib/support-message";
import { APP_MAP } from "@/lib/ai/assistant-prompts";

// 10/10/2026, demandes de Lucas : mentions @pseudo, commentaires façon
// YouTube Studio, rangs renommés, « Écrire à l'équipe », barre rapide de la
// Vue d'ensemble retirée, survol du rang corrigé.
const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("mentions @pseudo : lecture du texte", () => {
  it("trouve les pseudos, sans doublon, en minuscules ; jamais dans une adresse e-mail ni au milieu d'un mot", () => {
    expect(extractMentions("Merci @Lea.Montage et @theo_v ! (@lea.montage.)")).toEqual(["lea.montage", "theo_v"]);
    expect(extractMentions("contact@cafe.fr, moi@lea.montage, x@yz")).toEqual([]);
    expect(extractMentions("@ab trop court, @" + "a".repeat(25) + " trop long")).toEqual([]);
    expect(extractMentions("Fin de phrase avec @nova.cuisine.")).toEqual(["nova.cuisine"]);
  });
  it("découpe le texte pour afficher les mentions en liens", () => {
    expect(splitMentions("Salut @Lea.Montage, ça va ?")).toEqual([
      { kind: "text", text: "Salut " },
      { kind: "mention", handle: "lea.montage", text: "@Lea.Montage" },
      { kind: "text", text: ", ça va ?" }
    ]);
    expect(splitMentions("rien ici")).toEqual([{ kind: "text", text: "rien ici" }]);
  });
  it("mention en cours de saisie, puis insertion « @pseudo » et curseur après l'espace", () => {
    const text = "Merci @le";
    const at = mentionAtCursor(text, text.length);
    expect(at).toEqual({ start: 6, query: "le" });
    expect(insertMention(text, at!, "lea.montage")).toEqual({ text: "Merci @lea.montage ", cursor: 19 });
    expect(mentionAtCursor("mail@le", 7)).toBeNull();
    expect(mentionAtCursor("Salut @", 7)).toEqual({ start: 6, query: "" });
  });
  it("champ de saisie, rendu en liens et onglet Mentions branchés dans la Communauté", () => {
    expect(read("src/app/(dashboard)/community/[id]/page.tsx")).toContain("<MentionTextarea");
    expect(read("src/app/(dashboard)/community/[id]/page.tsx")).toContain("<MentionText text={r.body} />");
    expect(read("src/components/community/feedback/feedback-card.tsx")).toContain("<MentionTextarea");
    const page = read("src/app/(dashboard)/community/page.tsx");
    expect(page).toContain('["mentions", "Mentions", mentionsUnread]');
    expect(page).toContain("<MentionsTab onRead={() => setMentionsUnread(0)} />");
  });
});

describe("commentaires des réseaux : ce que chaque réseau permet", () => {
  it("j'aime : Facebook et Bluesky ; supprimer : Instagram et Facebook ; jamais pour un lecteur ni un compte expiré", () => {
    const ok = { status: "CONNECTED" };
    expect(commentActionSupport("FACEBOOK", ok, "OWNER")).toMatchObject({ like: true, remove: true, likeHow: null });
    expect(commentActionSupport("BLUESKY", ok, "EDITOR")).toMatchObject({ like: true, remove: false });
    expect(commentActionSupport("INSTAGRAM", ok, "OWNER")).toMatchObject({ like: false, remove: true });
    expect(commentActionSupport("INSTAGRAM", ok, "OWNER").likeHow).toContain("Instagram ne permet pas");
    expect(commentActionSupport("YOUTUBE", ok, "OWNER")).toMatchObject({ like: false, remove: false });
    expect(commentActionSupport("THREADS", ok, "OWNER")).toMatchObject({ like: false, remove: false });
    expect(commentActionSupport("FACEBOOK", ok, "VIEWER")).toMatchObject({ like: false, remove: false });
    expect(commentActionSupport("FACEBOOK", { status: "EXPIRED" }, "OWNER")).toMatchObject({ like: false, remove: false });
  });
  it("page façon YouTube Studio : filtres sur une ligne, colonne Contenu, menu ⋮ avec Supprimer confirmé", () => {
    const c = read("src/components/interactions/comments-view.tsx");
    expect(c).toContain('data-testid="comments-filters"');
    expect(c).toContain('<option value="recent">Les plus récents</option>');
    expect(c).toContain('<option value="unanswered">Sans réponse</option>');
    expect(c).toContain('<span role="columnheader">Contenu</span>');
    expect(c).toContain("title: `Supprimer ce commentaire sur ${label} ?`");
    expect(c).not.toContain("Par publication");
  });
});

describe("rangs renommés (choix de Lucas)", () => {
  it("Débutant → Visionnaire, avec leur phrase ; identifiants inchangés", () => {
    expect(RANKS.map((r) => r.name)).toEqual(["Débutant", "Apprenti", "Artisan", "Artiste", "Auteur", "Guide", "Pionnier", "Visionnaire"]);
    expect(RANKS.map((r) => r.id)).toEqual(["lancement", "emergent", "regulier", "confirme", "etabli", "influent", "reference", "icone"]);
    expect(RANKS[0].tagline).toBe("On essaie, on teste des idées, on découvre la création.");
    expect(RANKS[7].tagline).toBe("Un pilier de la communauté, reconnu pour sa constance et sa bienveillance.");
    // Pas de doublon avec l'étoile « Mentor », l'accomplissement « Explorateur » ni « créateur ».
    for (const r of RANKS) expect(["Mentor", "Explorateur", "Créateur"]).not.toContain(r.name);
  });
  it("survol de l'anneau du rang : plus d'agrandissement qui le coupe", () => {
    const page = read("src/app/(dashboard)/reussites/page.tsx");
    expect(page).not.toContain("hover:scale-[1.04]");
    expect(page).toContain('className="reussites-banner relative scroll-mt-24 overflow-hidden py-1.5"');
  });
});

describe("Écrire à l'équipe et Vue d'ensemble", () => {
  it("formulaire dans Soutenir Nebula, message enregistré comme /contact, l'assistant connaît le chemin", () => {
    expect(read("src/app/(dashboard)/support/page.tsx")).toContain("<TeamMessageForm />");
    expect(read("src/app/api/support/message/route.ts")).toContain("deliverContactMessage(");
    expect(read("src/app/api/contact/route.ts")).toContain("deliverContactMessage(");
    expect(supportMessageSubject("bug")).toBe("Application · Un bug");
    expect(APP_MAP).toContain("Soutenir Nebula → « Écrire à l'équipe »");
  });
  it("Vue d'ensemble : plus de barre « Rédiger une publication en un clic »", () => {
    const d = read("src/app/(dashboard)/dashboard/dashboard-client.tsx");
    expect(d).not.toContain('placeholder="Rédiger une publication en un clic…"');
    expect(d).not.toContain("onQuickCreate");
  });
});
