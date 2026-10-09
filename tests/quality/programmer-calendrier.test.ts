import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Page Publier (09/10/2026, demande de Lucas) : « Programmer » ouvre le
// calendrier, dont le bouton « Programmer » envoie ; plus de « Changer la
// date » ni de « Ne pas programmer » sous « Quand ».
import { WhenSection } from "@/components/composer/publish-card";

const read = (p: string) => readFileSync(p, "utf8");

describe("Programmer : le calendrier s'ouvre au clic", () => {
  it("« Quand » sans liens de date", () => {
    const html = renderToStaticMarkup(
      createElement(WhenSection, { mode: "now", scheduleDate: "", timezone: "Europe/Paris", bestSlot: "2026-10-10T18:00", shortcutLabel: "Ctrl", actions: null })
    );
    expect(html).not.toContain("Changer la date");
    expect(html).not.toContain("Ne pas programmer");
    expect(html).toContain("Samedi 10 octobre, 18 h");
    expect(html).toContain("« Programmer » ouvre le calendrier");
  });
  it("le bouton ouvre le calendrier (sauf s'il manque quelque chose) et son bouton « Programmer » envoie la date retenue", () => {
    const card = read("src/components/composer/publish-card.tsx");
    expect(card).toContain('confirmLabel="Programmer"');
    expect(card).toContain("if (draft) onSchedule(draft);");
    expect(card).toMatch(/function openCalendar\(\) \{\s*if \(!canSubmit\) \{\s*onScheduleBlocked\?\.\(\);/);
    expect(card).toContain("setDraft(scheduleValue || bestSlot || firstAvailableSlot(timezone));");
    const composer = read("src/app/(dashboard)/composer/page.tsx");
    expect(composer).toMatch(/function onScheduleClick\(date: string\) \{\s*setScheduleDate\(date\);\s*setMode\("date"\);\s*void onSubmit\(\{ mode: "date", scheduleDate: date \}\);/);
    expect(composer.match(/\{\.\.\.scheduleActionProps\}/g)).toHaveLength(3);
  });
  it("calendrier réutilisable : ouvert sous n'importe quel bouton, Échap ou clic à côté le ferment", () => {
    const picker = read("src/components/ui/date-time-picker.tsx");
    expect(picker).toContain("export function DateTimePopover(");
    expect(picker).toContain('if (e.key === "Escape") onClose();');
    expect(read("src/components/ui/button.tsx")).toContain("export const Button = forwardRef<HTMLButtonElement");
  });
});
