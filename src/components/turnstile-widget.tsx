"use client";

import { useEffect, useId, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void; theme?: string }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Widget anti-robot Cloudflare Turnstile. Ne s'affiche que si
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY est configuré (voir src/lib/turnstile.ts) —
 * tant que ce n'est pas fait, ce composant ne rend rien, pour ne jamais
 * bloquer un formulaire avant que la protection ne soit en place.
 */
export function TurnstileWidget({ onVerify }: { onVerify: (token: string | null) => void }) {
  const elementId = `turnstile-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const widgetIdRef = useRef<string | null>(null);
  const readyRef = useRef(false);

  function renderWidget() {
    if (!SITE_KEY || readyRef.current) return;
    const el = document.getElementById(elementId);
    if (!el || !window.turnstile) return;
    readyRef.current = true;
    widgetIdRef.current = window.turnstile.render(el, {
      sitekey: SITE_KEY,
      theme: "dark",
      callback: (token) => onVerify(token),
      "expired-callback": () => onVerify(null)
    });
  }

  useEffect(() => {
    if (window.turnstile) renderWidget();
    // sinon, le callback onLoad du <Script> ci-dessous appellera renderWidget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;

  return (
    <div>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div id={elementId} />
    </div>
  );
}
