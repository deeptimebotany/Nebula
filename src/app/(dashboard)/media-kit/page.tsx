"use client";

// Media kit (produit n°10) : l'éditeur du kit de la marque active. Choix de
// Lucas : adresse lisible /kit/<marque>, chiffres automatiques + réglages
// (comptes et publications affichés, présentation, offres, contact), aperçu
// gratuit et publication Pro/Agence ; en plus, PDF, image de partage et
// compteur d'ouvertures.
//
// Les chiffres ne se règlent pas : ils viennent des relevés de Nebula.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { NetworkTile } from "@/components/ui/network-badge";
import { RemoteImage } from "@/components/ui/remote-image";
import { SaveStatus, useSaveStatus } from "@/components/ui/save-status";
import { IconDownload, IconLink, IconMediaKit } from "@/components/dashboard/icons";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { KitView } from "@/components/media-kit/kit-view";
import { clsx } from "@/lib/clsx";
import { formatCompact } from "@/lib/engagement-metrics";
import { NETWORK_META } from "@/lib/types";
import {
  ABOUT_MAX,
  HEADLINE_MAX,
  MAX_FEATURED_POSTS,
  MAX_OFFERS,
  OFFER_LABEL_MAX,
  OFFER_PRICE_MAX,
  type KitEditorDTO,
  type KitOffer,
  type KitSettings
} from "@/lib/media-kit/types";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Patch = Partial<Omit<KitSettings, "contactEmail">> & { contactEmail?: string | null };

