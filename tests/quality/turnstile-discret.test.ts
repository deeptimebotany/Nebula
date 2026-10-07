// Anti-robot discret (06/10/2026) : la case Cloudflare n'apparaît que si
// Cloudflare demande un clic ; le message d'attente ne suppose plus une case
// visible.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TURNSTILE_PENDING_MESSAGE } from "@/components/turnstile-widget";

describe("Turnstile discret", () => {
  it("le widget est rendu en mode « interaction-only », pleine largeur", () => {
    const src = readFileSync("src/components/turnstile-widget.tsx", "utf8");
    expect(src).toContain('appearance: "interaction-only"');
    expect(src).toContain('size: "flexible"');
  });

  it("le message d'attente ne demande de cocher la case que si elle est apparue", () => {
    expect(TURNSTILE_PENDING_MESSAGE).toMatch(/^Vérification anti-robot en cours/);
    expect(TURNSTILE_PENDING_MESSAGE).toContain("Si une case");
    expect(TURNSTILE_PENDING_MESSAGE).not.toMatch(/Cochez d'abord/);
  });
});
