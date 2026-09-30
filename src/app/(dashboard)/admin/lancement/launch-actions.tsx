"use client";

// Actions de la page propriétaire « Lancement » (30/09/2026) : ajouter les
// adresses reçues par e-mail, exporter la liste, envoyer l'annonce de
// l'ouverture (par paquets), retirer une adresse.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/dashboard/confirm";
import { IconClose, IconDownload, IconSend } from "@/components/dashboard/icons";

type Status = { kind: "ok" | "error"; text: string } | null;

export function LaunchActions({ open, pending, batch }: { open: boolean; pending: number; batch: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState<"add" | "announce" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  async function post(body: object) {
    const res = await fetch("/api/admin/lancement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    return { ok: Boolean(res?.ok), data: data as Record<string, unknown> };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setStatus(null);
    const { ok, data } = await post({ action: "add", emails });
    setBusy(null);
    if (!ok) {
      setStatus({ kind: "error", text: typeof data.error === "string" ? data.error : "Ajout impossible." });
      return;
    }
    const found = Number(data.found ?? 0);
    const added = Number(data.added ?? 0);
    setStatus({ kind: "ok", text: `${added} adresse${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}${found > added ? ` (${found - added} déjà dans la liste)` : ""}.` });
    setEmails("");
    router.refresh();
  }

  async function announce() {
    const count = Math.min(pending, batch);
    const ok = await confirm({
      title: "Envoyer l'annonce de l'ouverture ?",
      message: `${count} personne${count > 1 ? "s" : ""} vont recevoir l'e-mail « Nebula est ouvert ! ». Chaque adresse ne le reçoit qu'une fois.${pending > batch ? ` Il en restera ${pending - batch} : recliquez demain (palier gratuit de Resend : 100 e-mails par jour).` : ""}`,
      confirmLabel: "Envoyer"
    });
    if (!ok) return;
    setBusy("announce");
    setStatus(null);
    const { data } = await post({ action: "announce" });
    setBusy(null);
    const sent = Number(data.sent ?? 0);
    const remaining = Number(data.remaining ?? 0);
    const error = typeof data.error === "string" ? data.error : null;
    setStatus({
      kind: error && sent === 0 ? "error" : "ok",
      text: `${sent} e-mail${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}, ${remaining} encore à prévenir.${error ? ` ${error}` : ""}`
    });
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-5">
      <form onSubmit={add}>
        <label htmlFor="launch-add" className="text-sm font-medium text-white">
          Ajouter des adresses reçues par e-mail
        </label>
        <p className="mt-0.5 text-xs text-slate-500">Collez une ou plusieurs adresses (une par ligne, ou séparées par des virgules).</p>
        <textarea
          id="launch-add"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={3}
          placeholder={"prenom@exemple.fr\nautre@exemple.com"}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
        />
        <Button type="submit" variant="outline" disabled={busy !== null || !emails.trim()} className="mt-2">
          {busy === "add" ? "Ajout…" : "Ajouter à la liste"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
        <a href="/api/admin/lancement" className={buttonClasses("ghost")} download>
          <IconDownload className="h-4 w-4" />
          Exporter en CSV
        </a>
        <Button onClick={announce} disabled={!open || pending === 0 || busy !== null}>
          <IconSend className="h-4 w-4" />
          {busy === "announce" ? "Envoi…" : "Annoncer l'ouverture"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        {open
          ? pending === 0
            ? "Tout le monde a été prévenu."
            : `L'annonce part aux ${Math.min(pending, batch)} premières personnes pas encore prévenues (${batch} au plus par clic).`
          : "L'annonce s'active une fois le site ouvert (NEXT_PUBLIC_SITE_OPEN=true dans Vercel, puis redéployer)."}
      </p>

      {status && (
        <p role={status.kind === "error" ? "alert" : "status"} className={status.kind === "error" ? "text-sm text-red-300" : "text-sm text-emerald-300"}>
          {status.text}
        </p>
      )}
    </div>
  );
}

export function LaunchRemoveButton({ email }: { email: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!(await confirm({ title: "Retirer cette adresse ?", message: `${email} ne recevra pas l'annonce de l'ouverture.`, confirmLabel: "Retirer", danger: true }))) return;
    setBusy(true);
    await fetch("/api/admin/lancement", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  return (
    <button type="button" onClick={remove} disabled={busy} aria-label={`Retirer ${email}`} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-red-300 disabled:opacity-50">
      <IconClose className="h-4 w-4" />
    </button>
  );
}
