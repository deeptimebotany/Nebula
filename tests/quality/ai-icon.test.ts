// Étoile de l'IA (06/10/2026) : blanche au repos (gris foncé en mode clair),
// couleur de l'IA au survol et pendant l'utilisation ; bouton flottant du
// chat retiré (doublon du bouton « Demander à Nebula » de l'en-tête).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiIcon } from "@/components/ai/ai-icon";

const read = (f: string) => readFileSync(f, "utf8");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("étoile de l'IA", () => {
  it("classes selon l'état", () => {
    expect(renderToStaticMarkup(createElement(AiIcon, { className: "h-4 w-4" }))).toMatch(/class="nb-ai-icon h-4 w-4"/);
    expect(renderToStaticMarkup(createElement(AiIcon, { active: true }))).toContain("nb-ai-icon-active");
    expect(renderToStaticMarkup(createElement(AiIcon, { tone: "onAccent" }))).toContain("nb-ai-icon-on-accent");
  });

  it("toutes les étoiles de l'IA passent par AiIcon, sans couleur imposée", () => {
    const offenders = files("src").filter((f) => !f.endsWith(join("ai", "ai-icon.tsx")) && read(f).includes("<IconSparkle"));
    expect(offenders).toEqual([]);
    for (const f of files("src")) {
      for (const m of read(f).matchAll(/<AiIcon [^>]*className=(?:"([^"]*)"|\{clsx\("([^"]*)")/g)) expect(m[1] ?? m[2], f).not.toMatch(/text-aurora/);
    }
  });

  it("couleur au repos, au survol et pendant l'utilisation (clair et sombre)", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.nb-ai-icon \{\s*color: #f4f4f5;/);
    expect(css).toMatch(/\[data-mode="light"\] \.nb-ai-icon \{\s*color: #27272a;/);
    expect(css).toContain(".nb-ai-icon.nb-ai-icon-active,");
    expect(css).toContain(':is(button, a, label, summary, [role="button"]):not(:disabled):not([aria-disabled="true"]):is(:hover, :focus-visible) .nb-ai-icon');
  });

  it("gardée en couleur tant que l'IA travaille ou que le chat est ouvert", () => {
    expect(read("src/components/dashboard/app-header.tsx")).toContain("<AiIcon className=\"h-4 w-4\" active={assistant.open} />");
    const composer = read("src/app/(dashboard)/composer/page.tsx");
    expect(composer).toContain("active={generatingAll}");
    expect(composer).toContain("active={repurposeOpen || repurposeLoading}");
    expect(composer).toContain('active={generatingFields.has("title")}');
    expect(read("src/components/comments/comment-reply-box.tsx")).toContain('active={busy === "suggest"}');
  });
});

describe("bouton flottant du chat retiré", () => {
  it("plus de bouton flottant ; le bouton de l'en-tête prépare le tiroir", () => {
    const lazy = read("src/components/dashboard/ai-assistant-lazy.tsx");
    expect(lazy).not.toContain("<button");
    expect(lazy).toContain("prepared");
    for (const f of files("src")) expect(read(f), f).not.toContain("nebula-chat-launcher");
    expect(read("src/app/globals.css")).not.toContain("nebula-chat-launcher");
    const header = read("src/components/dashboard/app-header.tsx");
    expect(header).toContain("onPointerEnter={assistant.prepare}");
    expect(header).toContain("onFocus={assistant.prepare}");
  });
});
