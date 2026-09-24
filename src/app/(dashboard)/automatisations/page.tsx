"use client";

// Page « Automatisations » (lot 4, palier Agence, 25/09/2026) : clés
// d'API, webhooks et guides pour brancher Nebula à n8n, Make, Zapier ou à
// ses propres outils. Données : /api/automations/* (session) ; l'API
// publique elle-même vit sous /api/v1 (clé).

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "@/lib/clsx";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { UpgradeButton } from "@/components/dashboard/upgrade-gem";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  brandId: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface DeliveryRow {
  id: string;
  event: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
  nextAttemptAt: string | null;
}

interface WebhookRow {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  brandId: string | null;
  active: boolean;
  failureCount: number;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  disabledReason: string | null;
  createdAt: string;
  deliveries: DeliveryRow[];
}

interface Overview {
  access: boolean;
  keys: KeyRow[];
  webhooks: WebhookRow[];
  brands: { id: string; name: string }[];
  events: { id: string; label: string; description: string }[];
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "jamais";

function CopyField({ value, label }: { value: string; label?: string }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 p-2">
      <code className="min-w-0 flex-1 select-all break-all font-mono text-xs text-aurora-200">{value}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value).then(
            () => toast.success(label ? `${label} copié.` : "Copié."),
            () => toast.error("Copie impossible : sélectionnez le texte à la main.")
          );
        }}
        className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-200 hover:border-aurora-400/50 hover:text-white"
      >
        Copier
      </button>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const toast = useToast();
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 pr-16 text-[12px] leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(code).then(() => toast.success("Copié."), () => undefined)}
        className="absolute right-2 top-2 rounded-md border border-white/10 bg-black/60 px-2 py-0.5 text-[11px] text-slate-300 hover:text-white"
      >
        Copier
      </button>
    </div>
  );
}

function StatusDot({ tone }: { tone: "ok" | "warn" | "off" }) {
  return <span className={clsx("inline-block h-2 w-2 rounded-full", tone === "ok" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : "bg-slate-500")} aria-hidden="true" />;
}

// --- Clés d'API ------------------------------------------------------------------