export default function MediaKitPage() {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const upgrade = useUpgradeModal();
  const save = useSaveStatus();
  const brandId = activeBrand?.id ?? null;

  const [dto, setDto] = useState<KitEditorDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [email, setEmail] = useState("");
  const [offers, setOffers] = useState<KitOffer[]>([]);
  const [choosePosts, setChoosePosts] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoadError(null);
    const res = await fetch(`/api/media-kit?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setLoadError("Impossible de charger votre media kit pour le moment. Rechargez la page.");
      return;
    }
    const json = (await res.json()) as KitEditorDTO;
    setDto(json);
    setHeadline(json.settings.headline);
    setAbout(json.settings.about);
    setEmail(json.settings.contactEmail ?? "");
    setOffers(json.settings.offers);
    setChoosePosts(json.settings.featuredPostIds.length > 0);
  }, [brandId]);

  useEffect(() => {
    setDto(null);
    void load();
  }, [load]);

  const patch = useCallback(
    async (data: Patch): Promise<boolean> => {
      if (!brandId) return false;
      let ok = false;
      await save.track(async () => {
        const res = await fetch("/api/media-kit", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, ...data }) }).catch(() => null);
        const json = (await res?.json().catch(() => ({}))) as KitEditorDTO & { error?: string; reason?: string };
        if (!res?.ok) {
          if (res && upgrade.openFromResponse(res.status, json)) return true;
          toast.error(json.error ?? "L'enregistrement n'a pas abouti. Réessayez.");
          return false;
        }
        setDto(json);
        ok = true;
        return true;
      });
      return ok;
    },
    [brandId, save, toast, upgrade]
  );

  const settings = dto?.settings;
  const hidden = useMemo(() => new Set(settings?.hiddenConnectionIds ?? []), [settings]);
  const emailValid = email.trim() === "" || EMAIL_RE.test(email.trim());

  // Aperçu : chiffres du serveur, texte tel qu'il est en train d'être écrit.
  const preview = useMemo(() => {
    if (!dto) return null;
    return {
      ...dto.preview,
      headline: headline.replace(/\s+/g, " ").trim(),
      about: about.trim(),
      contactEmail: emailValid && email.trim() ? email.trim() : null,
      offers: offers.map((o) => ({ label: o.label.trim(), price: o.price.trim() })).filter((o) => o.label)
    };
  }, [dto, headline, about, email, emailValid, offers]);

  const publicUrl = dto && typeof window !== "undefined" ? `${window.location.origin}/kit/${dto.slug}` : "";

  async function togglePublished(next: boolean) {
    if (!dto) return;
    if (next && !dto.allowed) {
      upgrade.open("media_kit");
      return;
    }
    if (await patch({ published: next })) toast.success(next ? "Media kit publié." : "Media kit retiré : le lien ne s'ouvre plus.");
  }

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copie impossible : sélectionnez le lien à la main.");
    }
  }

  function toggleAccount(id: string, show: boolean) {
    const next = new Set(hidden);
    if (show) next.delete(id);
    else next.add(id);
    void patch({ hiddenConnectionIds: Array.from(next) });
  }

  function togglePost(id: string) {
    if (!settings) return;
    const current = settings.featuredPostIds;
    if (current.includes(id)) {
      void patch({ featuredPostIds: current.filter((x) => x !== id) });
      return;
    }
    if (current.length >= MAX_FEATURED_POSTS) {
      toast.info(`${MAX_FEATURED_POSTS} publications au plus : retirez-en une d'abord.`);
      return;
    }
    void patch({ featuredPostIds: [...current, id] });
  }

  function saveOffers(list: KitOffer[]) {
    void patch({ offers: list.filter((o) => o.label.trim()) });
  }

  if (!activeBrand) {
    return <p className="py-20 text-center text-sm text-slate-500">Sélectionnez ou créez une marque pour préparer son media kit.</p>;
  }

  const shownChoices = (dto?.postChoices ?? []).filter((p) => !hidden.has(p.connectionId));
  const noNumbers = dto !== null && dto.preview.stats.accounts.every((a) => a.followers === null) && dto.preview.stats.posts.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconMediaKit className="h-5 w-5" />}
        title="Media kit"
        description="La page à envoyer aux marques et aux sponsors : vos abonnés, votre engagement et vos meilleures publications, relevés automatiquement par Nebula, avec votre présentation et vos offres."
        actions={<SaveStatus state={save.state} />}
      />

      {loadError && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!dto || !settings || !preview ? (
        !loadError && (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-20 w-full" />
            <SkeletonCard lines={4} />
            <span className="sr-only">Chargement en cours</span>
          </div>
        )
      ) : (
        <>
          {/* Publication */}
          <GlassCard hover={false} className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-white">{settings.published ? "Votre media kit est en ligne" : dto.allowed ? "Votre media kit n'est pas encore publié" : "Aperçu : votre kit se prépare ici, gratuitement"}</p>
                <p className="mt-0.5 text-sm text-slate-400">
                  {settings.published
                    ? `${dto.views === 0 ? "Pas encore ouvert" : `Ouvert ${dto.views.toLocaleString("fr-FR")} fois`}${dto.lastViewedAt ? `${dto.views > 1 ? ", la dernière fois" : ","} le ${DATE_FMT.format(new Date(dto.lastViewedAt))}` : ""} (un visiteur compte une fois par jour ; vos propres visites ne comptent pas).`
                    : dto.allowed
                      ? "Relisez l'aperçu, puis publiez : le lien, le PDF et l'image de partage seront prêts."
                      : "Le publier (lien à partager, PDF, image de partage) fait partie des paliers Pro et Agence. Tout ce que vous réglez ici est gardé."}
                </p>
              </div>
              {dto.allowed ? (
                <Toggle checked={settings.published} onChange={(v) => void togglePublished(v)} label="Publié" />
              ) : (
                <Button type="button" onClick={() => upgrade.open("media_kit")} className="shrink-0">
                  Publier mon kit
                  <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-semibold">PRO</span>
                </Button>
              )}
            </div>
            {settings.published && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <IconLink className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="truncate text-sm text-slate-200">{publicUrl.replace(/^https?:\/\//, "")}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void copyLink()}>
                    {copied ? "Lien copié" : "Copier le lien"}
                  </Button>
                  <a href={`/kit/${dto.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost")}>
                    Ouvrir
                  </a>
                  <a href={`/kit/${dto.slug}?imprimer=1`} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost")}>
                    <IconDownload className="h-4 w-4" />
                    PDF
                  </a>
                </div>
              </div>
            )}
          </GlassCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_minmax(0,1fr)] xl:items-start">
            {/* Réglages */}
            <div className="space-y-4">
              <GlassCard hover={false} className="space-y-4">
                <h2 className="font-display text-base font-semibold text-white">Présentation</h2>
                <Input
                  label="Accroche"
                  placeholder="ex. Recettes de café maison, une vidéo chaque mardi"
                  value={headline}
                  maxLength={HEADLINE_MAX}
                  onChange={(e) => setHeadline(e.target.value)}
                  onBlur={() => headline !== settings.headline && void patch({ headline })}
                  hint={`${headline.length}/${HEADLINE_MAX} · sous votre nom, en haut du kit`}
                />
                <Textarea
                  label="À propos"
                  placeholder="Qui vous êtes, votre public, les sujets que vous traitez, les marques avec qui vous avez déjà travaillé…"
                  value={about}
                  rows={5}
                  maxLength={ABOUT_MAX}
                  onChange={(e) => setAbout(e.target.value)}
                  onBlur={() => about !== settings.about && void patch({ about })}
                  hint={`${about.length}/${ABOUT_MAX}`}
                />
                <Input
                  label="E-mail de contact"
                  type="email"
                  placeholder="partenariats@votre-marque.fr"
                  value={email}
                  maxLength={200}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => {
                    if (!emailValid) return;
                    const next = email.trim() || null;
                    if (next !== settings.contactEmail) void patch({ contactEmail: next });
                  }}
                  error={emailValid ? undefined : "Adresse e-mail invalide."}
                  hint="Affichée sur le kit avec un bouton « Contacter ». Facultatif."
                />
              </GlassCard>

              <GlassCard hover={false} className="space-y-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-white">Comptes affichés</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Leurs chiffres sont relevés par Nebula : vous choisissez lesquels montrer, pas les chiffres.</p>
                </div>
                {dto.connections.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Aucun compte connecté.{" "}
                    <Link href="/accounts" className="text-aurora-300 hover:text-white">
                      Connecter un compte →
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {dto.connections.map((c) => {
                      const off = c.status === "DISCONNECTED";
                      return (
                        <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <NetworkTile network={c.network} size={24} className={off ? "opacity-50 grayscale" : undefined} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-white">{c.name}</span>
                              <span className="block truncate text-[11px] text-slate-500">{off ? "Déconnecté : jamais affiché" : NETWORK_META[c.network].label}</span>
                            </span>
                          </span>
                          <Toggle size="sm" checked={!off && !hidden.has(c.id)} disabled={off} onChange={(v) => toggleAccount(c.id, v)} aria-label={`Afficher ${c.name} (${NETWORK_META[c.network].label})`} />
                        </li>
                      );
                    })}
                  </ul>
                )}
                {noNumbers && dto.connections.length > 0 && (
                  <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                    Pas encore de chiffres : ouvrez{" "}
                    <Link href="/analytics" className="text-aurora-300 hover:text-white">
                      Analytics
                    </Link>{" "}
                    et{" "}
                    <Link href="/engagements" className="text-aurora-300 hover:text-white">
                      Engagements
                    </Link>{" "}
                    et actualisez : le kit se remplit tout seul.
                  </p>
                )}
              </GlassCard>

              <GlassCard hover={false} className="space-y-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-white">Publications à la une</h2>
                  <p className="mt-0.5 text-xs text-slate-400">{MAX_FEATURED_POSTS} au plus, avec leurs vrais chiffres.</p>
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Choix des publications">
                  {[
                    { value: false, label: "Automatique", hint: "Vos meilleures" },
                    { value: true, label: "Je choisis", hint: `${settings.featuredPostIds.length}/${MAX_FEATURED_POSTS}` }
                  ].map((o) => (
                    <button
                      key={String(o.value)}
                      type="button"
                      role="radio"
                      aria-checked={choosePosts === o.value}
                      onClick={() => {
                        setChoosePosts(o.value);
                        if (!o.value && settings.featuredPostIds.length) void patch({ featuredPostIds: [] });
                      }}
                      className={clsx(
                        "rounded-xl border px-3 py-2 text-left text-sm transition",
                        choosePosts === o.value ? "border-aurora-400/50 bg-aurora-400/10 text-white" : "border-white/10 text-slate-300 hover:border-white/20"
                      )}
                    >
                      <span className="block font-medium">{o.label}</span>
                      <span className="block text-[11px] text-slate-400">{o.hint}</span>
                    </button>
                  ))}
                </div>
                {choosePosts &&
                  (shownChoices.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      Aucune publication mesurée sur 12 mois. Ouvrez{" "}
                      <Link href="/engagements" className="text-aurora-300 hover:text-white">
                        Engagements
                      </Link>{" "}
                      et actualisez.
                    </p>
                  ) : (
                    <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                      {shownChoices.map((p) => {
                        const pos = settings.featuredPostIds.indexOf(p.id);
                        const on = pos >= 0;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              onClick={() => togglePost(p.id)}
                              className={clsx(
                                "flex w-full items-center gap-3 rounded-xl border px-2 py-2 text-left transition",
                                on ? "border-aurora-400/50 bg-aurora-400/10" : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"
                              )}
                            >
                              <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-white/[0.04]">
                                {p.thumbnailUrl ? (
                                  <RemoteImage src={p.thumbnailUrl} className="absolute inset-0 h-full w-full" sizes="64px" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center">
                                    <NetworkTile network={p.network} size={18} />
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-1 text-sm text-white">{p.title}</span>
                                <span className="block text-[11px] tabular-nums text-slate-400">
                                  {NETWORK_META[p.network].label}
                                  {p.views !== null ? ` · ${formatCompact(p.views)} vues` : ""} · {formatCompact(p.interactions)} interactions
                                  {p.publishedAt ? ` · ${SHORT_DATE.format(new Date(p.publishedAt))}` : ""}
                                </span>
                              </span>
                              <span
                                className={clsx(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                                  on ? "border-aurora-400/60 bg-aurora-400/30 text-white" : "border-white/15 text-transparent"
                                )}
                                aria-hidden="true"
                              >
                                {on ? pos + 1 : ""}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
              </GlassCard>

              <GlassCard hover={false} className="space-y-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-white">Collaborations</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Facultatif : ce que vous proposez aux marques, avec un prix ou « sur devis ».</p>
                </div>
                {offers.map((o, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <Input
                      label={`Offre ${i + 1}`}
                      placeholder="ex. Reel sponsorisé"
                      value={o.label}
                      maxLength={OFFER_LABEL_MAX}
                      onChange={(e) => setOffers((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      onBlur={() => saveOffers(offers)}
                    />
                    <div className="flex items-end gap-2">
                      <Input
                        label="Prix"
                        placeholder="250 € ou « sur devis »"
                        value={o.price}
                        maxLength={OFFER_PRICE_MAX}
                        onChange={(e) => setOffers((list) => list.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                        onBlur={() => saveOffers(offers)}
                        wrapperClassName="min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = offers.filter((_, j) => j !== i);
                          setOffers(next);
                          saveOffers(next);
                        }}
                        className="h-[42px] shrink-0 rounded-xl px-3 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
                        aria-label={`Retirer l'offre ${i + 1}`}
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                ))}
                {offers.length < MAX_OFFERS && (
                  <Button type="button" variant="ghost" onClick={() => setOffers((list) => [...list, { label: "", price: "" }])}>
                    + Ajouter une offre
                  </Button>
                )}
              </GlassCard>
            </div>

            {/* Aperçu */}
            <section aria-labelledby="kit-preview-title" className="space-y-3 xl:sticky xl:top-20">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="kit-preview-title" className="font-display text-base font-semibold text-white">
                  Aperçu
                </h2>
                <p className="text-xs text-slate-500">Tel que le verront les marques · nebulahub.space/kit/{dto.slug}</p>
              </div>
              <div className="rounded-3xl border border-white/[0.08] bg-white/[0.015] p-4 sm:p-6">
                <KitView data={preview} nested />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
