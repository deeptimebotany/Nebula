"use client";

// Rappel du badge Explorateur (Réussites v2, lot C), chargé seulement quand
// il a quelque chose à dire : cookie « outils essayés » déjà présent, ou un
// premier outil essayé sur la page. Les pages d'outils sont des pages
// d'acquisition : ni rendu serveur, ni code du rappel chargé d'emblée.
import { useEffect, useState, type ComponentType } from "react";
import { TOOLS_COOKIE, TOOLS_EXPLORED_EVENT } from "@/lib/tools-explored";

export function ExplorerHint() {
  const [Body, setBody] = useState<ComponentType | null>(null);

  useEffect(() => {
    let requested = false;
    const load = () => {
      if (requested) return;
      requested = true;
      import("./explorer-hint-body")
        .then((m) => setBody(() => m.default))
        .catch(() => {
          requested = false; // réseau coupé : on réessaiera au prochain outil
        });
    };
    if (document.cookie.split("; ").some((c) => c.startsWith(`${TOOLS_COOKIE}=`))) load();
    window.addEventListener(TOOLS_EXPLORED_EVENT, load);
    return () => window.removeEventListener(TOOLS_EXPLORED_EVENT, load);
  }, []);

  return Body ? <Body /> : null;
}
