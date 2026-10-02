"use client";

// Message d'erreur des outils de /outils (dans la page, jamais un toast).
// Lot E2 (brief « Essai 14 jours ») : l'IA de l'essai et du Gratuit demande
// une adresse confirmée — la raison `email_unverified` ajoute le bouton
// « Renvoyer le lien », comme le bandeau de l'application.
import { VerifyResendButton } from "@/components/email-verify/verify-resend-button";

export function ToolError({ message, reason }: { message: string | null; reason?: string | null }) {
  if (!message) return null;
  return (
    <div className="mt-3 text-sm text-red-300" role="alert">
      <p>{message}</p>
      {reason === "email_unverified" && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-slate-300">
          <VerifyResendButton size="sm" afterSend="relancez la génération." />
        </p>
      )}
    </div>
  );
}
