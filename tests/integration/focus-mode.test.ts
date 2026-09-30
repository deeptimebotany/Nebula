import { beforeEach, describe, expect, it, vi } from "vitest";

// Mode focus (30/09/2026) : désactivé par défaut pour les nouveaux comptes ;
// activé, il retire les notifications « Succès » de la cloche (elles restent
// enregistrées et reviennent quand il est désactivé).
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { GET as getNotifications, PATCH as patchNotifications } from "@/app/api/notifications/route";
import { hasDatabase, resetDatabase } from "./helpers";

const get = (q = "") => getNotifications(new NextRequest(`http://localhost/api/notifications${q}`));

describe.skipIf(!hasDatabase)("Mode focus", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("nouveau compte : Mode focus désactivé (Réussites visibles dès le départ)", async () => {
    const u = await prisma.user.create({ data: { email: `focus-${Date.now()}@test.fr`, name: "Nouveau" } });
    expect(u.focusMode).toBe(false);
  });

  it("activé : pas de notifications « Succès » dans la cloche, ni dans le compteur", async () => {
    // Date de création dans le futur : aucune « Actu Nebula » ajoutée à la cloche pendant le test.
    const u = await prisma.user.create({ data: { email: `focus2-${Date.now()}@test.fr`, name: "Camille", createdAt: new Date(Date.now() + 365 * 86_400_000) } });
    session.userId = u.id;
    await notify(u.id, { kind: "achievement", title: "Rang atteint", body: "Bravo" });
    await notify(u.id, { kind: "publish_ok", title: "Publication en ligne", body: "Instagram" });

    let data = await (await get()).json();
    expect(data.unread).toBe(2);
    expect(data.items.map((n: { title: string }) => n.title).sort()).toEqual(["Publication en ligne", "Rang atteint"]);

    await prisma.user.update({ where: { id: u.id }, data: { focusMode: true } });
    data = await (await get()).json();
    expect(data.unread).toBe(1);
    expect(data.items.map((n: { title: string }) => n.title)).toEqual(["Publication en ligne"]);
    expect((await (await get("?count=1")).json()).unread).toBe(1);
    const patched = await (await patchNotifications(new NextRequest("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) }))).json();
    expect(patched.unread).toBe(0);

    // Toujours enregistrée : elle revient sans le Mode focus.
    await prisma.user.update({ where: { id: u.id }, data: { focusMode: false } });
    data = await (await get()).json();
    expect(data.items).toHaveLength(2);
  });
});
