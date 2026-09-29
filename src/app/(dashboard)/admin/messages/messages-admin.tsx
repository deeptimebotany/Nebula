"use client";

// Messages du formulaire de contact (29/09/2026) : tout message envoyé depuis
// /contact arrive ici, même si l'e-mail de copie n'a pas pu partir.
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { IconMessage } from "@/components/dashboard/icons";
import { useConfirm } from "@/components/dashboard/confirm";

type Filter = "a-traiter" | "traites" | "tous";

interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  emailSent: boolean;
  handledAt: string | null;
  createdAt: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function replyHref(m: ContactMessageRow): string {
  const subject = encodeURIComponent(`Re : ${m.subject} — Nebula`);
  const quoted = m.message
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const body = encodeURIComponent(`Bonjour ${m.name},\n\n\n\n—\nVotre message du ${fmt(m.createdAt)} :\n${quoted}`);
  return `mailto:${m.email}?subject=${subject}&body=${body}`;
}

export function MessagesAdmin() {
  const [filter, setFilter] = useState<Filter>("a-traiter");
  const [messages, setMessages] = useState<ContactMessageRow[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async (f: Filter) => {
    setError(null);
    const res = await fetch(`/api/admin/messages?filtre=${f}`, { cache: "no-store" }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError("Impossible de charger les messages.");
      setMessages([]);
      return;
    }
    setMessages(d.messages);
    setPending(d.pending);
  }, []);

  useEffect(() => {
    setMessages(null);
    void load(filter);
  }, [filter, load]);

  async function setHandled(id: string, handled: boolean) {
    await fetch("/api/admin/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, handled }) });
    await load(filter);
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Supprimer ce message ?", message: "Il sera effacé définitivement.", confirmLabel: "Supprimer", danger: true }))) return;
    await fetch("/api/admin/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await load(filter);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconMessage className="h-5 w-5" />}
        title="Messages"
        description="Tout ce qui est envoyé depuis le formulaire de contact du site. Répondez depuis votre messagerie, puis marquez le message comme traité. Les messages sont effacés 12 mois après réception."
      />

      <Tabs
        items={[
          { value: "a-traiter", label: "À traiter", badge: pending > 0 ? <Badge tone="info">{pending}</Badge> : undefined },
          { value: "traites", label: "Traités" },
          { value: "tous", label: "Tous" }
        ]}
        value={filter}
        onChange={setFilter}
        variant="line"
        aria-label="Filtrer les messages"
      />

      {error && <p className="text-sm text-red-300">{error}</p>}
      {messages === null ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : messages.length === 0 ? (
        <GlassCard hover={false}>
          <p className="text-sm text-slate-400">{filter === "a-traiter" ? "Aucun message en attente." : "Aucun message."}</p>
        </GlassCard>
      ) : (
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id}>
              <GlassCard hover={false}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-medium text-white">{m.subject}</h2>
                    <p className="mt-0.5 break-words text-sm text-slate-400">
                      {m.name} · <a href={`mailto:${m.email}`} className="text-aurora-300 hover:underline">{m.email}</a> · {fmt(m.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {m.handledAt ? <Badge tone="success">Traité</Badge> : <Badge tone="info">À traiter</Badge>}
                    {!m.emailSent && <Badge tone="warning">Copie e-mail non partie</Badge>}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-200">{m.message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={replyHref(m)} className={buttonClasses("glow")}>
                    Répondre
                  </a>
                  <Button variant="outline" onClick={() => void setHandled(m.id, !m.handledAt)}>
                    {m.handledAt ? "Remettre à traiter" : "Marquer comme traité"}
                  </Button>
                  <Button variant="ghost" onClick={() => void remove(m.id)}>
                    Supprimer
                  </Button>
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
