// Règles « Direct Post » de TikTok (30/09/2026) : section TikTok de Publier,
// bouton désactivé tant qu'un choix manque, contenu de marque jamais privé,
// phrase de consentement, découpage de l'envoi par morceaux.
// Réf. : https://developers.tiktok.com/doc/content-sharing-guidelines
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BRANDED_CONTENT_NOT_PRIVATE,
  COMMERCIAL_CHOICE_REQUIRED,
  DEFAULT_TIKTOK_OPTIONS,
  TIKTOK_BRANDED_CONTENT_POLICY_URL,
  TIKTOK_MUSIC_USAGE_URL,
  brandedContentDisabledReason,
  parseTiktokOptions,
  privacyOptionDisabledReason,
  tiktokBlockingReason,
  tiktokChunkPlan,
  tiktokChunkRange,
  tiktokConsentText,
  tiktokLabelNotice,
  tiktokOptionsProblem,
  tiktokPostInfo,
  type TiktokCreatorInfo,
  type TiktokPostOptions
} from "@/lib/social/tiktok-direct-post";
import { TiktokOptions, primeTiktokCreatorCache } from "@/components/composer/tiktok-options";
import { PublishActions, WhenSection } from "@/components/composer/publish-card";

const MB = 1024 * 1024;
const CREATOR: TiktokCreatorInfo = {
  avatarUrl: "https://p16.tiktokcdn.com/a.jpeg",
  username: "cafe.nebula",
  nickname: "Café Nebula",
  privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: true,
  maxVideoPostDurationSec: 180
};
const opts = (over: Partial<TiktokPostOptions> = {}): TiktokPostOptions => ({ ...DEFAULT_TIKTOK_OPTIONS, ...over });

describe("TikTok : choix obligatoires avant l'envoi", () => {
  it("par défaut : aucune confidentialité, interactions et contenu commercial éteints", () => {
    expect(DEFAULT_TIKTOK_OPTIONS).toEqual({ privacyLevel: null, allowComment: false, allowDuet: false, allowStitch: false, commercial: false, yourBrand: false, brandedContent: false });
  });

  it("bouton désactivé tant que la confidentialité n'est pas choisie", () => {
    expect(tiktokBlockingReason(opts(), CREATOR, { mediaType: "VIDEO" })).toBe("TikTok : choisissez qui peut voir la vidéo.");
    expect(tiktokBlockingReason(opts({ privacyLevel: "PUBLIC_TO_EVERYONE" }), CREATOR, { mediaType: "VIDEO" })).toBeNull();
  });

  it("confidentialité qui n'est plus proposée par le compte : bloqué, jamais remplacée", () => {
    const reason = tiktokBlockingReason(opts({ privacyLevel: "FOLLOWER_OF_CREATOR" }), { ...CREATOR, privacyLevelOptions: ["SELF_ONLY"] });
    expect(reason).toContain("« Mes abonnés » n'est plus proposée");
  });

  it("contenu commercial allumé sans option : bloqué, avec la phrase de TikTok", () => {
    expect(tiktokBlockingReason(opts({ privacyLevel: "PUBLIC_TO_EVERYONE", commercial: true }), CREATOR)).toContain("vous devez indiquer si votre contenu fait votre propre promotion, celle d'un tiers, ou les deux");
    expect(COMMERCIAL_CHOICE_REQUIRED).toBe("Vous devez indiquer si votre contenu fait votre propre promotion, celle d'un tiers, ou les deux.");
    expect(tiktokBlockingReason(opts({ privacyLevel: "PUBLIC_TO_EVERYONE", commercial: true, yourBrand: true }), CREATOR)).toBeNull();
  });

  it("« Contenu de marque » grise « Moi uniquement », et inversement", () => {
    const branded = opts({ commercial: true, brandedContent: true });
    expect(privacyOptionDisabledReason("SELF_ONLY", branded)).toBe(BRANDED_CONTENT_NOT_PRIVATE);
    expect(privacyOptionDisabledReason("PUBLIC_TO_EVERYONE", branded)).toBeNull();
    expect(privacyOptionDisabledReason("SELF_ONLY", opts({ commercial: true, yourBrand: true }))).toBeNull();
    expect(brandedContentDisabledReason(opts({ privacyLevel: "SELF_ONLY" }))).toContain(BRANDED_CONTENT_NOT_PRIVATE);
    expect(tiktokBlockingReason(opts({ privacyLevel: "SELF_ONLY", commercial: true, brandedContent: true }), CREATOR)).toContain("« Moi uniquement »");
  });

  it("durée : au-delà du maximum du compte, bloqué ; photo : bloqué", () => {
    expect(tiktokBlockingReason(opts({ privacyLevel: "SELF_ONLY" }), CREATOR, { mediaType: "VIDEO", durationSec: 181 })).toBe("TikTok : vidéo trop longue pour ce compte (181 s, 180 s au plus).");
    expect(tiktokBlockingReason(opts({ privacyLevel: "SELF_ONLY" }), CREATOR, { mediaType: "VIDEO", durationSec: 180.2 })).toBeNull();
    expect(tiktokBlockingReason(opts({ privacyLevel: "SELF_ONLY" }), CREATOR, { mediaType: "IMAGE" })).toContain("ajoutez une vidéo");
  });

  it("à la création (Publier, API) : confidentialité et contenu commercial vérifiés sans appel à TikTok", () => {
    expect(tiktokOptionsProblem(undefined)).toContain("choisissez qui peut voir la vidéo");
    expect(tiktokOptionsProblem({ privacyLevel: "N_IMPORTE_QUOI" })).toContain("choisissez qui peut voir la vidéo");
    expect(tiktokOptionsProblem({ privacyLevel: "SELF_ONLY", commercial: true })).toContain("vous devez indiquer");
    expect(tiktokOptionsProblem({ privacyLevel: "SELF_ONLY", commercial: true, brandedContent: true })).toContain("contenu de marque");
    expect(tiktokOptionsProblem({ privacyLevel: "MUTUAL_FOLLOW_FRIENDS" })).toBeNull();
    expect(parseTiktokOptions({ privacyLevel: "SELF_ONLY", allowComment: "oui", videoDurationSec: -3 })).toEqual({ ...DEFAULT_TIKTOK_OPTIONS, privacyLevel: "SELF_ONLY", videoDurationSec: null });
  });
});