function KeysSection({ data, reload }: { data: Overview; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("write");
  const [brandId, setBrandId] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const brandName = (id: string | null) => (id ? data.brands.find((b) => b.id === id)?.name ?? "Marque supprimée" : "Toutes les marques");

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/automations/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scope, brandId: brandId || null })
      });
      const body = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
      if (!res.ok || !body.key) throw new Error(body.error || "Création impossible.");
      setCreated(body.key);
      setOpen(false);
      setName("");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(k: KeyRow) {
    const ok = await confirm({
      title: "Révoquer cette clé ?",
      message: `« ${k.name} » cessera immédiatement de fonctionner. Les automatisations qui l'utilisent s'arrêteront.`,
      confirmLabel: "Révoquer",
      danger: true
    });
    if (!ok) return;
    const res = await fetch(`/api/automations/keys/${k.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Clé révoquée.");
      reload();
    } else toast.error("Révocation impossible.");
  }

  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-medium text-white">Clés d&apos;API</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Pour créer des publications ou lire vos données depuis un autre outil. Chaque clé se révoque en un clic ; « lecture seule » suffit pour des tableaux de bord.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!data.access}>
          Nouvelle clé
        </Button>
      </div>

      {data.keys.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Aucune clé pour l&apos;instant.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
          {data.keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{k.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  <code className="font-mono text-slate-400">{k.prefix}…</code> · {k.scopes.includes("write") ? "Lecture et écriture" : "Lecture seule"} · {brandName(k.brandId)} · utilisée {k.lastUsedAt ? `le ${fmtDate(k.lastUsedAt)}` : "jamais"}
                </p>
              </div>
              <button type="button" onClick={() => revoke(k)} className="text-xs text-red-300 hover:text-red-200">
                Révoquer
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle clé d'API">
        <div className="space-y-3">
          <Input label="Nom (pour la reconnaître)" placeholder="n8n — agence" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Select label="Accès" value={scope} onChange={(e) => setScope(e.target.value as "read" | "write")}>
            <option value="write">Lecture et écriture (créer des publications, des webhooks)</option>
            <option value="read">Lecture seule</option>
          </Select>
          <Select label="Marques" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Toutes mes marques</option>
            {data.brands.map((b) => (
              <option key={b.id} value={b.id}>
                Seulement {b.name}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={create} disabled={busy || !name.trim()}>
              {busy ? "Création…" : "Créer la clé"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={created !== null} onClose={() => setCreated(null)} title="Votre nouvelle clé">
        <div className="space-y-3">
          <p className="text-sm text-amber-200">Copiez-la maintenant : pour votre sécurité, elle ne sera plus jamais affichée. En cas de perte, créez-en une autre.</p>
          {created && <CopyField value={created} label="Clé" />}
          <p className="text-xs text-slate-400">
            À envoyer dans l&apos;en-tête <code className="text-slate-300">Authorization: Bearer {created ? `${created.slice(0, 12)}…` : "nbk_…"}</code> de chaque requête.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setCreated(null)}>J&apos;ai copié la clé</Button>
          </div>
        </div>
      </Modal>
    </GlassCard>
  );
}

// --- Webhooks ----------------------------------------------------------------------

function WebhookCard({ w, data, reload }: { w: WebhookRow; data: Overview; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [showLog, setShowLog] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const url = useMemo(() => {
    try {
      const u = new URL(w.url);
      return { host: u.host, path: `${u.pathname}${u.search}`.slice(0, 60) };
    } catch {
      return { host: w.url, path: "" };
    }
  }, [w.url]);
  const tone: "ok" | "warn" | "off" = !w.active ? "off" : w.failureCount > 0 ? "warn" : "ok";
  const label = (id: string) => data.events.find((e) => e.id === id)?.label ?? id;

  async function test() {
    setTesting(true);
    try {
      const res = await fetch(`/api/automations/webhooks/${w.id}/test`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; responseStatus?: number | null; error?: string | null };
      if (res.ok && body.ok) toast.success(`Test reçu (réponse ${body.responseStatus}).`);
      else toast.error(`Test non reçu : ${body.error || "pas de réponse"}.`);
      reload();
    } finally {
      setTesting(false);
    }
  }

  async function toggle() {
    const res = await fetch(`/api/automations/webhooks/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !w.active })
    });
    if (res.ok) reload();
    else toast.error("Modification impossible.");
  }

  async function remove() {
    const ok = await confirm({ title: "Supprimer ce webhook ?", message: `Nebula n'enverra plus rien à ${url.host}.`, confirmLabel: "Supprimer", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/automations/webhooks/${w.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Webhook supprimé.");
      reload();
    }
  }

  async function reveal() {
    if (secret) {
      setSecret(null);
      return;
    }
    const res = await fetch(`/api/automations/webhooks/${w.id}/secret`, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { secret?: string };
    if (body.secret) setSecret(body.secret);
  }

  return (
    <li className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <StatusDot tone={tone} />
            <span className="truncate">{url.host}</span>
            <span className="truncate text-xs font-normal text-slate-500">{url.path}</span>
          </p>
          {w.description && <p className="mt-0.5 text-xs text-slate-400">{w.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {w.events.map((e) => (
              <span key={e} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                {label(e)}
              </span>
            ))}
            {w.brandId && <span className="rounded-full border border-aurora-400/30 px-2 py-0.5 text-[11px] text-aurora-200">{data.brands.find((b) => b.id === w.brandId)?.name ?? "Marque"}</span>}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {!w.active
              ? w.disabledReason ?? "Désactivé."
              : w.lastDeliveryAt
                ? `Dernier envoi le ${fmtDate(w.lastDeliveryAt)}${w.lastStatus ? ` (réponse ${w.lastStatus})` : ""}${w.failureCount ? ` · ${w.failureCount} échec(s) d'affilée` : ""}`
                : "Aucun envoi pour l'instant."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button variant="outline" onClick={test} disabled={testing || !data.access}>
            {testing ? "Envoi…" : "Tester"}
          </Button>
          <button type="button" onClick={toggle} disabled={!data.access} className="text-slate-300 hover:text-white">
            {w.active ? "Désactiver" : "Réactiver"}
          </button>
          <button type="button" onClick={reveal} className="text-slate-300 hover:text-white">
            {secret ? "Masquer le secret" : "Secret"}
          </button>
          <button type="button" onClick={remove} className="text-red-300 hover:text-red-200">
            Supprimer
          </button>
        </div>
      </div>
      {secret && (
        <div className="mt-3">
          <CopyField value={secret} label="Secret" />
        </div>
      )}
      <button type="button" onClick={() => setShowLog((v) => !v)} className="mt-2 text-xs text-slate-400 hover:text-white">
        {showLog ? "▲ Masquer les derniers envois" : `▼ Derniers envois (${w.deliveries.length})`}
      </button>
      {showLog && (
        <ul className="mt-2 space-y-1">
          {w.deliveries.length === 0 && <li className="text-xs text-slate-500">Rien d&apos;envoyé pour l&apos;instant : utilisez « Tester ».</li>}
          {w.deliveries.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5 text-xs">
              <StatusDot tone={d.status === "SUCCESS" ? "ok" : d.status === "PENDING" ? "warn" : "off"} />
              <span className="font-mono text-slate-300">{d.event}</span>
              <span className="text-slate-500">{fmtDate(d.createdAt)}</span>
              <span className={clsx("ml-auto", d.status === "SUCCESS" ? "text-emerald-300" : d.status === "PENDING" ? "text-amber-300" : "text-red-300")}>
                {d.status === "SUCCESS"
                  ? `Reçu (${d.responseStatus})`
                  : d.status === "PENDING"
                    ? `Nouvel essai ${d.nextAttemptAt ? `vers ${fmtDate(d.nextAttemptAt)}` : "bientôt"} · ${d.error ?? ""}`
                    : `Échec · ${d.error ?? ""}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function WebhooksSection({ data, reload }: { data: Overview; reload: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [brandId, setBrandId] = useState("");
  const [events, setEvents] = useState<string[]>(["post.published", "post.failed"]);
  const [busy, setBusy] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/automations/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), events, brandId: brandId || null, description: description.trim() || undefined })
      });
      const body = (await res.json().catch(() => ({}))) as { webhook?: { secret?: string }; error?: string };
      if (!res.ok || !body.webhook) throw new Error(body.error || "Création impossible.");
      setCreatedSecret(body.webhook.secret ?? null);
      setOpen(false);
      setUrl("");
      setDescription("");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-medium text-white">Webhooks</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Nebula prévient automatiquement vos outils quand quelque chose se passe : publication en ligne, échec, réponse d&apos;un client… Collez l&apos;adresse fournie par n8n, Make ou Zapier.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!data.access}>
          Ajouter un webhook
        </Button>
      </div>

      {data.webhooks.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Aucun webhook pour l&apos;instant.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.webhooks.map((w) => (
            <WebhookCard key={w.id} w={w} data={data} reload={reload} />
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Ajouter un webhook" maxWidthClassName="max-w-xl">
        <div className="space-y-3">
          <Input label="Adresse (https)" placeholder="https://hooks.zapier.com/hooks/catch/…" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
          <Input label="Description (facultatif)" placeholder="Alerte Slack de l'équipe" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Select label="Marques" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Toutes mes marques</option>
            {data.brands.map((b) => (
              <option key={b.id} value={b.id}>
                Seulement {b.name}
              </option>
            ))}
          </Select>
          <fieldset>
            <legend className="mb-1.5 text-sm text-slate-300">Événements</legend>
            <div className="space-y-1.5">
              {data.events.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-aurora-400"
                    checked={events.includes(e.id)}
                    onChange={(ev) => setEvents((prev) => (ev.target.checked ? [...prev, e.id] : prev.filter((x) => x !== e.id)))}
                  />
                  <span>
                    <span className="text-sm text-white">{e.label}</span> <code className="text-[11px] text-slate-500">{e.id}</code>
                    <span className="block text-xs text-slate-400">{e.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={create} disabled={busy || !url.trim() || events.length === 0}>
              {busy ? "Ajout…" : "Ajouter"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={createdSecret !== null} onClose={() => setCreatedSecret(null)} title="Webhook ajouté">
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Voici son secret de signature. Il sert à vérifier que les envois viennent bien de Nebula (facultatif avec n8n, Make ou Zapier). Vous pourrez le réafficher avec le bouton « Secret ».
          </p>
          {createdSecret && <CopyField value={createdSecret} label="Secret" />}
          <p className="text-xs text-slate-400">Astuce : cliquez sur « Tester » pour envoyer un premier événement et vérifier que tout est bien branché.</p>
          <div className="flex justify-end">
            <Button onClick={() => setCreatedSecret(null)}>Fermer</Button>
          </div>
        </div>
      </Modal>
    </GlassCard>
  );
}

// --- Guides --------------------------------------------------------------------------

type GuideId = "n8n" | "make" | "zapier" | "code";

function Guides({ base }: { base: string }) {
  const [tab, setTab] = useState<GuideId>("n8n");
  const createExample = `curl -X POST ${base}/api/v1/posts \\
  -H "Authorization: Bearer nbk_VOTRE_CLE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "brandId": "ID_DE_LA_MARQUE",
    "caption": "Nouvelle vidéo en ligne ! #nebula",
    "networks": ["INSTAGRAM", "BLUESKY"],
    "scheduledAt": "2026-10-01T09:00:00+02:00"
  }'`;
  const verifyExample = `import crypto from "node:crypto";

// Dans votre serveur : corps BRUT de la requête (texte), en-tête Nebula-Signature.
export function isFromNebula(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(\`\${parts.t}.\${rawBody}\`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300; // 5 minutes
  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}`;
  const payloadExample = `{
  "id": "evt_4f2c…",
  "type": "post.published",
  "createdAt": "2026-10-01T07:00:04.120Z",
  "brand": { "id": "…", "name": "Studio Lumière" },
  "data": {
    "id": "…", "status": "PUBLISHED", "caption": "Nouvelle vidéo en ligne !",
    "url": "${base}/posts/…",
    "targets": [
      { "network": "INSTAGRAM", "status": "PUBLISHED", "postUrl": "https://www.instagram.com/p/…" }
    ]
  }
}`;
  const tabs: { id: GuideId; label: string }[] = [
    { id: "n8n", label: "n8n" },
    { id: "make", label: "Make" },
    { id: "zapier", label: "Zapier" },
    { id: "code", label: "Votre code" }
  ];
  return (
    <GlassCard>
      <h2 className="font-display text-base font-medium text-white">Démarrage rapide</h2>
      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx("rounded-full border px-3 py-1 text-xs transition", tab === t.id ? "border-aurora-400/50 bg-aurora-400/15 text-white" : "border-white/10 text-slate-400 hover:text-white")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-3 text-sm text-slate-300">
        {tab === "n8n" && (
          <>
            <p><span className="font-medium text-white">Être prévenu :</span> ajoutez un nœud « Webhook » (méthode POST), copiez son « Production URL » et collez-la dans « Ajouter un webhook » ci-dessus. Activez le workflow, puis « Tester ».</p>
            <p><span className="font-medium text-white">Publier :</span> nœud « HTTP Request », méthode POST, URL <code className="text-aurora-200">{base}/api/v1/posts</code>, authentification « Header Auth » avec <code className="text-aurora-200">Authorization</code> = <code className="text-aurora-200">Bearer nbk_…</code>, corps JSON comme l&apos;exemple de l&apos;onglet « Votre code ».</p>
            <p className="text-xs text-slate-400">n8n est gratuit en auto-hébergement ; la version cloud a sa propre offre.</p>
          </>
        )}
        {tab === "make" && (
          <>
            <p><span className="font-medium text-white">Être prévenu :</span> module « Webhooks › Custom webhook », « Add », copiez l&apos;adresse et collez-la ici. Cliquez sur « Tester » pour que Make reconnaisse la structure des données.</p>
            <p><span className="font-medium text-white">Publier :</span> module « HTTP › Make a request », méthode POST, URL <code className="text-aurora-200">{base}/api/v1/posts</code>, en-tête <code className="text-aurora-200">Authorization: Bearer nbk_…</code>, type de corps « Raw », contenu JSON.</p>
            <p className="text-xs text-slate-400">Les webhooks et les requêtes HTTP sont inclus dans l&apos;offre gratuite de Make.</p>
          </>
        )}
        {tab === "zapier" && (
          <>
            <p><span className="font-medium text-white">Être prévenu :</span> déclencheur « Webhooks by Zapier › Catch Hook », copiez l&apos;adresse et collez-la ici, puis « Tester ».</p>
            <p><span className="font-medium text-white">Publier :</span> action « Webhooks by Zapier › Custom Request », méthode POST, URL <code className="text-aurora-200">{base}/api/v1/posts</code>, en-tête <code className="text-aurora-200">Authorization: Bearer nbk_…</code>.</p>
            <p className="text-xs text-slate-400">Chez Zapier, « Webhooks by Zapier » fait partie de leurs offres payantes (tarif de Zapier, pas de Nebula). Une application Nebula officielle dans Zapier viendra plus tard.</p>
          </>
        )}
        {tab === "code" && (
          <>
            <p>Créer une publication programmée :</p>
            <CodeBlock code={createExample} />
            <p>Vérifier qu&apos;un webhook vient bien de Nebula (Node.js) :</p>
            <CodeBlock code={verifyExample} />
          </>
        )}
        <p className="pt-1 text-xs text-slate-400">Exemple d&apos;événement reçu :</p>
        <CodeBlock code={payloadExample} />
      </div>
    </GlassCard>
  );
}

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/api/v1/me", "Compte lié à la clé (tester la connexion)"],
  ["GET", "/api/v1/brands", "Vos marques"],
  ["GET", "/api/v1/brands/{brandId}/connections", "Comptes connectés d'une marque"],
  ["GET", "/api/v1/posts", "Publications (filtres : brandId, status, from, to, limit, cursor)"],
  ["POST", "/api/v1/posts", "Créer : brouillon, programmée (scheduledAt) ou immédiate (publishNow)"],
  ["GET", "/api/v1/posts/{id}", "Une publication et l'état de chaque réseau"],
  ["DELETE", "/api/v1/posts/{id}", "Supprimer un brouillon ou une publication programmée"],
  ["POST", "/api/v1/media", "Ajouter une image ou une vidéo depuis une adresse https"],
  ["GET", "/api/v1/analytics?brandId=", "Derniers chiffres de chaque compte"],
  ["GET", "/api/v1/ads?brandId=&days=30", "Dépenses et résultats publicitaires (Google, Meta, TikTok Ads)"],
  ["GET", "/api/v1/webhooks", "Vos webhooks"],
  ["POST", "/api/v1/webhooks", "S'abonner à des événements"],
  ["DELETE", "/api/v1/webhooks/{id}", "Se désabonner"]
];

function Reference({ base }: { base: string }) {
  return (
    <GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-medium text-white">Référence de l&apos;API</h2>
        <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="text-xs text-aurora-300 hover:underline">
          Description OpenAPI (JSON) ↗
        </a>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Adresse de base <code className="text-aurora-200">{base}/api/v1</code> · en-tête <code className="text-aurora-200">Authorization: Bearer nbk_…</code> · 120 requêtes par minute et par clé · réponses en JSON, erreurs sous la forme <code className="text-slate-300">{"{ error: { code, message } }"}</code>.
      </p>
      <ul className="mt-3 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
        {ENDPOINTS.map(([method, path, text]) => (
          <li key={`${method} ${path}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span
              className={clsx(
                "w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold",
                method === "GET" ? "bg-emerald-400/15 text-emerald-300" : method === "POST" ? "bg-aurora-400/15 text-aurora-200" : "bg-red-400/15 text-red-300"
              )}
            >
              {method}
            </span>
            <code className="font-mono text-xs text-white">{path}</code>
            <span className="text-xs text-slate-400">{text}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

// --- Page ------------------------------------------------------------------------------

export default function AutomationsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Adresse du site affichée dans les exemples (connue après le chargement).
  const [base, setBase] = useState("https://nebulahub.space");
  useEffect(() => setBase(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/automations/overview", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Overview);
    } catch {
      setError("Impossible de charger vos automatisations pour le moment.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automatisations"
        description="Branchez Nebula à n8n, Make, Zapier ou à vos propres outils : une API pour créer des publications, des webhooks pour être prévenu de ce qui se passe."
      />

      {error && (
        <GlassCard className="border-red-500/30 bg-red-500/[0.06]">
          <p className="text-sm text-red-300">{error}</p>
        </GlassCard>
      )}

      {!data && !error && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {data && !data.access && (
        <GlassCard className="border-aurora-400/30 bg-aurora-400/[0.05]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-base font-medium text-white">Réservé au palier Agence</p>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                Automatisez vos publications et reliez Nebula à vos outils (Slack, Google Sheets, CRM, tableaux de bord…) avec l&apos;API et les webhooks.
              </p>
            </div>
            <UpgradeButton label="Passer à l'Agence" />
          </div>
        </GlassCard>
      )}

      {data && (
        <>
          <KeysSection data={data} reload={load} />
          <WebhooksSection data={data} reload={load} />
        </>
      )}
      <Guides base={base} />
      <Reference base={base} />
    </div>
  );
}
