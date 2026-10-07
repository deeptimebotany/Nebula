"use client";

import { useEffect, useId, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: string;
          language?: string;
          appearance?: "always" | "execute" | "interaction-only";
          size?: "normal" | "flexible" | "compact";
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Vrai quand la protection anti-robot est active (clé publique configurée). */
export const TURNSTILE_ENABLED = Boolean(SITE_KEY);

/**
 * Message affiché quand on envoie un formulaire avant la fin de la
 * vérification. La case est le plus souvent invisible (voir plus bas) : on ne
 * demande de la cocher que si elle est apparue.
 */
export const TURNSTILE_PENDING_MESSAGE =
  "Vérification anti-robot en cours : réessayez dans un instant. Si une case « Vérifiez que vous êtes humain » est apparue juste au-dessus du bouton, cochez-la.";

/**
 * Widget anti-robot Cloudflare Turnstile. Ne s'affiche que si
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY est configuré (voir src/lib/turnstile.ts) —
 * tant que ce n'est pas fait, ce composant ne rend rien, pour ne jamais
 * bloquer un formulaire avant que la protection ne soit en place.
 *
 * Discret (06/10/2026, demande de Lucas) : `appearance: "interaction-only"`.
 * Cloudflare vérifie en arrière-plan et la case (avec son logo) n'apparaît
 * que s'il a un doute et demande un clic. Elle prend alors toute la largeur
 * du formulaire (`size: "flexible"`, 300 px au moins). Le logo Cloudflare ne
 * peut pas être retiré (offre Enterprise payante) ni remplacé par celui d'un
 * autre service.
 *
 * Un jeton ne sert qu'UNE fois (Cloudflare refuse le même jeton deux fois) :
 * après chaque envoi au serveur, le formulaire change `resetKey`, ce qui
 * relance la vérification et efface l'ancien jeton (29/09/2026 — avant, un
 * second essai après une erreur échouait toujours sur « Vérification
 * anti-robot échouée »).
 */
export function TurnstileWidget({ onVerify, resetKey = 0 }: { onVerify: (token: string | null) => void; resetKey?: number }) {
  const elementId = `turnstile-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const widgetIdRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  function renderWidget() {
    if (!SITE_KEY || readyRef.current) return;
    const el = document.getElementById(elementId);
    if (!el || !window.turnstile) return;
    readyRef.current = true;
    widgetIdRef.current = window.turnstile.render(el, {
      sitekey: SITE_KEY,
      // Suit le mode clair/sombre de la page (clair par défaut, 29/09/2026).
      theme: document.documentElement.dataset.mode === "dark" ? "dark" : "light",
      language: "fr",
      appearance: "interaction-only",
      size: "flexible",
      callback: (token) => onVerifyRef.current(token),
      "expired-callback": () => onVerifyRef.current(null),
      "error-callback": () => onVerifyRef.current(null)
    });
  }

  useEffect(() => {
    if (window.turnstile) renderWidget();
    // sinon, le callback onLoad du <Script> ci-dessous appellera renderWidget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nouveau jeton après chaque envoi (voir plus haut).
  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    onVerifyRef.current(null);
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* widget déjà retiré */
      }
    }
  }, [resetKey]);

  if (!SITE_KEY) return null;

  return (
    <div>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={renderWidget} />
      <div id={elementId} />
    </div>
  );
}
