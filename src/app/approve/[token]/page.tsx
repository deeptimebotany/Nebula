"use client";

// Page publique du workflow d'approbation client — aucune authentification :
// le token dans l'URL fait office de secret d'accès (voir
// /api/public/approvals/[token]). Le client d'une agence ouvre ce lien pour
// consulter les publications à venir de la marque et les approuver ou
// demander des modifications, sans créer de compte Nebula.

import { useEffect, useState } from "react";
import { NETWORK_META, type Network } from "@/lib/types";

interface ApprovalPost {
  id: string;
  title: string;
  caption: string;
  scheduledAt: string | null;
  status: string;
  networks: Network[];
  imageUrl: string | null;
  approval: { status: string; comment: string | null };
}

interface ApprovalData {
  brandName: string;
  logoUrl: string | null;
  posts: ApprovalPost[];
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  PENDING: { label: "En attente", className: "border-white/15 text-slate-400" },
  APPROVED: { label: "Approuvé", className: "border-emerald-400/40 text-emerald-300 bg-emerald-400/[0.08]" },
  CHANGES_REQUESTED: { label: "Modifications demandées", className: "border-amber-400/40 text-amber-300 bg-amber-400/[0.08]" }
};

export default function ApprovalPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<ApprovalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch(`/api/public/approvals/${params.token}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setError(d.error ?? "Lien invalide.");
          return;
        }
        setData(d);
        try {
          const savedName = localStorage.getItem("nebula:approval-name");
          if (savedName) setName(savedName);
        } catch {
          // ignore
        }
      })
      .catch(() => setError("Impossible de charger ce lien."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  async function respond(postId: string, status: "APPROVED" | "CHANGES_REQUESTED") {
    setSubmitting(true);
    try {
      localStorage.setItem("nebula:approval-name", name);
    } catch {
      // ignore
    }
    await fetch(`/api/public/approvals/${params.token}/posts/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, comment: comment.trim() || undefined, respondedName: name.trim() || undefined })
    });
    setSubmitting(false);
    setRespondingId(null);
    setComment("");
    load();
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-sm text-slate-400">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="noise-grid min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-nebula-500 to-accent-cyan text-white">
              {data.brandName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="font-display text-xl font-semibold text-white">{data.brandName}</h1>
            <p className="text-xs text-slate-500">Espace de validation des publications à venir</p>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <label className="mb-1.5 block text-xs text-slate-400">Votre nom (facultatif, affiché à l&apos;agence)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Marie (client)"
            className="w-full max-w-xs rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
          />
        </div>

        {data.posts.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Aucune publication à valider pour l&apos;instant.</p>
        ) : (
          <div className="space-y-3">
            {data.posts.map((p) => {
              const statusInfo = STATUS_LABEL[p.approval.status] ?? STATUS_LABEL.PENDING;
              return (
                <div key={p.id} className="glass-panel flex flex-col gap-3 rounded-2xl p-4 sm:flex-row">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black/40">
                    {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                      {p.scheduledAt && (
                        <span className="text-xs text-slate-500">
                          {new Date(p.scheduledAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      <span className="flex gap-1">
                        {p.networks.map((n, i) => (
                          <span key={i} className="text-[11px]" style={{ color: NETWORK_META[n]?.color }}>
                            {NETWORK_META[n]?.label}
                          </span>
                        ))}
                      </span>
                    </div>
                    {p.title && <p className="mt-1.5 text-sm font-medium text-white">{p.title}</p>}
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-400">{p.caption || "(sans description)"}</p>
                    {p.approval.comment && (
                      <p className="mt-1.5 rounded-lg bg-white/[0.03] p-2 text-xs text-slate-400">
                        💬 {p.approval.comment}
                      </p>
                    )}

                    {respondingId === p.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          rows={2}
                          placeholder="Commentaire (facultatif)..."
                          className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => respond(p.id, "APPROVED")}
                            disabled={submitting}
                            className="rounded-lg border border-emerald-400/40 bg-emerald-400/[0.08] px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/[0.14] disabled:opacity-50"
                          >
                            ✓ Approuver
                          </button>
                          <button
                            onClick={() => respond(p.id, "CHANGES_REQUESTED")}
                            disabled={submitting}
                            className="rounded-lg border border-amber-400/40 bg-amber-400/[0.08] px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-400/[0.14] disabled:opacity-50"
                          >
                            Demander une modification
                          </button>
                          <button
                            onClick={() => setRespondingId(null)}
                            className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-white"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRespondingId(p.id)}
                        className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-aurora-400/40 hover:text-white"
                      >
                        Répondre
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="pt-4 text-center text-xs text-slate-600">Propulsé par Nebula</p>
      </div>
    </main>
  );
}
