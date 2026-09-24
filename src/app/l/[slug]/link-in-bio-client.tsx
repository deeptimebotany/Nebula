"use client";

// Page publique "link in bio" d'une marque (façon Linktree) — aucune
// authentification : le slug de la marque (déjà unique, voir prisma/schema)
// sert d'identifiant public, exactement comme /approve/[token] pour les
// liens d'approbation. Voir /api/public/link-in-bio/[slug] pour les données
// et /(dashboard)/link-in-bio pour l'éditeur.
//
import { findTheme } from "@/lib/themes";
import { clsx } from "@/lib/clsx";
import { ParticleCanvas, particleVariantForTheme } from "@/components/theme-particles";
import { RemoteImage } from "@/components/ui/remote-image";
import { PoweredByNebula } from "@/components/marketing/powered-by";
import type { PublicLinkPageData } from "@/lib/link-in-bio-public";
import { BIO_CARD_SIZES, resolveBioFrame } from "@/lib/bio-frames";
import { BioFrame, BioAvatarFrame } from "@/components/link-in-bio/bio-frame";

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
  // Cadre animé (voir src/lib/bio-frames.ts) : quand il y en a un, le
  // contenu passe dans une carte encadrée ; sinon, rendu d'origine.
  const frame = resolveBioFrame(data.theme, data.frame);
  const particles = particleVariantForTheme(theme.key);
  // Taille de la carte selon le statut (voir BIO_CARD_SIZES) : Pro un peu
  // plus grande, Agence encore plus, « Le million » la plus grande.
  const size = BIO_CARD_SIZES[data.cardSize ?? "base"];
  const legend = data.cardSize === "legend";

  return (
    <div
      className="relative isolate flex min-h-screen justify-center px-4 py-14"
      style={{
        background: `linear-gradient(180deg, rgb(${theme.vars["--c-nebula-900"]}), rgb(${theme.vars["--c-nebula-800"]}) 55%, rgb(${theme.vars["--c-nebula-700"]}))`
      }}
    >
      {particles && <ParticleCanvas variant={particles} className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: -1 }} />}
      <div className="w-full" style={{ maxWidth: size.maxWidth }}>
        <BioFrame
          frame={frame}
          radius={frame ? 32 : 0}
          cardClassName={frame ? "flex flex-col items-center gap-4 border border-white/10 px-5 py-8 shadow-2xl sm:px-8" : "flex flex-col items-center gap-4"}
          cardStyle={frame ? { background: `linear-gradient(180deg, rgb(${theme.vars["--c-nebula-800"]}), rgb(${theme.vars["--c-nebula-900"]}))` } : undefined}
        >
          <BioAvatarFrame frame={frame}>
          <div
            className="overflow-hidden rounded-full border-2 shadow-lg"
            style={{
              width: size.avatar,
              height: size.avatar,
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
          </BioAvatarFrame>

          <h1 className={clsx("text-center font-semibold text-white", legend ? "text-2xl" : data.cardSize === "agency" ? "text-xl" : "text-lg")}>{data.brandName}</h1>
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
                  className="bf-link block w-full rounded-2xl px-5 py-4 text-center text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:scale-[1.02] hover:brightness-110 active:scale-[0.99]"
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
        </BioFrame>

        <div className="flex justify-center">
          <PoweredByNebula tone="light" className="pt-10" surface="bio" via={slug} />
        </div>
      </div>
    </div>
  );
}
