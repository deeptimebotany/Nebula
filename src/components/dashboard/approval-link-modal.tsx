"use client";

// Workflow d'approbation client (palier Agence) : génère un lien externe,
// sans compte Nebula requis, que l'agence transmet à son client pour qu'il
// valide ou commente les publications à venir de sa marque (voir la page
// publique /approve/[token] et l'API /api/public/approvals/[token]).

import { useEffect, useState } from "react";
import { useToast } from "@/components/dashboard/toast";
import { Button } from "@/components/ui/button";
import { IconClose, IconLink } from "@/components/dashboard/icons";

interface ApprovalLinkRow {
  id: string;
  token: string;
  label: string;
  createdAt: string;
}

export function ApprovalLinkModal({ brandId, onClose }: { brandId: string; onClose: () => void }) {
  const toast = useToast();
  const [links, setLinks] = useState<ApprovalLinkRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function load() {
    fetch(`/api/approvals?brandId=${brandId}`)
      .then((r) => r.json())
      .then((d) => setLinks(d.links ?? []));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function createLink() {
    setCreating(true);
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, label: label.trim() || undefined })
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors de la création du lien.");
      return;
    }
    setLabel("");
    load();
  }

  async function revoke(id: string) {
    await fetch(`/api/approvals/${id}`, { method: "DELETE" });
    load();
  }

  function urlFor(token: string) {
    return `${typeof window !== "undefined" ? window.location.origin : ""}/approve/${token}`;
  }

  async function copy(id: string, token: string) {
    await navigator.clipboard.writeText(urlFor(token));
    setCopiedId(id);
    toast.success("Lien copié.");
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="glass-panel relative z-10 w-full max-w-lg rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
            <IconLink className="h-4 w-4 text-slate-400" /> Lien d&apos;approbation client
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-400">
          Créez un lien à transmettre à votre client : il pourra consulter les brouillons et publications
          programmées de cette marque, puis les approuver ou demander des modifications — sans créer de compte
          Nebula.
        </p>

        <div className="mb-4 flex items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nom du lien (ex : Client Dupont)"
            className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
          />
          <Button onClick={createLink} disabled={creating}>
            {creating ? "Création..." : "Générer"}
          </Button>
        </div>

        {!links ? (
          <p className="text-sm text-slate-500">Chargement...</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun lien actif pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{l.label}</p>
                  <p className="truncate text-xs text-slate-500">{urlFor(l.token)}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" onClick={() => copy(l.id, l.token)}>
                    {copiedId === l.id ? "Copié !" : "Copier"}
                  </Button>
                  <Button variant="danger" onClick={() => revoke(l.id)}>
                    Révoquer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
