// Brouillon du Composer côté navigateur (29/09/2026) : lecture au montage
// (compte + copie locale, la plus récente gagne), enregistrement regroupé
// (1,2 s après la dernière frappe) dans le compte, copie locale immédiate.
import { COMPOSER_DRAFT_KEY_PREFIX, normalizeComposerDraft, type ComposerDraftData } from "@/lib/composer-draft";

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const latest = new Map<string, ComposerDraftData | null>();

function readLocal(brandId: string): ComposerDraftData | null {
  try {
    const raw = localStorage.getItem(COMPOSER_DRAFT_KEY_PREFIX + brandId);
    if (!raw) return null;
    return normalizeComposerDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(brandId: string, draft: ComposerDraftData | null): void {
  try {
    if (draft) localStorage.setItem(COMPOSER_DRAFT_KEY_PREFIX + brandId, JSON.stringify(draft));
    else localStorage.removeItem(COMPOSER_DRAFT_KEY_PREFIX + brandId);
  } catch {
    /* stockage indisponible : le compte garde le brouillon */
  }
}

async function send(brandId: string, draft: ComposerDraftData | null): Promise<void> {
  try {
    if (draft) {
      await fetch("/api/composer/draft", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, draft }), keepalive: true });
    } else {
      await fetch(`/api/composer/draft?brandId=${encodeURIComponent(brandId)}`, { method: "DELETE", keepalive: true });
    }
  } catch {
    /* hors ligne : la copie locale reste, elle repartira au prochain enregistrement */
  }
}

/** Brouillon à restaurer : le plus récent entre le compte et ce navigateur. */
export async function loadComposerDraft(brandId: string): Promise<ComposerDraftData | null> {
  const local = readLocal(brandId);
  let remote: ComposerDraftData | null = null;
  try {
    const res = await fetch(`/api/composer/draft?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
    const d = res.ok ? ((await res.json()) as { draft?: unknown }) : null;
    remote = d?.draft ? normalizeComposerDraft(d.draft) : null;
  } catch {
    remote = null;
  }
  const best = !remote ? local : !local ? remote : local.savedAt > remote.savedAt ? local : remote;
  // Brouillon encore seulement dans ce navigateur (ancienne version) : envoyé au compte.
  if (best && best === local && (!remote || local.savedAt > remote.savedAt)) void send(brandId, best);
  if (best) writeLocal(brandId, best);
  return best && (best.title || best.caption) ? best : null;
}

/** Enregistre (ou efface avec null) : copie locale tout de suite, compte 1,2 s plus tard. */
export function saveComposerDraft(brandId: string, draft: Omit<ComposerDraftData, "savedAt"> | null): void {
  const value = draft && (draft.title || draft.caption) ? { ...draft, savedAt: Date.now() } : null;
  writeLocal(brandId, value);
  latest.set(brandId, value);
  const t = timers.get(brandId);
  if (t) clearTimeout(t);
  timers.set(
    brandId,
    setTimeout(() => {
      timers.delete(brandId);
      void send(brandId, latest.get(brandId) ?? null);
    }, 1200)
  );
}

/** Enregistre tout de suite (avant de quitter la page). */
export async function saveComposerDraftNow(brandId: string, draft: Omit<ComposerDraftData, "savedAt"> | null): Promise<void> {
  const t = timers.get(brandId);
  if (t) clearTimeout(t);
  timers.delete(brandId);
  const value = draft && (draft.title || draft.caption) ? { ...draft, savedAt: Date.now() } : null;
  writeLocal(brandId, value);
  latest.set(brandId, value);
  await send(brandId, value);
}
