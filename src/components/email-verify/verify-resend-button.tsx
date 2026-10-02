"use client";

// Bouton « Renvoyer le lien » de la fenêtre d'offre et des outils
// (01/10/2026) : même règle que le bandeau, bloqué avec un décompte après
// chaque envoi (voir useVerifyResend).
import { formatWait, useVerifyResend } from "@/components/email-verify/use-verify-resend";
import { clsx } from "@/lib/clsx";

export function VerifyResendButton({
  email,
  afterSend,
  onVerified,
  size = "md"
}: {
  email?: string | null;
  /** Ce qu'il faut faire une fois le lien ouvert (« relancez la génération »). */
  afterSend: string;
  onVerified?: () => void;
  size?: "sm" | "md";
}) {
  const verify = useVerifyResend({ onVerified });
  // Un lien est parti (à l'inscription ou par ce bouton) et pas d'erreur depuis.
  const justSent = verify.sent && !verify.error;
  const waiting = verify.secondsLeft > 0;
  const label = verify.sending ? "Envoi…" : waiting ? `Renvoyer (${formatWait(verify.secondsLeft)})` : verify.sent ? "Renvoyer le lien" : "Envoyer le lien";

  return (
    <>
      <button
        type="button"
        onClick={() => void verify.resend()}
        disabled={!verify.canResend}
        aria-label={waiting ? `Renvoyer le lien, possible dans ${formatWait(verify.secondsLeft)}` : undefined}
        className={clsx(
          "tabular-nums disabled:cursor-not-allowed disabled:opacity-60",
          size === "md"
            ? "btn-glow inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white"
            : "rounded-lg border border-white/15 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/5"
        )}
      >
        {label}
      </button>
      {/* Annoncé au changement d'état seulement (jamais le décompte). */}
      <span className={clsx(size === "md" ? "w-full text-xs text-slate-400" : "text-xs")} role="status">
        {verify.error
          ? verify.error
          : justSent
            ? `Lien envoyé à ${email ?? "votre adresse"} (valable 48 h, pensez aux spams) : ouvrez-le, puis ${afterSend}`
            : ""}
      </span>
    </>
  );
}
