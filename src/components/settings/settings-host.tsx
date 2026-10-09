"use client";

// Coquille de la fenêtre Paramètres (10/10/2026) : montée une fois dans la
// mise en page de l'application, elle écoute openSettings() et télécharge la
// fenêtre à la première ouverture seulement (comme le panneau « Mon profil »).
// Les liens « /settings » de l'application (notifications, Réussites,
// journal…) ouvrent la fenêtre sur place, sans changer de page ; l'adresse
// /settings tapée ou venue d'un e-mail l'ouvre par-dessus la vue d'ensemble
// (voir app/(dashboard)/settings/page.tsx).
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SETTINGS_OPEN_EVENT, settingsTabFromHash, takePendingSettings, type SettingsTab } from "./settings-events";

const SettingsDialog = dynamic(() => import("./settings-dialog").then((m) => m.SettingsDialog), { ssr: false });

export function SettingsHost() {
  const [state, setState] = useState<{ open: boolean; tab: SettingsTab }>({ open: false, tab: "marque" });
  const show = useCallback((tab?: SettingsTab | null) => setState({ open: true, tab: tab ?? "marque" }), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  useEffect(() => {
    const pending = takePendingSettings();
    if (pending !== undefined) show(pending);
    function onOpen(e: Event) {
      takePendingSettings();
      show((e as CustomEvent<SettingsTab | undefined>).detail);
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== "/settings") return;
      // Capture : passe avant le <Link> de Next, qui ne navigue plus (defaultPrevented).
      e.preventDefault();
      show(settingsTabFromHash(url.hash));
    }
    window.addEventListener(SETTINGS_OPEN_EVENT, onOpen);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(SETTINGS_OPEN_EVENT, onOpen);
      document.removeEventListener("click", onClick, true);
    };
  }, [show]);

  // Un lien de la fenêtre mène à une autre page (Facturation, Réussites…) :
  // elle se ferme. Sauf en quittant /settings, qui vient justement de l'ouvrir.
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  useEffect(() => {
    const prev = prevPath.current;
    prevPath.current = pathname;
    if (prev !== pathname && prev !== "/settings") close();
  }, [pathname, close]);

  if (!state.open) return null;
  return <SettingsDialog tab={state.tab} onTabChange={(tab) => setState({ open: true, tab })} onClose={close} />;
}
