"use client";

// Bandeau « Confirmez votre adresse e-mail » (audit sécurité, lot 1) :
// visible tant que l'adresse d'un compte créé par mot de passe n'est pas
// confirmée, avec un bouton pour renvoyer le lien. Affiche aussi le résultat
// du clic sur le lien (/dashboard?email=confirme, lien-expire…).
import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useToast } from "@/components/dashboard/toast";
import { formatWait, useVerifyResend } from "@/components/email-verify/use-verify-resend";

const RESULTS: Record<string, { ok: boolean; message: string }> = {
  confirme: { ok: true, message: "Adresse e-mail confirmée. Merci !" },
  "lien-expire": { ok: false, message: "Ce lien de confirmation a expiré : renvoyez-en un depuis le bandeau." },
  "lien-invalide": { ok: false, message: "Ce lien de confirmation n'est plus valable : ouvrez le dernier e-mail reçu, ou demandez un nouveau lien depuis le bandeau." },
  "autre-compte": { ok: false, message: "Ce lien concerne un autre compte : connectez-vous avec l'adresse à confirmer." }
};

function VerifyResult({ onConfirmed }: { onConfirmed: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const handled = useRef(false);
  const status = params.get("email");

  useEffect(() => {
    if (!status || handled.current) return;
    handled.current = true;
    const result = RESULTS[status];
    if (result) {
      if (result.ok) {
        toast.success(result.message);
        onConfirmed();
      } else {
        toast.error(result.message);
      }
    }
    const next = new URLSearchParams(params.toString());
    next.delete("email");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [status, params, pathname, router, toast, onConfirmed]);

  return null;
}

export function EmailVerifyBanner() {
  const { data, refresh } = useBootstrap();
  const toast = useToast();
  // Attente de la confirmation (01/10/2026) : bouton bloqué avec un décompte
  // après chaque envoi, et vérification toutes les 10 s du clic sur le lien.
  const verify = useVerifyResend({ poll: true, onVerified: () => toast.success("Adresse e-mail confirmée. Merci !") });
  const unverified = data?.user && data.user.emailVerified === false && !verify.verified;

  async function resend() {
    const result = await verify.resend();
    if (result.ok) toast.success("Nouveau lien envoyé : regardez votre boîte de réception (et les spams). Le lien est valable 48 h.");
    else if (result.error) toast.error(result.error);
  }

  const waiting = verify.secondsLeft > 0;
  const label = verify.sending ? "Envoi…" : waiting ? `Renvoyer (${formatWait(verify.secondsLeft)})` : verify.sent ? "Renvoyer" : "Envoyer le lien";

  return (
    <>
      <Suspense fallback={null}>
        <VerifyResult onConfirmed={() => void refresh()} />
      </Suspense>
      {unverified && (
        <div
          title={verify.sent ? "Le lien est valable 48 h. Pensez à regarder dans les courriers indésirables." : undefined}
          className="nb-verify-banner fixed bottom-[9.25rem] left-1/2 md:bottom-4 z-[69] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-aurora-300/40 bg-[#140c24]/95 py-1.5 pl-3 pr-1.5 text-xs text-slate-100 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur lg:left-[calc(50%+7rem)]"
        >
          {verify.sent ? (
            <span aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent opacity-70 motion-reduce:animate-none" />
          ) : (
            <span aria-hidden="true">✉️</span>
          )}
          {/* Annonce aux lecteurs d'écran seulement au changement d'état (jamais le décompte). */}
          <span className="sr-only" role="status">
            {verify.sent ? "Lien envoyé, en attente de confirmation de votre adresse." : ""}
          </span>
          <span className="truncate">
            {verify.sent ? "En attente de confirmation · lien envoyé à " : "Confirmez votre adresse "}
            <strong className="font-semibold">{data?.user.email}</strong>
          </span>
          <button
            type="button"
            onClick={resend}
            disabled={!verify.canResend}
            aria-label={waiting ? `Renvoyer le lien, possible dans ${formatWait(verify.secondsLeft)}` : undefined}
            className="shrink-0 rounded-full bg-aurora-400 px-3 py-1 font-semibold tabular-nums text-white transition hover:bg-aurora-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {label}
          </button>
        </div>
      )}
    </>
  );
}
