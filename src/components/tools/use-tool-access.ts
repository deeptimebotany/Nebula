"use client";

// Démo ou vraie génération ? (outils IA de /outils, 29/09/2026) — les pages
// sont pré-générées : la session est demandée au serveur depuis le
// navigateur (voir /api/public/tools/access).
import { useCallback, useEffect, useState } from "react";

export interface ToolAccessState {
  /** "loading" le temps de la réponse, puis visiteur (démo) ou compte. */
  status: "loading" | "visitor" | "member";
  plan: "FREE" | "PRO" | "AGENCY" | null;
  aiEnabled: boolean;
  remaining: { text: number; thumbnail: number } | null;
  limits: { text: number; thumbnail: number } | null;
}

const INITIAL: ToolAccessState = { status: "loading", plan: null, aiEnabled: true, remaining: null, limits: null };

export function useToolAccess() {
  const [state, setState] = useState<ToolAccessState>(INITIAL);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/public/tools/access", { cache: "no-store" });
      const d = (await res.json().catch(() => ({}))) as {
        signedIn?: boolean;
        plan?: ToolAccessState["plan"];
        aiEnabled?: boolean;
        quota?: Record<"text" | "thumbnail", { limit: number; remaining: number }>;
      };
      if (!res.ok || !d.signedIn || !d.quota) {
        setState({ ...INITIAL, status: "visitor" });
        return;
      }
      setState({
        status: "member",
        plan: d.plan ?? "FREE",
        aiEnabled: d.aiEnabled !== false,
        remaining: { text: d.quota.text.remaining, thumbnail: d.quota.thumbnail.remaining },
        limits: { text: d.quota.text.limit, thumbnail: d.quota.thumbnail.limit }
      });
    } catch {
      setState({ ...INITIAL, status: "visitor" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Après une génération : le serveur renvoie ce qu'il reste. */
  const setRemaining = useCallback((kind: "text" | "thumbnail", remaining: number) => {
    setState((s) => (s.remaining ? { ...s, remaining: { ...s.remaining, [kind]: remaining } } : s));
  }, []);

  /** Le serveur répond « compte requis » (session expirée entre-temps) : retour à la démo. */
  const becomeVisitor = useCallback(() => setState({ ...INITIAL, status: "visitor" }), []);

  return { ...state, setRemaining, becomeVisitor, refresh };
}

// Saisie gardée le temps de créer son compte : au retour sur l'outil, le
// visiteur retrouve ce qu'il avait tapé (même onglet, jamais envoyé ailleurs).
const DRAFT_PREFIX = "nebula:tool-draft:";

export function saveToolDraft(tool: string, values: Record<string, string>): void {
  try {
    sessionStorage.setItem(DRAFT_PREFIX + tool, JSON.stringify(values));
  } catch {
    /* stockage indisponible : rien de grave */
  }
}

export function takeToolDraft(tool: string): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + tool);
    if (!raw) return null;
    sessionStorage.removeItem(DRAFT_PREFIX + tool);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } catch {
    return null;
  }
}
