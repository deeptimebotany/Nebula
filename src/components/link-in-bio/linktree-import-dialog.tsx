"use client";

// « Importer depuis Linktree » (brief growth, lot G6.b) : l'utilisateur
// colle une adresse linktr.ee/…, le serveur lit la page publique, on propose
// la liste à cocher, puis les liens sont créés. Au-delà de la limite du
// palier, les liens sont créés désactivés et UpgradeModal(links_limit)
// s'ouvre. Modale de produit (jamais un toast) ; confirmation dans la page.
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { clsx } from "@/lib/clsx";

interface FoundLink {
  label: string;
  url: string;
}

export function LinktreeImportDialog({ open, onClose, brandId, maxBioLinks, currentCount, onImported }: { open: boolean; onClose: () => void; brandId: string; maxBioLinks: number; currentCount: number; onImported: () => void }) {
  const upgrade = useUpgradeModal();
  const [url, setUrl] = useState("");
  const [links, setLinks] = useState<FoundLink[] | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [busy, setBusy] = useState<"fetch" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; disabled: number; duplicates: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setLinks(null);
    setChecked([]);
    setBusy(null);
    setError(null);
    setResult(null);
  }, [open]);

  async function fetchLinks() {
    setBusy("fetch");
    setError(null);
    try {
      const res = await fetch(`/api/link-in-bio/import-linktree?url=${encodeURIComponent(url.trim())}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Lecture impossible.");
      setLinks(d.links);
      setChecked(d.links.map(() => true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function importLinks() {
    if (!links) return;
    const selected = links.filter((_, i) => checked[i]);
    if (selected.length === 0) return;
    setBusy("import");
    setError(null);
    try {
      const res = await fetch("/api/link-in-bio/import-linktree", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, links: selected }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Import impossible.");
      setResult({ created: d.created, disabled: d.disabled, duplicates: d.duplicates });
      onImported();
      if (d.disabled > 0) upgrade.open("links_limit");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const selectedCount = checked.filter(Boolean).length;
  const beyond = Math.max(0, currentCount + selectedCount - maxBioLinks);

  return (
    <Modal open={open} onClose={onClose} title="Importer depuis Linktree" maxWidthClassName="max-w-xl">
      {result ? (
        <div>
          <p className="text-lg font-medium text-white">
            {result.created} lien{result.created > 1 ? "s" : ""} importé{result.created > 1 ? "s" : ""}
            {result.duplicates > 0 && `, ${result.duplicates} déjà présent${result.duplicates > 1 ? "s" : ""}`}
          </p>
          {result.disabled > 0 && <p className="mt-2 text-sm text-amber-200">{result.disabled} lien{result.disabled > 1 ? "s" : ""} au-delà de la limite de votre palier {result.disabled > 1 ? "ont été créés désactivés" : "a été créé désactivé"} (conservé{result.disabled > 1 ? "s" : ""}, grisé{result.disabled > 1 ? "s" : ""} « Pro » dans la liste).</p>}
          <div className="mt-5 flex justify-end">
            <Button onClick={onClose}>Fermer</Button>
          </div>
        </div>
      ) : links === null ? (
        <div>
          <p className="text-sm text-slate-400">Collez l&apos;adresse de votre page Linktree : Nebula lit ses liens publics et vous les propose à cocher. Rien n&apos;est modifié chez Linktree.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Adresse Linktree" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url.trim() && fetchLinks()} placeholder="linktr.ee/votre-nom" inputMode="url" wrapperClassName="flex-1" />
            <Button onClick={fetchLinks} disabled={busy === "fetch" || !url.trim()} className="shrink-0">
              {busy === "fetch" ? "Lecture…" : "Lire la page"}
            </Button>
          </div>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-sm text-slate-400">
            {links.length} lien{links.length > 1 ? "s" : ""} trouvé{links.length > 1 ? "s" : ""}. Décochez ceux que vous ne voulez pas.
          </p>
          <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {links.map((l, i) => (
              <li key={l.url}>
                <label className={clsx("flex items-start gap-3 rounded-xl border px-3 py-2 text-sm", checked[i] ? "border-white/10" : "border-white/[0.04] opacity-60")}>
                  <input type="checkbox" checked={checked[i]} onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent" />
                  <span className="min-w-0">
                    <span className="block truncate text-white">{l.label}</span>
                    <span className="block truncate text-xs text-slate-500">{l.url}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {beyond > 0 && <p className="mt-3 text-xs text-amber-200">Votre palier affiche {maxBioLinks} liens : {beyond} de ces liens {beyond > 1 ? "seront créés désactivés" : "sera créé désactivé"} (conservés, activables en passant en Pro).</p>}
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <div className="mt-5 flex items-center justify-between">
            <button type="button" onClick={() => setLinks(null)} className="text-sm text-slate-400 hover:text-white">
              ← Autre adresse
            </button>
            <Button onClick={importLinks} disabled={busy === "import" || selectedCount === 0}>
              {busy === "import" ? "Import…" : `Importer ${selectedCount} lien${selectedCount > 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
