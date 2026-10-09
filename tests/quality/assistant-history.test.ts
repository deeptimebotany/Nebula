import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Historique de « Demander à Nebula » (09/10/2026, demande de Lucas) :
// bouton ☰ « Discussions » à gauche du titre, « Nouvelle conversation » à
// côté de la croix, conversation enregistrée à chaque réponse.
import { conversationTitle, storableMessages, CONVERSATION_MAX_MESSAGES } from "@/lib/ai/assistant-conversations";

const read = (p: string) => readFileSync(p, "utf8");

describe("conversations : ce qui est gardé", () => {
  it("titre = première question sur une ligne, raccourcie", () => {
    expect(conversationTitle([{ role: "user", text: "  Quelle   heure\npour publier ?" }])).toBe("Quelle heure pour publier ?");
    expect(conversationTitle([{ role: "user", text: "x".repeat(200) }])).toHaveLength(80);
    expect(conversationTitle([])).toBe("Conversation");
  });
  it("texte seulement, sans message vide ni rôle inconnu, 60 messages au plus", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ role: i % 2 ? "model" : "user", text: `m${i}` }));
    const kept = storableMessages([...many, { role: "system", text: "x" }, { role: "user", text: "  " }]);
    expect(kept).toHaveLength(CONVERSATION_MAX_MESSAGES);
    expect(kept[kept.length - 1]).toEqual({ role: "model", text: "m69" });
    expect(Object.keys(kept[0]).sort()).toEqual(["role", "text"]);
  });
});

describe("tiroir : Discussions et nouvelle conversation", () => {
  const chat = read("src/components/dashboard/ai-assistant.tsx");
  it("en-tête : ☰ Discussions à gauche, Nouvelle conversation à côté de la croix", () => {
    expect(chat).toContain('aria-label="Discussions : vos conversations passées"');
    expect(chat).toContain('aria-label="Nouvelle conversation"');
    expect(chat).toContain('aria-label="Revenir au chat"');
    expect(chat.indexOf('aria-label="Nouvelle conversation"')).toBeLessThan(chat.indexOf('aria-label="Fermer l\'assistant"'));
  });
  it("chaque envoi demande l'enregistrement et réutilise l'identifiant renvoyé", () => {
    expect(chat).toContain("messages: history, save: true, conversationId");
    expect(chat).toContain("setConversationId(data.conversationId);");
    expect(chat).toContain("/api/ai/conversations?brandId=");
    expect(chat).toContain('method: "DELETE"');
  });
  it("serveur : enregistrement après la réponse, purge à 90 jours, export des données", () => {
    expect(read("src/app/api/ai/chat/route.ts")).toContain("savedId = await saveConversation({ userId, brandId, conversationId, messages: [...messages, { role: \"model\", text: body.reply }] })");
    expect(read("src/lib/account-jobs.ts")).toContain("purgeOldConversations()");
    expect(read("src/app/api/settings/export/route.ts")).toContain("assistantConversations: {");
    expect(read("prisma/migrations/20261016090000_assistant_conversations/migration.sql")).toContain('CREATE TABLE "AssistantConversation"');
  });
  it("aide et politique de confidentialité à jour", () => {
    const help = read("src/app/aide/demander-a-nebula/page.tsx");
    expect(help).not.toContain("ne garde pas le texte de vos conversations");
    expect(help).toContain("effacées automatiquement 90 jours après leur dernier message");
    expect(read("src/app/legal/page.tsx")).toContain("Les conversations avec l&apos;assistant sont supprimées 90 jours après leur dernier");
  });
});
