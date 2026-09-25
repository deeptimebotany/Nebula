"use client";

// Bandeau « Confirmez votre adresse e-mail » (audit sécurité, lot 1) :
// visible tant que l'adresse d'un compte créé par mot de passe n'est pas
// confirmée, avec un bouton pour renvoyer le lien. Affiche aussi le résultat
// du clic sur le lien (/dashboard?email=confirme, lien-expire…).
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useToast } from "@/components/dashboard/toast";

const RESULTS: Record<string, { ok: boolean; message: string }> = {
  confirme: { ok: true, message: "Adresse e-mail confirmée. Merci !" },
  "lien-expire": { ok: false, message: "Ce lien de confirmation a expiré : renvoyez-en un depuis le bandeau." },
  "lien-invalide": { ok: false, message: "Ce lien de confirmation n'est plus valable (déjà utilisé ou remplacé par un plus récent)." },
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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const unverified = data?.user && data.user.emailVerified === false;

  async function resend() {
    setSending(true);
    const res = await fetch("/api/auth/verify-email/resend", { method: "POST" }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    if (res?.ok) {
      if (json.alreadyVerified) {
        void refresh();
        return;
      }
      setSent(true);
      toast.success("Lien envoyé : vérifiez votre boîte de réception (et les spams).");
    } else {
      toast.error(json.error ?? "Envoi impossible pour le moment.");
    }
  }

  return (
    <>
      <Suspense fallback={null}>
        <VerifyResult onConfirmed={() => void refresh()} />
      </Suspense>
      {unverified && (
        <div
          role="status"
          className="nb-verify-banner fixed bottom-4 left-1/2 z-[69] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-aurora-300/40 bg-[#140c24]/95 py-1.5 pl-3 pr-1.5 text-xs text-slate-100 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur lg:left-[calc(50%+7rem)]"
        >
          <span aria-hidden="true">✉️</span>
          <span className="truncate">
            {sent ? "Lien envoyé à " : "Confirmez votre adresse "}
            <strong className="font-semibold">{data?.user.email}</strong>
          </span>
          <button
            type="button"
            onClick={resend}
            disabled={sending}
            className="shrink-0 rounded-full bg-aurora-400 px-3 py-1 font-semibold text-white transition hover:bg-aurora-300 disabled:opacity-60"
          >
            {sending ? "Envoi…" : sent ? "Renvoyer" : "Renvoyer le lien"}
          </button>
        </div>
      )}
    </>
  );
}
