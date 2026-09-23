"use client";

// Page publique "link in bio" d'une marque (façon Linktree) — aucune
// authentification : le slug de la marque (déjà unique, voir prisma/schema)
// sert d'identifiant public, exactement comme /approve/[token] pour les
// liens d'approbation. Voir /api/public/link-in-bio/[slug] pour les données
// et /(dashboard)/link-in-bio pour l'éditeur.
//
import { findTheme } from "@/lib/themes";
import { RemoteImage } from "@/components/ui/remote-image";
import { PoweredByNebula } from "@/components/marketing/powered-by";
import type { PublicLinkPageData } from "@/lib/link-in-bio-public";

// Les données arrivent déjà rendues par le serveur (voir page.tsx) : ce
// composant ne fait plus aucun appel réseau au chargement — il ne garde de
// « client » que le suivi des clics sur les liens.
export function PublicLinkInBioClient({ slug, initialData }: { slug: string; initialData: PublicLinkPageData }) {
  const data = initialData;

  function onLinkClick(linkId: string) {
    fetch(`/api/public/link-in-bio/${slug}/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
      keepalive: true
    }).catch(() => undefined);
  }

  const theme = findTheme(data.theme);

  return (
    <div
      className="flex min-h-screen justify-center px-4 py-14"
      style={{
        background: `linear-gradient(180deg, rgb(${theme.vars["--c-nebula-900"]}), rgb(${theme.vars["--c-nebula-800"]}) 55%, rgb(${theme.vars["--c-nebula-700"]}))`
      }}
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-24 w-24 overflow-hidden rounded-full border-2 shadow-lg"
            style={{
              borderColor: `rgb(${theme.vars["--c-aurora-400"]} / 0.6)`,
              background: "rgba(255,255,255,0.08)"
            }}
          >
            {data.avatarUrl ? (
              <RemoteImage src={data.avatarUrl} className="h-full w-full" sizes="96px" priority />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white/70">
                {data.brandName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <h1 className="text-center text-lg font-semibold text-white">{data.brandName}</h1>
          {data.bio && <p className="whitespace-pre-line text-center text-sm text-white/70">{data.bio}</p>}

          <div className="mt-4 w-full space-y-3">
            {data.links.length === 0 ? (
              <p className="py-8 text-center text-sm text-white/40">Aucun lien pour l&apos;instant.</p>
            ) : (
              data.links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => onLinkClick(link.id)}
                  className="block w-full rounded-2xl px-5 py-4 text-center text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:scale-[1.02] hover:brightness-110 active:scale-[0.99]"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: `1.5px solid rgb(${theme.vars["--c-aurora-400"]} / 0.55)`
                  }}
                >
                  {link.label}
                </a>
              ))
            )}
          </div>

          <PoweredByNebula tone="light" className="pt-10" surface="bio" via={slug} />
        </div>
      </div>
    </div>
  );
}
