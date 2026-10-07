"use client";

// Tiroir « Demander à Nebula » chargé à la demande (audit performance,
// lot 4).
//
// Le tiroir (ai-assistant.tsx : conversation, suggestions, rendu Markdown)
// n'est téléchargé qu'au premier survol ou focus du bouton « Demander à
// Nebula » de l'en-tête (`prepared`), à la première ouverture (bouton de
// l'en-tête, raccourci d'une page) ou quand une page lui envoie des
// messages. Ensuite il reste monté : la conversation survit à la navigation.
//
// 06/10/2026 : le bouton flottant en bas à droite est retiré (demande de
// Lucas) : il faisait doublon avec le bouton de l'en-tête.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAiAssistant } from "./ai-assistant-context";

const AiAssistantDrawer = dynamic(() => import("./ai-assistant").then((m) => m.AiAssistant), { ssr: false });

export function AiAssistantLazy() {
  const { enabled, open, prepared, pendingPrompt, pendingInjection } = useAiAssistant();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (prepared || open || pendingPrompt || pendingInjection) setMounted(true);
  }, [prepared, open, pendingPrompt, pendingInjection]);

  if (!enabled || !mounted) return null;
  return <AiAssistantDrawer />;
}
