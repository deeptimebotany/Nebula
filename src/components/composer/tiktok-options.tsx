"use client";

// Section TikTok de Publier (30/09/2026) : règles « Direct Post » de TikTok
// (voir src/lib/social/tiktok-direct-post.ts pour la liste complète).
//   - À l'ouverture : creator_info (pseudo, avatar du compte qui publiera,
//     confidentialités possibles, interactions coupées, durée maximale).
//   - Confidentialité SANS valeur par défaut ; Commentaires, Duo, Collage
//     éteints par défaut et grisés si le créateur les a coupés.
//   - Déclaration de contenu commercial éteinte par défaut, « Votre marque »
//     et « Contenu de marque » ; phrase de consentement avec les liens de
//     TikTok. Tant qu'un choix manque, le bouton Publier reste désactivé
//     (la raison remonte à Publier par onStatus).
import { useEffect, useMemo, useState } from "react";
import { Toggle } from "@/components/ui/toggle";
import { clsx } from "@/lib/clsx";
import {
  BRANDED_CONTENT_NOT_PRIVATE,
  COMMERCIAL_CHOICE_REQUIRED,
  brandedContentDisabledReason,
  privacyOptionDisabledReason,
  tiktokBlockingReason,
  tiktokConsentParts,
  tiktokLabelNotice,
  tiktokPrivacyLabel,
  type TiktokCreatorInfo,
  type TiktokPostOptions
} from "@/lib/social/tiktok-direct-post";

export interface TiktokSectionStatus {
  /** Ce qui bloque l'envoi, ou null si tout est prêt. */
  reason: string | null;
  creator: TiktokCreatorInfo | null;
}

type Load = { state: "loading" } | { state: "ready"; creator: TiktokCreatorInfo } | { state: "error"; message: string };

// Réponses gardées le temps de la page : la section se rouvre sans nouvel
// appel (TikTok limite creator_info ; Nebula s'en tient à 6 par minute).
const cache = new Map<string, TiktokCreatorInfo>();

/** Réponse creator_info déjà connue (tests, ou préchargement). */
export function primeTiktokCreatorCache(connectionId: string, creator: TiktokCreatorInfo): void {
  cache.set(connectionId, creator);
}

