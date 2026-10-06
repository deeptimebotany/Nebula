// Plafond TikTok des comptes qui publient (06/10/2026) : seuils, textes des
// alertes et messages clairs des refus de TikTok — règles pures.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { capAlertText, tiktokAlertThreshold, tiktokPublisherCap, utcDay } from "@/lib/social/tiktok-cap";
import { TIKTOK_ACTIVE_USER_CAP, TIKTOK_ERROR_MESSAGES, tiktokErrorMessage } from "@/lib/social/tiktok-errors";
import { SocialApiError } from "@/lib/social/base";
import { classifyProviderError, errorAdvice } from "@/lib/social/errors";

describe("plafond TikTok : seuils", () => {
  it("100 comptes et alerte à 70 par défaut ; 70 % d'un autre plafond ; réglage explicite borné au plafond", () => {
    expect(tiktokPublisherCap({})).toBe(100);
    expect(tiktokAlertThreshold({})).toBe(70);
    // Avant l'audit Direct Post, TikTok limite à 5 comptes : alerte à 4.
    expect(tiktokAlertThreshold({ TIKTOK_DAILY_PUBLISHER_CAP: "5" })).toBe(4);
    expect(tiktokAlertThreshold({ TIKTOK_DAILY_PUBLISHER_CAP: "1000" })).toBe(700);
    expect(tiktokAlertThreshold({ TIKTOK_PUBLISHER_ALERT_AT: "80" })).toBe(80);
    expect(tiktokAlertThreshold({ TIKTOK_PUBLISHER_ALERT_AT: "150" })).toBe(100);
    expect(tiktokPublisherCap({ TIKTOK_DAILY_PUBLISHER_CAP: "abc" })).toBe(100);
    expect(tiktokAlertThreshold({ TIKTOK_PUBLISHER_ALERT_AT: "0" })).toBe(70);
    expect(utcDay(new Date("2026-10-06T23:30:00+02:00"))).toBe("2026-10-06");
    expect(utcDay(new Date("2026-10-07T00:30:00+02:00"))).toBe("2026-10-06");
  });

  it("alerte du seuil : chiffre du jour, plafond et maximum des 30 derniers jours", () => {
    const t = capAlertText("threshold", { last24h: 72, cap: 100, alertAt: 70, max30: { peak: 41, day: "2026-10-03" } });
    expect(t.title).toBe("TikTok : 72 comptes ont publié sur 24 h (plafond : 100)");
    expect(t.body).toContain("Aujourd'hui : 72 comptes TikTok différents ont publié via Nebula sur les dernières 24 heures, pour un plafond TikTok de 100.");
    expect(t.body).toContain("Maximum des 30 derniers jours : 41 comptes, le 3 octobre.");
    expect(capAlertText("threshold", { last24h: 70, cap: 100, alertAt: 70, max30: null }).body).toContain("Maximum des 30 derniers jours : aucune publication TikTok.");
    expect(capAlertText("threshold", { last24h: 70, cap: 100, alertAt: 70, max30: { peak: 1, day: "2026-10-01" } }).body).toContain("1 compte, le 1er octobre");
    const r = capAlertText("reached", { last24h: 100, cap: 100, alertAt: 70, max30: { peak: 98, day: "2026-10-05" } });
    expect(r.title).toBe("TikTok a refusé une publication : plafond de 100 comptes atteint");
    expect(r.body).toContain("reached_active_user_cap");
    expect(r.body).toContain("Comptés par Nebula sur les dernières 24 heures : 100 comptes TikTok différents.");
  });
});

describe("refus de TikTok en clair", () => {
  it("plafond de l'application : message français qui dit quoi faire, catégorie « limite quotidienne », pas de relance automatique", () => {
    const msg = tiktokErrorMessage(TIKTOK_ACTIVE_USER_CAP, "The daily quota for active publishing users from your client is reached.");
    expect(msg).toMatch(/^TikTok limite chaque jour le nombre de comptes qui peuvent publier depuis Nebula/);
    expect(msg).toContain("relancez-la demain");
    const err = new SocialApiError("TIKTOK", msg, 400, { error: { code: TIKTOK_ACTIVE_USER_CAP } }, TIKTOK_ACTIVE_USER_CAP);
    expect(classifyProviderError(err)).toMatchObject({ category: "QUOTA_EXHAUSTED", autoRetry: false, outage: false });
    expect(errorAdvice("QUOTA_EXHAUSTED", "TikTok")).toBe("La limite quotidienne de TikTok est atteinte : relancez demain.");
  });

  it("codes inconnus : le texte de TikTok ; jamais de propriété héritée", () => {
    expect(tiktokErrorMessage("nouveau_code", "Texte de TikTok")).toBe("Texte de TikTok");
    expect(tiktokErrorMessage("__proto__", "x")).toBe("x");
    expect(tiktokErrorMessage("constructor", "x")).toBe("x");
    expect(tiktokErrorMessage(null, "x")).toBe("x");
    for (const text of Object.values(TIKTOK_ERROR_MESSAGES)) expect(text).not.toMatch(/\b(the|your|is reached)\b/i);
  });

  it("la section TikTok de Publier montre les mêmes textes", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync("src/app/api/social/tiktok/creator-info/route.ts", "utf8");
    expect(route).toContain("TIKTOK_ERROR_MESSAGES[code]");
    expect(route).not.toContain("Réessayez plus tard.");
  });
});
