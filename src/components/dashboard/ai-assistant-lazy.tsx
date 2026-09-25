"use client";

// Bouton flottant « Demander à Nebula » + tiroir chargé à la demande
// (audit performance, lot 4).
//
// Le tiroir (ai-assistant.tsx : conversation, suggestions, rendu Markdown)
// n'est téléchargé qu'au premier survol du bouton, à la première ouverture
// (bouton de l'en-tête, raccourci d'une page) ou quand une page lui envoie
// des messages. Ensuite il reste monté : la conversation survit à la
// navigation comme avant.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useAiAssistant } from "./ai-assistant-context";
import { NebulaIcon } from "./nebula-brandmark";

const AiAssistantDrawer = dynamic(() => import("./ai-assistant").then((m) => m.AiAssistant), { ssr: false });

export function AiAssistantLazy() {
  const { enabled, open, setOpen, pendingPrompt, pendingInjection } = useAiAssistant();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open || pendingPrompt || pendingInjection) setMounted(true);
  }, [open, pendingPrompt, pendingInjection]);

  if (!enabled) return null;

  // Survol ou focus clavier du bouton : on commence à télécharger le tiroir
  // (monté fermé), pour que l'ouverture qui suit garde son animation.
  const prepare = () => setMounted(true);

  return (
    <>
      {mounted && <AiAssistantDrawer />}
      {/* Bouton flottant — masqué quand le tiroir est ouvert */}
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        onPointerEnter={prepare}
        onFocus={prepare}
        className={clsx(
          "nebula-chat-launcher fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white lg:bottom-6 lg:right-6",
          // Page avec barre d'action collante (Publier) : au-dessus d'elle.
          "[.nebula-action-bar_&]:bottom-[9.75rem] lg:[.nebula-action-bar_&]:bottom-28",
          open && "pointer-events-none opacity-0"
        )}
        aria-label="Demander à Nebula"
        title="Demander à Nebula"
        tabIndex={open ? -1 : 0}
      >
        <NebulaIcon size={30} tone="onDark" />
      </button>
    </>
  );
}
