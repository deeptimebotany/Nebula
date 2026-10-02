"use client";

// Renvoi du lien de confirmation de l'adresse, partagé par le bandeau, la
// fenêtre d'offre et les outils (01/10/2026).
//
// Avant : le bouton « Renvoyer » restait cliquable, on pouvait envoyer cinq
// e-mails d'affilée, et chacun annulait le lien du précédent. Maintenant :
//  - après un envoi, le bouton est bloqué avec un décompte (une minute,
//    délai imposé aussi par le serveur, qui renvoie la date du prochain envoi
//    possible) ;
//  - pendant l'attente, `poll` interroge le serveur toutes les 10 s : un clic
//    sur le lien depuis un autre onglet ou le téléphone est vu tout de suite.
import { useCallback, useEffect, useRef, useState } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";
import { EMAIL_VERIFY_RESEND_COOLDOWN_MS as COOLDOWN } from "@/lib/email-verify-config";

export const VERIFY_POLL_MS = 10_000;
/** Au-delà, on arrête d'interroger le serveur (la personne a laissé l'onglet ouvert). */
const POLL_MAX_MS = 30 * 60_000;

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** « 42 s » ou « 3 min ». */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.ceil(seconds / 60)} min`;
}

export function useVerifyResend(options: { poll?: boolean; onVerified?: () => void } = {}) {
  const { data, patch, refresh } = useBootstrap();
  const [sentAt, setSentAt] = useState<number | null>(() => parse(data?.user?.verifyEmailSentAt));
  const [nextAt, setNextAt] = useState<number | null>(() => {
    const s = parse(data?.user?.verifyEmailSentAt);
    // Horloge du serveur un peu en avance : jamais plus d'une minute d'attente.
    return s ? Math.min(s + COOLDOWN, Date.now() + COOLDOWN) : null;
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  // Heure lue seulement après l'affichage : le rendu serveur et le premier
  // rendu du navigateur restent identiques (sinon erreur d'hydratation).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  // Données du compte arrivées après le premier rendu (ou mises à jour par un
  // autre bouton « Renvoyer ») : on reprend la date d'envoi la plus récente.
  const bootSent = parse(data?.user?.verifyEmailSentAt);
  useEffect(() => {
    if (bootSent && (!sentAt || bootSent > sentAt)) {
      setSentAt(bootSent);
      setNextAt((prev) => Math.max(prev ?? 0, Math.min(bootSent + COOLDOWN, Date.now() + COOLDOWN)));
    }
  }, [bootSent, sentAt]);

  const secondsLeft = nextAt && now !== null ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : 0;

  // Décompte : un tic par seconde seulement pendant l'attente.
  useEffect(() => {
    if (!nextAt || nextAt <= Date.now()) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= nextAt) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [nextAt]);

  const onVerifiedRef = useRef(options.onVerified);
  onVerifiedRef.current = options.onVerified;
  const markVerified = useCallback(() => {
    setVerified(true);
    void refresh();
    onVerifiedRef.current?.();
  }, [refresh]);

  // Attente de la confirmation : le lien a été envoyé, on regarde s'il a été ouvert.
  useEffect(() => {
    if (!options.poll || verified || !sentAt) return;
    const check = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (Date.now() - (sentAt ?? 0) > POLL_MAX_MS) return;
      const res = await fetch("/api/auth/verify-email/status", { cache: "no-store" }).catch(() => null);
      const d = (await res?.json().catch(() => null)) as { verified?: boolean } | null;
      if (d?.verified) markVerified();
    };
    const id = window.setInterval(check, VERIFY_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [options.poll, verified, sentAt, markVerified]);

  const resend = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (sending || (nextAt && nextAt > Date.now())) return { ok: false };
    setSending(true);
    setError(null);
    const res = await fetch("/api/auth/verify-email/resend", { method: "POST" }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { alreadyVerified?: boolean; sentAt?: string | null; nextResendAt?: string; error?: string } | null;
    setSending(false);
    setNow(Date.now());
    if (res?.ok && d?.alreadyVerified) {
      markVerified();
      return { ok: true };
    }
    const next = parse(d?.nextResendAt);
    if (next) setNextAt(next);
    const sent = parse(d?.sentAt);
    if (sent) {
      setSentAt(sent);
      if (data?.user) patch({ user: { ...data.user, verifyEmailSentAt: d?.sentAt ?? null } });
    }
    if (!res?.ok) {
      const message = d?.error ?? "Envoi impossible pour le moment. Réessayez dans quelques minutes.";
      setError(message);
      return { ok: false, error: message };
    }
    return { ok: true };
  }, [sending, nextAt, markVerified, data?.user, patch]);

  return {
    /** Un lien a déjà été envoyé (à l'inscription ou par un renvoi). */
    sent: Boolean(sentAt),
    sending,
    error,
    verified,
    /** Secondes avant de pouvoir renvoyer (0 : possible maintenant). */
    secondsLeft,
    canResend: now !== null && !sending && secondsLeft === 0,
    resend
  };
}