describe("TikTok : consentement et étiquettes", () => {
  it("phrase de consentement selon les cas", () => {
    const music = "En publiant, vous acceptez la confirmation d'utilisation de la musique de TikTok.";
    const branded = "En publiant, vous acceptez la politique relative au contenu de marque et la confirmation d'utilisation de la musique de TikTok.";
    expect(tiktokConsentText(opts())).toBe(music);
    expect(tiktokConsentText(opts({ commercial: true, yourBrand: true }))).toBe(music);
    expect(tiktokConsentText(opts({ commercial: true, brandedContent: true }))).toBe(branded);
    expect(tiktokConsentText(opts({ commercial: true, yourBrand: true, brandedContent: true }))).toBe(branded);
    // Interrupteur éteint : les cases cochées avant ne comptent plus.
    expect(tiktokConsentText(opts({ commercial: false, brandedContent: true }))).toBe(music);
  });

  it("étiquettes « Contenu promotionnel » et « Partenariat rémunéré »", () => {
    expect(tiktokLabelNotice(opts({ commercial: true, yourBrand: true }))).toBe("Votre vidéo sera étiquetée « Contenu promotionnel ».");
    expect(tiktokLabelNotice(opts({ commercial: true, brandedContent: true }))).toBe("Votre vidéo sera étiquetée « Partenariat rémunéré ».");
    expect(tiktokLabelNotice(opts({ commercial: true, yourBrand: true, brandedContent: true }))).toBe("Votre vidéo sera étiquetée « Partenariat rémunéré ».");
    expect(tiktokLabelNotice(opts())).toBeNull();
  });

  it("post_info : interactions coupées par l'utilisateur OU le créateur, déclarations commerciales", () => {
    expect(tiktokPostInfo(opts({ privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowStitch: true, commercial: true, yourBrand: true }), CREATOR, "Légende")).toEqual({
      title: "Légende",
      privacy_level: "PUBLIC_TO_EVERYONE",
      disable_comment: false,
      disable_duet: true,
      disable_stitch: true,
      brand_content_toggle: false,
      brand_organic_toggle: true
    });
  });
});

