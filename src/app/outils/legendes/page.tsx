"use client";

// Générateur de titres et légendes (voir /api/public/tools/captions).
// Refonte du 29/09/2026 (demande de Lucas : « fidèle à mon site ») : la page
// reprend la page Publier de l'application — cartes numérotées, champs
// Titre et Description avec leur bouton « IA », choix du réseau en pastilles
// et le MÊME aperçu fidèle du réseau (tool-preview.tsx). On peut aussi
// écrire soi-même et voir le rendu, sans compte.
//   - Avec un compte : « IA » écrit le titre ou la description à partir du
//     sujet saisi (quota par compte).
//   - Sans compte : « IA » remplit un exemple écrit à l'avance pour une
//     publication fictive, adapté au réseau choisi, et le dit clairement.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markToolExplored } from "@/lib/tools-explored";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { clsx } from "@/lib/clsx";
import { LAUNCHED_NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { IconMessage, IconSparkle } from "@/components/dashboard/icons";
import { NetworkTargetChip } from "@/components/ui/network-badge";
import { ScheduleWithNebula } from "@/components/tools/schedule-with-nebula";
import { ToolDemoNotice, ToolQuotaLine } from "@/components/tools/tool-demo-notice";
import { ToolPreview } from "@/components/tools/tool-preview";
import { saveToolDraft, takeToolDraft, useToolAccess } from "@/components/tools/use-tool-access";
import { DEMO_LEGENDES_BY_NETWORK, DEMO_LEGENDES_CASE } from "@/lib/tools/demo";
import { ToolError } from "@/components/tools/tool-error";

type Field = "title" | "description";
type DemoNetwork = keyof typeof DEMO_LEGENDES_BY_NETWORK;

const FIELD_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60 focus:shadow-[0_0_0_4px_rgb(var(--c-aurora-400)/0.14)]";

function demoFor(network: Network, field: Field): string {
  const demo = DEMO_LEGENDES_BY_NETWORK[(network in DEMO_LEGENDES_BY_NETWORK ? network : "INSTAGRAM") as DemoNetwork];
  return field === "title" ? demo.title : demo.description;
}

function without(set: Set<Field>, field: Field): Set<Field> {
  if (!set.has(field)) return set;
  const next = new Set(set);
  next.delete(field);
  return next;
}

export default function FreeCaptionToolPage() {
  const [topic, setTopic] = useState("");
  const [brandName, setBrandName] = useState("");
  const [network, setNetwork] = useState<Network>("INSTAGRAM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<Set<Field>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [copied, setCopied] = useState<Field | null>(null);
  // Champs remplis par l'exemple (sans compte) : suivent le réseau choisi
  // tant que le visiteur ne les modifie pas.
  const [demoFields, setDemoFields] = useState<Set<Field>>(new Set());
  const [generated, setGenerated] = useState(false);
  const access = useToolAccess();
  const member = access.status === "member";
  const topicRef = useRef<HTMLTextAreaElement>(null);

  // Retour après la création du compte : on remet ce qui avait été saisi.
  useEffect(() => {
    const draft = takeToolDraft("legendes");
    if (!draft) return;
    setTopic(draft.topic ?? "");
    setBrandName(draft.brandName ?? "");
    if ((LAUNCHED_NETWORKS as readonly string[]).includes(draft.network ?? "")) setNetwork(draft.network as Network);
  }, []);

  function pickNetwork(n: Network) {
    setNetwork(n);
    if (demoFields.has("title")) setTitle(demoFor(n, "title"));
    if (demoFields.has("description")) setDescription(demoFor(n, "description"));
  }

  function showExample(fields: Field[]) {
    setError(null);
    setErrorReason(null);
    for (const f of fields) (f === "title" ? setTitle : setDescription)(demoFor(network, f));
    setDemoFields((prev) => new Set([...prev, ...fields]));
  }

  async function generate(fields: Field[]) {
    if (!member) {
      showExample(fields);
      return;
    }
    if (topic.trim().length < 3) {
      setError("Décrivez d'abord votre publication en quelques mots (carte 1).");
      topicRef.current?.focus();
      return;
    }
    setError(null);
    setErrorReason(null);
    setBusy(new Set(fields));
    await Promise.all(
      fields.map(async (field) => {
        try {
          const res = await fetch("/api/public/tools/captions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: topic.trim(), network, brandName: brandName.trim() || undefined, field })
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 401 && data.signupRequired) {
            access.becomeVisitor();
            showExample([field]);
            return;
          }
          if (!res.ok) {
            setError(data.error ?? "Une erreur est survenue.");
        setErrorReason(typeof data.reason === "string" ? data.reason : null);
            setErrorReason(typeof data.reason === "string" ? data.reason : null);
            return;
          }
          (field === "title" ? setTitle : setDescription)(data.text);
          setDemoFields((prev) => without(prev, field));
          setGenerated(true);
          markToolExplored();
          if (typeof data.remaining === "number") access.setRemaining("text", data.remaining);
        } catch {
          setError("Impossible de contacter le générateur pour le moment.");
        } finally {
          setBusy((prev) => without(prev, field));
        }
      })
    );
  }

  function editField(field: Field, value: string) {
    (field === "title" ? setTitle : setDescription)(value);
    setDemoFields((prev) => without(prev, field));
  }

  async function copy(field: Field) {
    const text = field === "title" ? title : description;
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  const maxCaption = NETWORK_META[network].maxCaption;
  const showingExample = !member && demoFields.size > 0;

  // En-tête des cartes Titre / Description, comme dans la page Publier.
  const fieldHeader = (field: Field, n: number, label: string) => {
    const running = busy.has(field);
    return (
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-medium text-white">
          {n}. {label}
        </h2>
        <div className="flex items-center gap-3">
          {(field === "title" ? title : description) && (
            <button type="button" onClick={() => copy(field)} className="text-xs text-slate-400 transition hover:text-white">
              {copied === field ? "Copié !" : "Copier"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void generate([field])}
            disabled={running || access.status === "loading"}
            title={member ? "Générer avec l'IA" : "Voir un exemple (sans compte : écrit à l'avance, sans IA)"}
            className="flex items-center gap-1 text-xs text-aurora-300 transition hover:underline disabled:cursor-wait disabled:opacity-60 disabled:no-underline"
          >
            <IconSparkle className={clsx("h-3.5 w-3.5", running && "animate-pulse")} />
            {running ? "Génération..." : "IA"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <main id="contenu" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-4 pt-16 text-center">
        <Link href="/outils" className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
          ← Tous les outils
        </Link>
        <h1 className="mt-4 flex items-center justify-center gap-2 font-display text-2xl font-semibold text-white sm:text-3xl">
          <IconMessage className="h-6 w-6 text-aurora-300" /> Générateur de légendes et de titres
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
          Le même éditeur que dans Nebula : décrivez votre publication, l&apos;IA écrit le titre et la description pour le réseau choisi, et vous voyez tout de
          suite le rendu. Avec un compte gratuit, 10 générations par jour.
        </p>
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-6 px-6 pb-10 pt-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">1. Votre publication</h2>
            <label htmlFor="legendes-topic" className="block text-xs text-slate-400">
              De quoi parle-t-elle ?
            </label>
            <textarea
              id="legendes-topic"
              ref={topicRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="Ex : ouverture de notre nouvelle boutique à Lyon ce week-end"
              className={clsx(FIELD_CLASS, "mt-1.5 resize-none")}
            />
            <label htmlFor="legendes-brand" className="mt-3 block text-xs text-slate-400">
              Nom de votre marque (facultatif)
            </label>
            <input
              id="legendes-brand"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              maxLength={60}
              placeholder="Ex : Studio Lumière"
              className={clsx(FIELD_CLASS, "mt-1.5")}
            />
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">2. Réseau</h2>
            <div className="flex flex-wrap gap-2">
              {LAUNCHED_NETWORKS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickNetwork(n)}
                  aria-pressed={network === n}
                  aria-label={`${NETWORK_META[n].label}${network === n ? " (choisi)" : ""}`}
                  className="rounded-full"
                >
                  <NetworkTargetChip network={n} state={network === n ? "selected" : "idle"} />
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            {fieldHeader("title", 3, "Titre")}
            <input
              value={title}
              onChange={(e) => editField("title", e.target.value)}
              maxLength={200}
              placeholder="Titre de la publication (utilisé notamment comme titre YouTube)..."
              aria-label="Titre"
              className={FIELD_CLASS}
            />
          </GlassCard>

          <GlassCard>
            {fieldHeader("description", 4, "Description")}
            <textarea
              value={description}
              onChange={(e) => editField("description", e.target.value)}
              rows={7}
              placeholder={`Légende / description pour ${NETWORK_META[network].label}...`}
              aria-label="Description"
              className={clsx(FIELD_CLASS, "resize-y")}
            />
            <p className={clsx("mt-1.5 text-right text-[11px]", description.length > maxCaption ? "text-red-300" : "text-slate-500")}>
              {description.length.toLocaleString("fr-FR")} / {maxCaption.toLocaleString("fr-FR")} caractères sur {NETWORK_META[network].label}
            </p>
          </GlassCard>

          <div>
            <Button onClick={() => void generate(["title", "description"])} disabled={busy.size > 0 || access.status === "loading"} className="w-full">
              <IconSparkle className="h-4 w-4" />
              {busy.size > 0 ? "Génération..." : member ? "Générer le titre et la description" : "Voir un exemple (sans IA)"}
            </Button>
            <ToolQuotaLine status={access.status} remaining={access.remaining?.text ?? null} kind="text" />
            <ToolError message={error} reason={errorReason} />
            {showingExample && (
              <ToolDemoNotice
                slug="legendes"
                input={`${DEMO_LEGENDES_CASE} · ${NETWORK_META[network].label}`}
                onBeforeLeave={() => saveToolDraft("legendes", { topic, brandName, network })}
              />
            )}
            {member && generated && (title || description) && (
              <ScheduleWithNebula
                className="mt-4"
                payload={{ kind: "CAPTION", tool: "legendes", network, content: { ...(title ? { title } : {}), ...(description ? { caption: description } : {}) } }}
              />
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <ToolPreview
            network={network}
            networks={LAUNCHED_NETWORKS}
            onPickNetwork={pickNetwork}
            title={title}
            caption={description}
            accountName={brandName}
            note="Même aperçu que dans la page Publier de Nebula."
          />
        </div>
      </section>

      <p className="relative z-10 px-6 pb-20 text-center text-sm text-slate-500">
        Nebula programme et publie sur vos réseaux, avec l&apos;IA intégrée.{" "}
        <Link href="/register?utm_source=outils&utm_medium=link&utm_campaign=legendes" className="text-aurora-300 hover:underline">
          Créez votre espace gratuit
        </Link>{" "}
        — 14 jours d&apos;essai offerts.
      </p>
    </main>
  );
}
