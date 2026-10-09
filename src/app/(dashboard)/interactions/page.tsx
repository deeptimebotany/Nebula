"use client";

// Interactions (09/10/2026, demande de Lucas) : les anciennes pages
// Commentaires (/comments, le TEXTE reçu, à lire et à qui répondre) et
// Engagements (/engagements, les CHIFFRES : likes, partages, vues…) réunies
// en une seule entrée du menu, avec deux onglets :
//   - /interactions                 → Commentaires (?connectionId=, ?post=) ;
//   - /interactions?vue=engagement  → Engagement (?connectionId=).
// Les anciennes adresses redirigent ici (liens déjà partagés, notifications).
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CommentsView } from "@/components/interactions/comments-view";
import { EngagementsView } from "@/components/interactions/engagements-view";
import { InteractionsTabs } from "@/components/interactions/interactions-tabs";
import { useOptionalAiAssistant } from "@/components/dashboard/ai-assistant-context";

function InteractionsInner() {
  const view = useSearchParams().get("vue") === "engagement" ? "engagement" : "comments";
  // Assistant : l'onglet Engagement garde son propre contexte (chiffres par
  // publication) ; Commentaires est le contexte de l'adresse (assistant-contexts.ts).
  const assistant = useOptionalAiAssistant();
  const setOverride = assistant?.setContextOverride;
  useEffect(() => {
    setOverride?.(view === "engagement" ? "engagements" : null);
  }, [view, setOverride]);

  const tabs = <InteractionsTabs current={view} />;
  return view === "engagement" ? <EngagementsView tabs={tabs} /> : <CommentsView tabs={tabs} />;
}

export default function InteractionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InteractionsInner />
    </Suspense>
  );
}
