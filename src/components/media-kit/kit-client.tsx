"use client";

// Media kit public (produit n°10) : ce qui tourne dans le navigateur de la
// page /kit/[slug] — boutons (PDF, contact), compteur de vues, impression.
//
// Impression / PDF : le kit passe en mode clair le temps de l'impression
// (sinon, fond sombre retiré par le navigateur = texte clair sur papier
// blanc), puis revient au mode du visiteur. Aussi avec Ctrl+P.
import { useEffect } from "react";
import { IconDownload, IconSend } from "@/components/dashboard/icons";
import { buttonClasses } from "@/components/ui/button";

export function KitActions({ contactEmail }: { contactEmail: string | null }) {
  return (
    <>
      {contactEmail && (
        <a href={`mailto:${contactEmail}`} className={buttonClasses("glow")}>
          <IconSend className="h-4 w-4" />
          Contacter
        </a>
      )}
      <button type="button" onClick={() => window.print()} className={buttonClasses("outline")}>
        <IconDownload className="h-4 w-4" />
        Télécharger en PDF
      </button>
    </>
  );
}

export function KitPageEffects({ slug }: { slug: string }) {
  useEffect(() => {
    // Une ouverture comptée par onglet (le serveur compte, lui, un visiteur par jour).
    const key = `nb-kit-view:${slug}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {
      seen = false;
    }
    if (!seen) fetch(`/api/public/kit/${encodeURIComponent(slug)}/view`, { method: "POST", keepalive: true }).catch(() => undefined);

    const root = document.documentElement;
    let previous: string | undefined;
    let printing = false;
    const before = () => {
      if (printing) return; // certains navigateurs envoient l'événement deux fois
      printing = true;
      previous = root.dataset.mode;
      root.dataset.mode = "light";
    };
    const after = () => {
      if (!printing) return;
      printing = false;
      if (previous) root.dataset.mode = previous;
      else delete root.dataset.mode;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);

    // Lien « Télécharger en PDF » de l'éditeur : /kit/<slug>?imprimer=1.
    let timer: number | undefined;
    if (new URLSearchParams(window.location.search).has("imprimer")) timer = window.setTimeout(() => window.print(), 700);

    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      if (timer) window.clearTimeout(timer);
    };
  }, [slug]);
  return null;
}
