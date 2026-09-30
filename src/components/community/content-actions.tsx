"use client";

// Actions sur un contenu de la Communauté (30/09/2026) : « Signaler » (motif
// au choix + texte libre facultatif, une fois par personne et par contenu)
// et « Supprimer » (son auteur, ou le propriétaire du site, après
// confirmation). Voir src/lib/community/moderation.ts.
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { IconAlert, IconClose } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason, type ReportTargetType } from "@/lib/community/report-reasons";

const WHAT: Record<ReportTargetType, { the: string; this: string; moderator: string }> = {
  THREAD: { the: "la discussion", this: "cette discussion", moderator: "Vous la retirez en tant que propriétaire de Nebula. " },
  REPLY: { the: "la réponse", this: "cette réponse", moderator: "Vous la retirez en tant que propriétaire de Nebula. " },
  VIDEO: { the: "le lien partagé", this: "ce lien partagé", moderator: "Vous le retirez en tant que propriétaire de Nebula. " }
};

const DELETE_URL: Record<ReportTargetType, (id: string, threadId?: string) => string> = {
  THREAD: (id) => `/api/community/threads/${id}`,
  REPLY: (id, threadId) => `/api/community/threads/${threadId}/replies/${id}`,
  VIDEO: (id) => `/api/community/videos/${id}`
};

export interface ContentActionsProps {
  type: ReportTargetType;
  id: string;
  /** Sujet parent (réponses). */
  threadId?: string;
  /** Contenu écrit par la personne connectée. */
  mine: boolean;
  /** Propriétaire du site : peut supprimer tout contenu. */
  canModerate: boolean;
  /** Déjà signalé par la personne connectée. */
  reported: boolean;
  onReported?: () => void;
  onDeleted?: () => void;
  className?: string;
}

export function ContentActions({ type, id, threadId, mine, canModerate, reported, onReported, onDeleted, className }: ContentActionsProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canDelete = mine || canModerate;

  async function remove() {
    const asModerator = !mine && canModerate;
    const ok = await confirm({
      title: `Supprimer ${WHAT[type].this} ?`,
      message: `${asModerator ? WHAT[type].moderator : ""}${type === "THREAD" ? "Ses réponses seront supprimées aussi. " : ""}Action définitive.`,
      confirmLabel: "Supprimer",
      danger: true
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(DELETE_URL[type](id, threadId), { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Suppression impossible pour le moment.");
        return;
      }
      toast.success(type === "THREAD" ? "Discussion supprimée." : type === "REPLY" ? "Réponse supprimée." : "Partage retiré.");
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={clsx("flex items-center gap-3 text-xs", className)}>
      {!mine &&
        (reported ? (
          <span className="text-slate-500" title="Vous avez déjà signalé ce contenu.">
            Signalé
          </span>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-slate-400 transition hover:text-amber-200">
            <IconAlert className="h-3.5 w-3.5" /> Signaler
          </button>
        ))}
      {canDelete && (
        <button type="button" onClick={remove} disabled={deleting} className="inline-flex items-center gap-1 text-slate-400 transition hover:text-red-300 disabled:opacity-50">
          <IconClose className="h-3.5 w-3.5" /> {deleting ? "Suppression…" : "Supprimer"}
        </button>
      )}
      {open && (
        <ReportDialog
          type={type}
          id={id}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onReported?.();
          }}
        />
      )}
    </div>
  );
}

function ReportDialog({ type, id, onClose, onDone }: { type: ReportTargetType; id: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/community/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: type, targetId: id, reason, details: details.trim() || undefined })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; already?: boolean };
      if (!res.ok && !data.already) {
        setError(data.error ?? "Signalement impossible pour le moment.");
        return;
      }
      toast.success(data.already ? "Vous aviez déjà signalé ce contenu." : "Merci : le signalement a été transmis à l'équipe Nebula.");
      onDone();
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Signaler ${WHAT[type].the}`} maxWidthClassName="max-w-md">
      <fieldset>
        <legend className="mb-2 text-sm text-slate-300">Pourquoi ce contenu pose-t-il problème ?</legend>
        <div className="space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <label
              key={r.id}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition",
                reason === r.id ? "border-aurora-400/50 bg-aurora-400/[0.06] text-white" : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
              )}
            >
              <input type="radio" name={`report-${id}`} className="accent-aurora-500" checked={reason === r.id} onChange={() => setReason(r.id)} />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`report-details-${id}`} className="mt-4 block text-xs text-slate-400">
        Précisions (facultatif)
      </label>
      <textarea
        id={`report-details-${id}`}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={REPORT_DETAILS_MAX}
        rows={3}
        placeholder="Ce qui ne va pas, en quelques mots"
        className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
      />
      <p className="mt-1 text-right text-[11px] text-slate-500">
        {details.length} / {REPORT_DETAILS_MAX}
      </p>
      {error && (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">L&apos;équipe Nebula lit chaque signalement. La personne signalée ne sait pas qui l&apos;a signalée.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={send} disabled={!reason || sending}>
          {sending ? "Envoi…" : "Envoyer le signalement"}
        </Button>
      </div>
    </Modal>
  );
}
