"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { IconCheck } from "@/components/dashboard/icons";

const SUBJECTS = [
  { value: "question", label: "Question générale" },
  { value: "tarifs", label: "Tarifs et abonnement" },
  { value: "support", label: "Aide sur mon compte" },
  { value: "partenariat", label: "Partenariat / presse" },
  { value: "autre", label: "Autre" }
];

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "question", message: "", website: "" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, turnstileToken: turnstileToken ?? undefined })
    }).catch(() => null);
    setLoading(false);
    if (!res) {
      setError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Une erreur est survenue, réessayez.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
          <IconCheck className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold text-white">Message envoyé</h2>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          Merci {form.name.trim()}. Nous vous répondons à {form.email.trim()} dès que possible.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Votre nom"
          name="name"
          autoComplete="name"
          required
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          placeholder="Alex Martin"
        />
        <Input
          label="Votre email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
          placeholder="vous@marque.com"
          hint="Uniquement pour vous répondre."
        />
      </div>
      <Select label="Sujet" name="subject" value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))}>
        {SUBJECTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <Textarea
        label="Votre message"
        name="message"
        required
        minLength={20}
        rows={6}
        value={form.message}
        onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))}
        placeholder="Décrivez votre demande : votre activité, ce que vous cherchez à faire, ce qui bloque…"
        hint={`${form.message.trim().length} / 4000 caractères`}
      />
      {/* Champ piège pour les robots : invisible et ignoré par les lecteurs d'écran. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Site web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm((s) => ({ ...s, website: e.target.value }))} />
        </label>
      </div>
      <TurnstileWidget onVerify={setTurnstileToken} />
      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          En envoyant ce formulaire, vous acceptez que ces informations servent uniquement à vous répondre.
        </p>
        <Button type="submit" disabled={loading} className="shrink-0 whitespace-nowrap sm:w-auto">
          {loading ? "Envoi..." : "Envoyer le message"}
        </Button>
      </div>
    </form>
  );
}
