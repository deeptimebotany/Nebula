"use client";

// Écran d'erreur de l'application connectée : remplace l'écran technique par
// défaut de Next.js par un message lisible, avec « Réessayer » (qui relance
// le rendu de la page) et un retour à la vue d'ensemble. L'erreur reste
// consignée dans la console du navigateur pour le diagnostic.
import { useEffect } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconAlert, IconRefresh } from "@/components/dashboard/icons";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-10">
      <GlassCard hover={false} className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
          <IconAlert className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-semibold text-white">Cette page n&apos;a pas pu s&apos;afficher</h1>
        <p className="mt-2 text-sm text-slate-400">
          Une erreur inattendue s&apos;est produite. Réessayez : si le problème persiste, revenez à la vue d&apos;ensemble et
          écrivez-nous depuis la page Contact en indiquant ce que vous faisiez.
        </p>
        {error.digest && <p className="mt-2 font-mono text-[11px] text-slate-600">Référence : {error.digest}</p>}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={reset} className="inline-flex items-center justify-center gap-2">
            <IconRefresh className="h-4 w-4" /> Réessayer
          </Button>
          <ButtonLink href="/dashboard" variant="outline">
            Vue d&apos;ensemble
          </ButtonLink>
        </div>
      </GlassCard>
    </div>
  );
}