/** Phrase de consentement de TikTok, avec ses liens officiels. */
export function TiktokConsent({ options, className }: { options: Pick<TiktokPostOptions, "commercial" | "brandedContent">; className?: string }) {
  return (
    <p className={clsx("text-[11px] leading-snug text-slate-400", className)}>
      {tiktokConsentParts(options).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="text-aurora-300 underline underline-offset-2 hover:text-white">
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  );
}

export function TiktokOptions({
  connectionId,
  value,
  onChange,
  video,
  onStatus,
  onPreview
}: {
  connectionId: string | undefined;
  value: TiktokPostOptions;
  onChange: (next: TiktokPostOptions) => void;
  /** Média de la publication (la durée d'une vidéo est mesurée ici). */
  video: { url: string; type: "VIDEO" | "IMAGE" } | null;
  onStatus: (status: TiktokSectionStatus) => void;
  onPreview?: () => void;
}) {
  const [load, setLoad] = useState<Load>(() => (connectionId && cache.has(connectionId) ? { state: "ready", creator: cache.get(connectionId)! } : { state: "loading" }));
  const [reloadKey, setReloadKey] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!connectionId) return;
    const cached = reloadKey === 0 ? cache.get(connectionId) : undefined;
    if (cached) {
      setLoad({ state: "ready", creator: cached });
      return;
    }
    let alive = true;
    setLoad({ state: "loading" });
    fetch(`/api/social/tiktok/creator-info?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { creator?: TiktokCreatorInfo; error?: string };
        if (!alive) return;
        if (!r.ok || !d.creator) {
          setLoad({ state: "error", message: d.error ?? "Impossible de vérifier le compte TikTok pour le moment." });
          return;
        }
        cache.set(connectionId, d.creator);
        setLoad({ state: "ready", creator: d.creator });
      })
      .catch(() => alive && setLoad({ state: "error", message: "Impossible de vérifier le compte TikTok pour le moment." }));
    return () => {
      alive = false;
    };
  }, [connectionId, reloadKey]);

  // Changement de compte : la confidentialité se choisit à nouveau.
  useEffect(() => {
    if (value.privacyLevel && load.state === "ready" && !load.creator.privacyLevelOptions.includes(value.privacyLevel)) onChange({ ...value, privacyLevel: null });
    // Seulement quand les options du compte changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    setDuration(null);
  }, [video?.url]);

  const creator = load.state === "ready" ? load.creator : null;
  const reason = useMemo(() => {
    if (!connectionId) return "TikTok : connectez un compte TikTok.";
    if (load.state === "loading") return "TikTok : vérification du compte en cours…";
    if (load.state === "error") return `TikTok : ${load.message.charAt(0).toLowerCase()}${load.message.slice(1)}`;
    return tiktokBlockingReason({ ...value, videoDurationSec: duration }, load.creator, { mediaType: video?.type ?? null, durationSec: duration });
  }, [connectionId, load, value, video?.type, duration]);

  useEffect(() => {
    onStatus({ reason, creator });
  }, [reason, creator, onStatus]);

  // La durée mesurée part avec les choix (vérifiée à nouveau à l'envoi).
  useEffect(() => {
    if (duration !== null && value.videoDurationSec !== duration) onChange({ ...value, videoDurationSec: duration });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const set = (patch: Partial<TiktokPostOptions>) => onChange({ ...value, ...patch });
  const labelNotice = tiktokLabelNotice(value);
  const brandedDisabled = brandedContentDisabledReason(value);
  const tooLong = creator?.maxVideoPostDurationSec != null && duration != null && duration > creator.maxVideoPostDurationSec + 0.5;

  const interaction = (key: "allowComment" | "allowDuet" | "allowStitch", label: string, disabledByCreator: boolean) => (
    <div className="flex items-center justify-between gap-3">
      <span className={clsx("text-xs", disabledByCreator ? "text-slate-500" : "text-slate-300")}>
        {label}
        {disabledByCreator && <span className="ml-1 text-[11px] text-slate-500">(coupé dans vos réglages TikTok)</span>}
      </span>
      <Toggle
        size="sm"
        checked={disabledByCreator ? false : value[key]}
        disabled={disabledByCreator}
        onChange={(next) => set({ [key]: next } as Partial<TiktokPostOptions>)}
        aria-label={`Autoriser : ${label}`}
      />
    </div>
  );

  return (
    <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3" data-testid="tiktok-options">
      {video && <video src={video.type === "VIDEO" ? video.url : undefined} preload="metadata" muted className="hidden" onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || null)} />}

      {/* Compte qui publiera */}
      <div className="flex items-center gap-3">
        {creator?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white/10 object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded-full bg-white/[0.06]" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Publié sur TikTok par</p>
          {creator ? (
            <p className="truncate text-sm text-white">
              <span className="font-medium">{creator.nickname}</span> <span className="text-slate-400">@{creator.username}</span>
            </p>
          ) : load.state === "loading" ? (
            <p className="text-sm text-slate-400">Vérification du compte…</p>
          ) : (
            <p className="text-sm text-amber-200">{load.state === "error" ? load.message : "Aucun compte TikTok."}</p>
          )}
        </div>
        {load.state === "error" && (
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="text-xs text-aurora-300 underline underline-offset-2 hover:text-white">
            Réessayer
          </button>
        )}
      </div>

      {creator && (
        <>
          {/* Confidentialité : aucune valeur par défaut */}
          <div>
            <label htmlFor="tiktok-privacy" className="mb-1 block text-xs text-slate-300">
              Qui peut voir cette vidéo ? <span className="text-amber-200">*</span>
            </label>
            <select
              id="tiktok-privacy"
              value={value.privacyLevel ?? ""}
              onChange={(e) => set({ privacyLevel: e.target.value || null })}
              aria-invalid={!value.privacyLevel}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
            >
              <option value="" disabled>
                Choisir la confidentialité…
              </option>
              {creator.privacyLevelOptions.map((level) => {
                const why = privacyOptionDisabledReason(level, value);
                return (
                  <option key={level} value={level} disabled={Boolean(why)} title={why ?? undefined}>
                    {tiktokPrivacyLabel(level)}
                    {why ? " — indisponible pour un contenu de marque" : ""}
                  </option>
                );
              })}
            </select>
            {!value.privacyLevel && <p className="mt-1 text-[11px] text-slate-500">Obligatoire : TikTok demande de choisir à chaque publication.</p>}
            {value.commercial && value.brandedContent && creator.privacyLevelOptions.includes("SELF_ONLY") && (
              <p className="mt-1 text-[11px] text-slate-500" title={BRANDED_CONTENT_NOT_PRIVATE}>
                « Moi uniquement » est indisponible pour un contenu de marque.
              </p>
            )}
          </div>

          {/* Interactions : éteintes par défaut */}
          <div className="space-y-2">
            <p className="text-xs text-slate-300">Autoriser les autres utilisateurs à</p>
            {interaction("allowComment", "Commenter", creator.commentDisabled)}
            {interaction("allowDuet", "Faire un Duo", creator.duetDisabled)}
            {interaction("allowStitch", "Faire un Collage (Stitch)", creator.stitchDisabled)}
          </div>

          {/* Durée */}
          {video?.type === "VIDEO" && creator.maxVideoPostDurationSec != null && (
            <p className={clsx("text-[11px]", tooLong ? "text-amber-200" : "text-slate-500")}>
              {duration == null
                ? `Durée maximale pour ce compte : ${creator.maxVideoPostDurationSec} s.`
                : `Vidéo de ${Math.round(duration)} s — ${tooLong ? "trop longue pour" : "acceptée par"} ce compte (${creator.maxVideoPostDurationSec} s au plus).`}
            </p>
          )}

          {/* Contenu commercial : éteint par défaut */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-200">Déclaration de contenu commercial</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Cette vidéo fait-elle la promotion de vous-même, d&apos;une marque, d&apos;un produit ou d&apos;un service ?</p>
              </div>
              <Toggle
                size="sm"
                checked={value.commercial}
                onChange={(next) => set({ commercial: next, ...(next ? {} : { yourBrand: false, brandedContent: false }) })}
                aria-label="Déclaration de contenu commercial"
              />
            </div>
            {value.commercial && (
              <div className="mt-3 space-y-2">
                <label className="flex cursor-pointer items-start gap-2.5 text-xs text-slate-300">
                  <input type="checkbox" className="mt-0.5 accent-aurora-500" checked={value.yourBrand} onChange={(e) => set({ yourBrand: e.target.checked })} />
                  <span>
                    <span className="font-medium text-slate-100">Votre marque</span>
                    <span className="block text-[11px] text-slate-500">Vous faites la promotion de vous-même ou de votre propre activité.</span>
                  </span>
                </label>
                <label className={clsx("flex items-start gap-2.5 text-xs", brandedDisabled ? "cursor-not-allowed text-slate-500" : "cursor-pointer text-slate-300")} title={brandedDisabled ?? undefined}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-aurora-500"
                    checked={value.brandedContent}
                    disabled={Boolean(brandedDisabled)}
                    onChange={(e) => set({ brandedContent: e.target.checked })}
                  />
                  <span>
                    <span className={clsx("font-medium", brandedDisabled ? "text-slate-500" : "text-slate-100")}>Contenu de marque</span>
                    <span className="block text-[11px] text-slate-500">
                      {brandedDisabled ?? "Vous faites la promotion d'une autre marque ou d'un tiers (partenariat rémunéré)."}
                    </span>
                  </span>
                </label>
                {labelNotice && <p className="text-[11px] text-aurora-200">{labelNotice}</p>}
                {!value.yourBrand && !value.brandedContent && (
                  <p className="text-[11px] text-amber-200" role="alert">
                    {COMMERCIAL_CHOICE_REQUIRED}
                  </p>
                )}
              </div>
            )}
          </div>

          <TiktokConsent options={value} />
          <p className="text-[11px] text-slate-500">
            Nebula envoie votre vidéo telle quelle, sans filigrane, seulement quand vous cliquez sur Publier ou à l&apos;heure programmée. Après l&apos;envoi,
            TikTok peut mettre quelques minutes à traiter la vidéo avant qu&apos;elle apparaisse sur votre profil.
            {onPreview && (
              <>
                {" "}
                <button type="button" onClick={onPreview} className="text-aurora-300 underline underline-offset-2 hover:text-white">
                  Voir l&apos;aperçu TikTok
                </button>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
