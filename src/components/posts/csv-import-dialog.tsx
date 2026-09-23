"use client";

// Import CSV de publications (brief growth, lot G6.a), en trois étapes dans
// une modale (élément de produit, jamais un toast) :
//   1. dépôt du fichier (2 000 lignes, 2 Mo max), analyse dans le navigateur ;
//   2. aperçu et mappage des colonnes, en-têtes Buffer et Metricool
//      reconnus automatiquement, mappage manuel en filet ;
//   3. choix de la marque et des comptes cibles par réseau ;
// puis import : brouillons créés avec leur date/heure dans le fuseau de la
// marque, jamais programmés ; récapitulatif « n brouillons créés, m lignes
// ignorées » avec la raison par ligne.
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useBrand } from "@/components/brand-context";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { NetworkDot } from "@/components/ui/network-badge";
import { detectFormat, parseCsv, readRow, type CsvNetwork, type DetectedFormat, type Field, type ImportRow, type ParsedCsv } from "@/lib/import/csv";
import { NETWORK_META, NETWORKS, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

const FIELD_LABELS: { key: Field; label: string; hint?: string }[] = [
  { key: "datetime", label: "Date et heure (une colonne)" },
  { key: "date", label: "Date" },
  { key: "time", label: "Heure" },
  { key: "text", label: "Texte / légende" },
  { key: "title", label: "Titre (YouTube, TikTok)" },
  { key: "firstComment", label: "Premier commentaire" },
  { key: "mediaUrl", label: "URL du média" },
  { key: "networks", label: "Réseau(x) (liste dans une colonne)" }
];

const SOURCE_LABEL: Record<DetectedFormat["source"], string> = {
  buffer: "Export Buffer reconnu",
  metricool: "Export Metricool reconnu",
  generic: "Colonnes libres : vérifiez le mappage"
};

interface Connection {
  id: string;
  network: Network;
  displayName: string;
  handle?: string | null;
}

type Step = 1 | 2 | 3 | 4;

export function CsvImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { brands, activeBrand } = useBrand();
  const upgrade = useUpgradeModal();
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fmt, setFmt] = useState<DetectedFormat | null>(null);
  const [brandId, setBrandId] = useState<string>("");
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [defaultNetworks, setDefaultNetworks] = useState<Network[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: { index: number; reason: string }[] } | null>(null);

  // Réinitialisation à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setFileName("");
    setParsed(null);
    setFmt(null);
    setBrandId(activeBrand?.id ?? "");
    setConnections(null);
    setChosen({});
    setDefaultNetworks([]);
    setError(null);
    setResult(null);
  }, [open, activeBrand?.id]);

  // Comptes de la marque choisie (étape 3).
  useEffect(() => {
    if (!open || step !== 3 || !brandId) return;
    let cancelled = false;
    setConnections(null);
    fetch(`/api/connections?brandId=${brandId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((d) => {
        if (cancelled) return;
        const list: Connection[] = (d.connections ?? []).filter((c: Connection) => NETWORKS.includes(c.network));
        setConnections(list);
        // Par défaut : tous les comptes cochés.
        setChosen(Object.fromEntries(list.map((c) => [c.id, true])));
      })
      .catch(() => !cancelled && setConnections([]));
    return () => {
      cancelled = true;
    };
  }, [open, step, brandId]);

  const rows: ImportRow[] = useMemo(() => {
    if (!parsed || !fmt) return [];
    return parsed.rows.map((cells, i) => readRow(cells, i + 1, fmt));
  }, [parsed, fmt]);

  const rowsWithoutNetwork = useMemo(() => rows.filter((r) => !r.problem && r.networks.length === 0).length, [rows]);
  const readable = useMemo(() => rows.filter((r) => !r.problem).length, [rows]);

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Fichier trop volumineux (2 Mo maximum).");
      return;
    }
    if (!/\.csv$|\.txt$/i.test(file.name) && !/csv|text/.test(file.type)) {
      setError("Déposez un fichier CSV (export de votre outil actuel ou tableau enregistré en CSV).");
      return;
    }
    const text = await file.text();
    const p = parseCsv(text, MAX_ROWS + 1);
    if (p.headers.length === 0 || p.rows.length === 0) {
      setError("Le fichier semble vide : il faut une ligne d'en-têtes puis une ligne par publication.");
      return;
    }
    if (p.rows.length > MAX_ROWS) {
      setError(`Trop de lignes : ${MAX_ROWS} maximum par import. Coupez le fichier en plusieurs parties.`);
      return;
    }
    setFileName(file.name);
    setParsed(p);
    setFmt(detectFormat(p.headers));
    setStep(2);
  }

  function setField(field: Field, idx: string) {
    if (!fmt) return;
    const next = { ...fmt.mapping };
    if (idx === "") delete next[field];
    else next[field] = Number(idx);
    setFmt({ ...fmt, mapping: next });
  }

  function setNetworkColumn(net: CsvNetwork, idx: string) {
    if (!fmt) return;
    const next = { ...fmt.networkColumns };
    if (idx === "") delete next[net];
    else next[net] = Number(idx);
    setFmt({ ...fmt, networkColumns: next });
  }

  async function runImport() {
    if (!brandId || !connections) return;
    setBusy(true);
    setError(null);
    try {
      const targets: Record<string, string[]> = {};
      for (const c of connections) {
        if (!chosen[c.id]) continue;
        (targets[c.network] ??= []).push(c.id);
      }
      const payload = rows
        .filter((r) => !r.problem)
        .map((r) => ({ index: r.index, title: r.title, caption: r.caption, firstComment: r.firstComment, mediaUrl: r.mediaUrl, networks: r.networks, wallClock: r.wallClock }));
      const res = await fetch("/api/posts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, targets, defaultNetworks, rows: payload }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        upgrade.openFromResponse(res.status, data);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Import impossible.");
      const skippedClient = rows.filter((r) => r.problem).map((r) => ({ index: r.index, reason: r.problem as string }));
      setResult({ created: data.created, skipped: [...skippedClient, ...(data.skipped ?? [])].sort((a, b) => a.index - b.index) });
      setStep(4);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const networksInRows = useMemo(() => {
    const set = new Set<Network>();
    for (const r of rows) for (const n of r.networks) set.add(n);
    for (const n of defaultNetworks) set.add(n);
    return set;
  }, [rows, defaultNetworks]);

  return (
    <Modal open={open} onClose={onClose} title="Importer des publications" maxWidthClassName="max-w-3xl">
      <ol className="mb-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide" aria-label="Étapes">
        {["Fichier", "Colonnes", "Comptes", "Résultat"].map((label, i) => (
          <li key={label} className={clsx("rounded-full border px-2.5 py-1", step === i + 1 ? "border-aurora-400 text-white" : step > i + 1 ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-slate-500")}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div>
          <p className="text-sm text-slate-400">Déposez l&apos;export CSV de votre outil actuel (Buffer, Metricool, ou un tableau avec vos colonnes). Les publications arrivent en brouillon, avec leur date : rien n&apos;est programmé sans vous.</p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center transition hover:border-aurora-400/50" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}>
            <span className="text-sm font-medium text-white">Glissez votre fichier ici ou cliquez pour le choisir</span>
            <span className="mt-1 text-xs text-slate-500">CSV · 2 000 lignes · 2 Mo maximum</span>
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <details className="mt-4 text-xs text-slate-500">
            <summary className="cursor-pointer text-slate-400">Quelles colonnes sont comprises ?</summary>
            <p className="mt-2 leading-relaxed">Buffer : « Text », « Image URL », « Posting Time ». Metricool : « Text », « Date », « Time », une colonne par réseau, « Picture Url 1 », « First Comment Text ». Autres outils (Later n&apos;exporte pas de CSV natif) : une ligne d&apos;en-têtes avec, au choix, date, heure, texte, titre, réseau, URL du média, premier commentaire — vous confirmez le mappage à l&apos;étape suivante.</p>
          </details>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        </div>
      )}

      {step === 2 && parsed && fmt && (
        <div>
          <p className="text-sm text-slate-300">
            <span className="font-medium text-white">{fileName}</span> · {parsed.rows.length} ligne{parsed.rows.length > 1 ? "s" : ""} · <span className={fmt.source === "generic" ? "text-amber-200" : "text-emerald-300"}>{SOURCE_LABEL[fmt.source]}</span>
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELD_LABELS.map((f) => (
              <Select key={f.key} label={f.label} value={fmt.mapping[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)}>
                <option value="">— ignorer —</option>
                {parsed.headers.map((h, i) => (
                  <option key={`${h}-${i}`} value={i}>
                    {h || `(colonne ${i + 1})`}
                  </option>
                ))}
              </Select>
            ))}
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Une colonne « oui/non » par réseau (facultatif)</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {NETWORKS.map((n) => (
              <Select key={n} label={NETWORK_META[n].label} value={fmt.networkColumns[n] ?? ""} onChange={(e) => setNetworkColumn(n, e.target.value)}>
                <option value="">—</option>
                {parsed.headers.map((h, i) => (
                  <option key={`${h}-${i}`} value={i}>
                    {h || `(colonne ${i + 1})`}
                  </option>
                ))}
              </Select>
            ))}
          </div>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Aperçu (5 premières lignes)</p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-white/[0.03] text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Date · heure</th>
                  <th className="px-3 py-2 font-medium">Titre</th>
                  <th className="px-3 py-2 font-medium">Texte</th>
                  <th className="px-3 py-2 font-medium">Réseaux</th>
                  <th className="px-3 py-2 font-medium">Média</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {rows.slice(0, 5).map((r) => (
                  <tr key={r.index} className={r.problem ? "text-amber-200" : "text-slate-300"}>
                    <td className="px-3 py-2">{r.index}</td>
                    <td className="px-3 py-2 tabular-nums">{r.wallClock ? r.wallClock.replace("T", " · ") : r.problem === "date illisible" ? "illisible" : "—"}</td>
                    <td className="max-w-[140px] truncate px-3 py-2">{r.title || "—"}</td>
                    <td className="max-w-[240px] truncate px-3 py-2">{r.caption || "—"}</td>
                    <td className="px-3 py-2">{r.networks.length ? r.networks.map((n) => NETWORK_META[n].label).join(", ") : "—"}</td>
                    <td className="px-3 py-2">{r.mediaUrl ? "URL" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {readable} ligne{readable > 1 ? "s" : ""} lisible{readable > 1 ? "s" : ""} sur {rows.length}
            {rowsWithoutNetwork > 0 && ` · ${rowsWithoutNetwork} sans réseau indiqué (vous choisirez à l'étape suivante)`}. Les dates sont interprétées dans le fuseau de la marque.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <button type="button" onClick={() => setStep(1)} className="text-sm text-slate-400 hover:text-white">
              ← Autre fichier
            </button>
            <Button onClick={() => setStep(3)} disabled={readable === 0}>
              Continuer
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <Select label="Marque de destination" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>

          {rowsWithoutNetwork > 0 && (
            <fieldset className="mt-4">
              <legend className="text-xs text-slate-400">
                {rowsWithoutNetwork} ligne{rowsWithoutNetwork > 1 ? "s" : ""} sans réseau : les créer pour
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {NETWORKS.map((n) => {
                  const on = defaultNetworks.includes(n);
                  return (
                    <button key={n} type="button" aria-pressed={on} onClick={() => setDefaultNetworks((prev) => (on ? prev.filter((x) => x !== n) : [...prev, n]))} className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition", on ? "border-aurora-400 bg-aurora-400/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
                      <NetworkDot network={n} /> {NETWORK_META[n].label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Comptes cibles</p>
          {connections === null ? (
            <p className="mt-2 text-sm text-slate-500">Chargement des comptes…</p>
          ) : connections.length === 0 ? (
            <p className="mt-2 text-sm text-amber-200">Aucun compte connecté sur cette marque : connectez d&apos;abord vos réseaux (page Comptes), puis relancez l&apos;import.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {connections.map((c) => {
                const needed = networksInRows.has(c.network);
                return (
                  <li key={c.id}>
                    <label className={clsx("flex items-center gap-3 rounded-xl border px-3 py-2 text-sm", needed ? "border-white/10" : "border-white/[0.04] opacity-60")}>
                      <input type="checkbox" checked={Boolean(chosen[c.id])} onChange={(e) => setChosen((prev) => ({ ...prev, [c.id]: e.target.checked }))} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                      <NetworkDot network={c.network} />
                      <span className="text-white">{c.displayName}</span>
                      {c.handle && <span className="text-xs text-slate-500">{c.handle}</span>}
                      {!needed && <span className="ml-auto text-[11px] text-slate-500">aucune ligne pour ce réseau</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <div className="mt-5 flex items-center justify-between">
            <button type="button" onClick={() => setStep(2)} className="text-sm text-slate-400 hover:text-white">
              ← Colonnes
            </button>
            <Button onClick={runImport} disabled={busy || !connections || connections.length === 0 || !Object.values(chosen).some(Boolean)}>
              {busy ? "Import en cours…" : `Créer ${readable} brouillon${readable > 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div>
          <p className="text-lg font-medium text-white">
            {result.created} brouillon{result.created > 1 ? "s" : ""} créé{result.created > 1 ? "s" : ""}, {result.skipped.length} ligne{result.skipped.length > 1 ? "s" : ""} ignorée{result.skipped.length > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-sm text-slate-400">Retrouvez-les dans l&apos;onglet « Brouillons » : vérifiez le texte et le média, puis programmez. Les médias référencés par URL sont récupérés en arrière-plan dans les minutes qui suivent.</p>
          {result.skipped.length > 0 && (
            <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-white/[0.03] text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Ligne</th>
                    <th className="px-3 py-2 font-medium">Raison</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-slate-300">
                  {result.skipped.map((s) => (
                    <tr key={`${s.index}-${s.reason}`}>
                      <td className="px-3 py-2 tabular-nums">{s.index}</td>
                      <td className="px-3 py-2">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <Button onClick={onClose}>Fermer</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
