// Easter egg #28 « Statue » (lot U6) : minuteries simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATUE_THRESHOLD_MS, watchStatue, type StatueEnv } from "@/lib/easter-eggs/statue";

function makeEnv(opts: { coarse?: boolean } = {}) {
  const win = new EventTarget() as EventTarget & { matchMedia: (q: string) => { matches: boolean } };
  win.matchMedia = (q: string) => ({ matches: Boolean(opts.coarse) && q.includes("coarse") });
  const doc = new EventTarget() as EventTarget & { visibilityState: string; hasFocus(): boolean; focused: boolean };
  doc.visibilityState = "visible";
  doc.focused = true;
  doc.hasFocus = () => doc.focused;
  const env: StatueEnv = {
    win: win as unknown as StatueEnv["win"],
    doc: doc as unknown as StatueEnv["doc"],
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>)
  };
  const move = () => win.dispatchEvent(new Event("mousemove"));
  const hide = () => {
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  const blur = () => {
    doc.focused = false;
    win.dispatchEvent(new Event("blur"));
  };
  const leave = () => {
    const e = new Event("mouseout") as Event & { relatedTarget: null };
    Object.defineProperty(e, "relatedTarget", { value: null });
    doc.dispatchEvent(e);
  };
  const key = () => win.dispatchEvent(new Event("keydown"));
  return { env, move, hide, blur, leave, key, doc };
}

describe("Easter egg « Statue » (lot U6)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("60 s visibles, fenêtre active, curseur dans la page : déclenché une seule fois", () => {
    const t = makeEnv();
    const fire = vi.fn();
    watchStatue(fire, { env: t.env });
    t.move();
    vi.advanceTimersByTime(STATUE_THRESHOLD_MS - 1000);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(fire).toHaveBeenCalledTimes(1);
    t.move();
    vi.advanceTimersByTime(3 * STATUE_THRESHOLD_MS);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("ne démarre pas sans premier mouvement de souris (position inconnue)", () => {
    const t = makeEnv();
    const fire = vi.fn();
    watchStatue(fire, { env: t.env });
    vi.advanceTimersByTime(5 * STATUE_THRESHOLD_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it("onglet caché à 30 s : rien, même longtemps après", () => {
    const t = makeEnv();
    const fire = vi.fn();
    watchStatue(fire, { env: t.env });
    t.move();
    vi.advanceTimersByTime(30_000);
    t.hide();
    vi.advanceTimersByTime(10 * STATUE_THRESHOLD_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it("fenêtre inactive (autre application) : rien", () => {
    const t = makeEnv();
    const fire = vi.fn();
    watchStatue(fire, { env: t.env });
    t.move();
    vi.advanceTimersByTime(10_000);
    t.blur();
    vi.advanceTimersByTime(10 * STATUE_THRESHOLD_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it("curseur sorti de la fenêtre (deuxième écran, fenêtre toujours active) : rien", () => {
    const t = makeEnv();
    const fire = vi.fn();
    watchStatue(fire, { env: t.env });
    t.move();
    vi.advanceTimersByTime(10_000);
    t.leave();
    vi.advanceTimersByTime(10 * STATUE_THRESHOLD_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it("toute activité remet le compteur à zéro", () => {
    const t = makeEnv();
    const fire = vi.fn();
    watchStatue(fire, { env: t.env });
    t.move();
    vi.advanceTimersByTime(50_000);
    t.key();
    vi.advanceTimersByTime(50_000);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(11_000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("la minuterie ne fait pas foi : l'écart d'horodatage est vérifié avant de déclencher", () => {
    const t = makeEnv();
    const fire = vi.fn();
    watchStatue(fire, { env: t.env });
    t.move();
    // La minuterie arrive à échéance alors que seules 40 s réelles se sont
    // écoulées (horloge décalée) : rien, elle se replanifie.
    vi.setSystemTime(Date.now() - 20_000);
    vi.advanceTimersByTime(STATUE_THRESHOLD_MS);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("écran tactile (pointer: coarse) : désactivé", () => {
    const t = makeEnv({ coarse: true });
    const fire = vi.fn();
    watchStatue(fire, { env: t.env });
    t.move();
    vi.advanceTimersByTime(10 * STATUE_THRESHOLD_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it("arrêt : plus aucune minuterie ni écouteur", () => {
    const t = makeEnv();
    const fire = vi.fn();
    const stop = watchStatue(fire, { env: t.env });
    t.move();
    stop();
    vi.advanceTimersByTime(10 * STATUE_THRESHOLD_MS);
    expect(fire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
