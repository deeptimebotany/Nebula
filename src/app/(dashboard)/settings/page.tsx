"use client";

// /settings (10/10/2026) : les Paramètres ne sont plus une page mais une
// fenêtre au milieu de l'écran (components/settings/settings-dialog.tsx).
// Cette adresse reste valable (e-mails, favoris, anciens liens) : elle ouvre
// la fenêtre, sur l'onglet de l'ancre (#apparence, #notifications, #compte…),
// par-dessus la vue d'ensemble. Dans l'application, les liens « /settings »
// ouvrent la fenêtre sur place sans passer par ici (settings-host.tsx).
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { openSettings, settingsTabFromHash } from "@/components/settings/settings-events";

export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => {
    openSettings(settingsTabFromHash(window.location.hash));
    router.replace("/dashboard");
  }, [router]);
  return null;
}