describe("TikTok : section de Publier (rendu)", () => {
  primeTiktokCreatorCache("c-tiktok", CREATOR);
  const render = (value: TiktokPostOptions) =>
    renderToStaticMarkup(
      createElement(TiktokOptions, { connectionId: "c-tiktok", value, onChange: () => undefined, video: { url: "https://cdn.test/v.mp4", type: "VIDEO" }, onStatus: () => undefined })
    );

  it("compte affiché, confidentialité sans valeur par défaut, interactions éteintes, Collage grisé", () => {
    const html = render(opts());
    expect(html).toContain("Café Nebula");
    expect(html).toContain("@cafe.nebula");
    expect(html).toContain('<option value="" disabled="" selected="">Choisir la confidentialité…</option>');
    expect(html).not.toMatch(/<option value="[A-Z_]+"[^>]*selected/);
    // Les 4 interrupteurs (Commenter, Duo, Collage, contenu commercial) éteints.
    expect((html.match(/aria-checked="false"/g) ?? []).length).toBe(4);
    expect(html).toMatch(/aria-checked="false" aria-label="Autoriser : Faire un Collage \(Stitch\)" disabled=""/);
    expect(html).toContain("coupé dans vos réglages TikTok");
    expect(html).toContain("la confirmation d&#x27;utilisation de la musique");
    expect(html).toContain(TIKTOK_MUSIC_USAGE_URL);
    expect(html).not.toContain(TIKTOK_BRANDED_CONTENT_POLICY_URL);
  });

  it("« Contenu de marque » coché : « Moi uniquement » désactivé avec l'explication au survol, lien vers la politique", () => {
    const html = render(opts({ privacyLevel: "PUBLIC_TO_EVERYONE", commercial: true, brandedContent: true }));
    expect(html).toContain(`<option value="SELF_ONLY" disabled="" title="${BRANDED_CONTENT_NOT_PRIVATE.replace(/'/g, "&#x27;")}"`);
    expect(html).toContain(TIKTOK_BRANDED_CONTENT_POLICY_URL);
    expect(html).toContain("Partenariat rémunéré");
  });

  it("« Moi uniquement » choisi : « Contenu de marque » grisé ; contenu commercial sans option : message", () => {
    const html = render(opts({ privacyLevel: "SELF_ONLY", commercial: true }));
    expect(html).toMatch(/<input type="checkbox" class="mt-0.5 accent-aurora-500" disabled=""\/>/);
    expect(html).toContain(COMMERCIAL_CHOICE_REQUIRED.replace(/'/g, "&#x27;"));
  });

  it("bouton Publier désactivé avec la raison au survol, phrase de consentement dessous", () => {
    // Refonte V2 (07/10/2026) : « Quand » au bas du formulaire, avec ses deux boutons.
    const reason = "TikTok : choisissez qui peut voir la vidéo.";
    const html = renderToStaticMarkup(
      createElement(WhenSection, {
        mode: "now",
        scheduleDate: "",
        onScheduleDateChange: () => undefined,
        onClearDate: () => undefined,
        timezone: "Europe/Paris",
        bestSlot: null,
        shortcutLabel: "Ctrl",
        missing: reason,
        missingTone: "warning",
        actions: createElement(PublishActions, { scheduled: false, canSubmit: false, submitting: false, blockedReason: reason, onSchedule: () => undefined, onPublishNow: () => undefined }),
        footnote: createElement("p", null, "En publiant, vous acceptez …")
      })
    );
    expect(html).toMatch(/aria-disabled="true" title="TikTok : choisissez qui peut voir la vidéo."[^>]*>Publier maintenant</);
    expect(html).toContain("En publiant, vous acceptez …");
  });
});

describe("TikTok : envoi par morceaux (FILE_UPLOAD)", () => {
  it("découpage conforme : 5 à 64 Mo, dernier morceau ≤ 128 Mo, petite vidéo en un morceau", () => {
    expect(tiktokChunkPlan(3 * MB)).toEqual({ videoSize: 3 * MB, chunkSize: 3 * MB, totalChunks: 1 });
    expect(tiktokChunkPlan(8 * MB)).toEqual({ videoSize: 8 * MB, chunkSize: 8 * MB, totalChunks: 1 });
    expect(tiktokChunkPlan(15 * MB)).toEqual({ videoSize: 15 * MB, chunkSize: 10 * MB, totalChunks: 1 });
    for (const size of [25 * MB + 3, 500 * MB + 12345, 3.9 * 1024 * MB, 4 * 1024 * MB]) {
      const plan = tiktokChunkPlan(Math.floor(size));
      expect(plan.totalChunks).toBeLessThanOrEqual(1000);
      expect(plan.chunkSize).toBeGreaterThanOrEqual(5 * MB);
      expect(plan.chunkSize).toBeLessThanOrEqual(64 * MB);
      let next = 0;
      for (let i = 0; i < plan.totalChunks; i++) {
        const { start, end } = tiktokChunkRange(plan, i);
        expect(start).toBe(next);
        const len = end - start + 1;
        if (i < plan.totalChunks - 1) expect(len).toBe(plan.chunkSize);
        else expect(len).toBeLessThanOrEqual(128 * MB);
        next = end + 1;
      }
      expect(next).toBe(plan.videoSize);
    }
    expect(() => tiktokChunkPlan(4 * 1024 * MB + 1)).toThrow(/4 Go/);
    expect(() => tiktokChunkPlan(0)).toThrow();
  });
});
