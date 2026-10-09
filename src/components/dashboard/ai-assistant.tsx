"use client";

// Tiroir « Demander à Nebula » — l'assistant IA du dashboard, inspiré de
// l'ergonomie « Demander à Studio » de YouTube Studio :
//   - un tiroir qui glisse depuis la droite (plein écran sur téléphone) ;
//   - un accueil personnalisé (« Bonjour <prénom> » + phrase qui dit ce que
//     l'assistant sait faire SUR CET ONGLET) ;
//   - une liste verticale de suggestions cliquables, propres à l'onglet, et
//     un bouton « Autres suggestions › » qui fait défiler la réserve ;
//   - une barre de saisie fixée en bas, avec la mention légale.
//
// Le contexte (onglet actif) vient du provider (ai-assistant-context.tsx) :
// changer de page change instantanément l'accueil et les suggestions, sans
// aucun appel réseau — tout est statique dans assistant-contexts.ts. Seul
// l'envoi d'une question consomme le quota Gemini (voir /api/ai/chat).
//
// Conversation (09/10/2026, demande de Lucas, version 2) : elle reste quand
// on change de page ou qu'on ferme le tiroir, et elle est enregistrée à
// chaque réponse (/api/ai/chat, save: true). Recharger la page, quitter
// Nebula ou changer de marque ouvre un chat vide ; les conversations
// passées se retrouvent dans « Discussions » (bouton ☰ à gauche du titre),
// d'où on peut les rouvrir et les continuer, ou les supprimer (voir
// src/lib/ai/assistant-conversations.ts). « Nouvelle conversation » (à côté
// de la croix) vide le chat ; rien n'est gardé dans le navigateur.
//
// Présentation (09/10/2026) : le tiroir d'avant (sur ordinateur, le contenu
// se décale pour lui faire de la place, voir app-shell.tsx), mais posé sous
// la barre du haut — qui ne bouge plus —, aux coins arrondis, détaché de
// 12 px des bords (.nb-assistant-window, globals.css).
// Une fenêtre flottante par-dessus la page a été essayée puis abandonnée à
// la demande de Lucas (« c'était mieux avant, garde juste les bords
// arrondis »). Plein écran sur téléphone.
//
// Ce module est chargé à la demande (ai-assistant-lazy.tsx) : le bouton
// flottant est toujours là, le tiroir n'est téléchargé qu'à la première
// ouverture (ou au survol du bouton).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useAiAssistant } from "./ai-assistant-context";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import {
  ASSISTANT_CONTEXTS,
  pickSuggestionBatch,
  suggestionBatchCount,
  type AssistantContextKey
} from "@/lib/ai/assistant-contexts";
import { sendThumbnailBrief, sendThumbnailPick, type FramePickCard, type ThumbnailBrief } from "@/lib/ai/thumbnail-brief-bridge";
import { MarkdownLite } from "@/components/ui/markdown-lite";
import { IconChevronLeft, IconChevronRight, IconClose, IconMenu, IconSend } from "./icons";
import { NebulaIcon } from "./nebula-brandmark";
import { clsx } from "@/lib/clsx";
import { AiIcon } from "@/components/ai/ai-icon";
import { formatTimestamp } from "@/lib/video/format-time";

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  /** Onglet dans lequel la question a été posée — sert à ne pas mélanger
   *  les réponses (le libellé « Contexte : … » n'est plus affiché, 29/09/2026). */
  contextKey?: AssistantContextKey;
  /** Réponse d'erreur (quota, réseau) : affichée, mais jamais renvoyée à
   *  Gemini dans l'historique. */
  error?: boolean;
  /** Brief structuré renvoyé par le serveur en contexte miniature — affiche
   *  le bouton « Générer cette miniature ». */
  thumbnail?: ThumbnailBrief | null;
  /** Les 3 miniatures proposées par « Générer des miniatures » (composer),
   *  avec le pourquoi de chaque choix et un bouton « Choisir celle-ci ». */
  framePicks?: FramePickCard[];
}

// Anciennes conversations gardées dans le navigateur (avant le 09/10/2026) : effacées.
const LEGACY_STORAGE_PREFIX = "nebula:assistant:conversation:";
// Mention sous la barre de saisie (09/10/2026, demande de Lucas) : courte,
// comme sous « Demander à Studio » de YouTube, avec « En savoir plus » vers
// l'aide de l'assistant (données envoyées à Google Gemini, quotas, limites),
// ouverte dans un nouvel onglet pour ne pas perdre la conversation.
const LEGAL_NOTICE = "L'IA peut faire des erreurs. Vous êtes responsable du contenu que vous publiez.";
const ASSISTANT_HELP_PATH = "/aide/demander-a-nebula";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function forgetLegacyConversations(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(LEGACY_STORAGE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

/** Une proposition de miniature, en une ligne, pour l'historique envoyé à Gemini. */
function describePick(p: FramePickCard, k: number): string {
  const details = [p.angle ? `levier ${p.angle}` : "", p.hook ? `accroche « ${p.hook} »` : "", typeof p.second === "number" ? `image de la vidéo à ${formatTimestamp(p.second)}` : ""].filter(Boolean).join(", ");
  const why = (p.why?.length ? p.why.join(" ") : p.reason || "image extraite de la vidéo").slice(0, 260);
  return `Option ${k + 1}${details ? ` (${details})` : ""} : ${why}`;
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

/** « il y a 5 min », « hier », « 3 oct. » — liste des discussions. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Nouvelle conversation (carré et crayon, comme « Demander à Studio »). */
function IconCompose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 8.5-8.5Z" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

function firstNameOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : null;
}

export function AiAssistant() {
  const { activeBrand } = useBrand();
  const { data: bootstrap } = useBootstrap();
  const { enabled, open, setOpen, contextKey, pendingPrompt, consumePendingPrompt, pendingInjection, consumePendingInjection, externalThinking, externalThinkingLabel } = useAiAssistant();
  // Miniature choisie depuis le chat (affiche « ✓ Choisie » sur sa carte).
  const [chosenPick, setChosenPick] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const upgrade = useUpgradeModal();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [batch, setBatch] = useState(0);
  const [followupBatch, setFollowupBatch] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Marque de la conversation en cours (voir plus bas).
  const brandRef = useRef<string | null>(null);
  // Conversation enregistrée en cours (null tant que l'assistant n'a pas répondu).
  const [conversationId, setConversationId] = useState<string | null>(null);
  // « Discussions » : la liste des conversations passées, à la place du chat.
  const [view, setView] = useState<"chat" | "history">("chat");
  const [history, setHistory] = useState<ConversationSummary[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const ctx = ASSISTANT_CONTEXTS[contextKey];
  const firstName = firstNameOf(bootstrap?.user?.name);

  // --- Conversation : gardée d'une page à l'autre, nouvelle à chaque marque
  // Rien n'est gardé dans le navigateur : recharger ou quitter le site ouvre
  // un chat vide (la conversation est dans « Discussions »). Les
  // conversations gardées par les versions précédentes sont effacées une fois.
  useEffect(() => {
    forgetLegacyConversations();
  }, []);
  const brandId = activeBrand?.id ?? null;
  useEffect(() => {
    if (brandRef.current !== null && brandRef.current !== brandId) {
      setMessages([]);
      setConversationId(null);
      setChosenPick(null);
      setBatch(0);
      setFollowupBatch(0);
      setInput("");
      setHistory(null);
      setView("chat");
    }
    brandRef.current = brandId;
  }, [brandId]);

  // --- Nouveau contexte → on repart au premier lot de suggestions --------
  useEffect(() => {
    setBatch(0);
    setFollowupBatch(0);
  }, [contextKey]);

  // --- Défilement, focus, Échap ------------------------------------------
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 250);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  // --- Compte à rebours après un 429 ------------------------------------
  useEffect(() => {
    if (!cooldownUntil) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownUntil) setCooldownUntil(null);
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);
  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  // --- Saisie : hauteur auto (1 à 5 lignes) -------------------------------
  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }

  // --- Envoi --------------------------------------------------------------
  const send = useCallback(
    async (rawText?: string, keyOverride?: AssistantContextKey) => {
      const text = (rawText ?? input).trim();
      if (!text || !activeBrand || sending || cooldownUntil) return;
      // Relance proposée sous une réponse : dans le contexte de cette réponse
      // (ex. « Rends la proposition 1 plus contrastée » sous les miniatures,
      // même si la section Miniature n'est plus à l'écran).
      const key = keyOverride ?? contextKey;

      const userMessage: Message = { id: newId(), role: "user", text, contextKey: key };
      // Historique envoyé : sans les messages d'erreur (jamais utiles à Gemini,
      // et « ⚠️ » à la place d'une vraie réponse fausserait le fil).
      const history = [...messages, userMessage].filter((m) => !m.error)
        .map((m) => ({
          role: m.role,
          // Propositions de miniatures : le « pourquoi » de chaque option
          // accompagne le texte, pour pouvoir en reparler (« et la 2 ? »).
          text: m.framePicks?.length ? `${m.text}\n${m.framePicks.map((p, k) => describePick(p, k)).join("\n")}` : m.text
        }));

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setSending(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: activeBrand.id, contextKey: key, messages: history, save: true, conversationId })
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          error?: string | unknown;
          retryAfterSeconds?: number;
          thumbnail?: ThumbnailBrief | null;
          conversationId?: string | null;
        };

        if (!res.ok) {
          const errorText = typeof data.error === "string" ? data.error : "L'assistant n'a pas pu répondre. Réessayez dans un instant.";
          // Palier sans IA (fin d'essai) : paywall contextuel plutôt qu'une
          // erreur dans le fil (lot G2.b).
          // Palier sans IA (402), adresse à confirmer (403) ou quota / budget
          // du jour de l'essai (429 avec raison, lot E2) : la bonne fenêtre.
          if (upgrade.openFromResponse(res.status, data)) {
            setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
            setInput(text);
            return;
          }
          if (res.status === 429) {
            const seconds = Math.min(Math.max(Number(data.retryAfterSeconds) || 60, 5), 600);
            setCooldownUntil(Date.now() + seconds * 1000);
            setNow(Date.now());
          }
          setMessages((prev) => [...prev, { id: newId(), role: "model", text: errorText, error: true, contextKey: key }]);
          return;
        }
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "model", text: data.reply ?? "", contextKey: key, thumbnail: data.thumbnail ?? null }
        ]);
        if (data.conversationId) {
          setConversationId(data.conversationId);
          setHistory(null); // la liste sera relue à la prochaine ouverture
        }
        setFollowupBatch((b) => b + 1);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "model", text: "Connexion perdue pendant la réponse. Vérifiez votre réseau puis réessayez.", error: true, contextKey: key }
        ]);
      } finally {
        setSending(false);
      }
    },
    [input, activeBrand, sending, cooldownUntil, messages, contextKey, upgrade, conversationId]
  );

  // --- Question poussée par une page (ex. section Miniature) --------------
  useEffect(() => {
    if (!pendingPrompt || !open) return;
    consumePendingPrompt();
    if (pendingPrompt.submit) {
      void send(pendingPrompt.text);
    } else {
      setInput(pendingPrompt.text);
      window.setTimeout(() => {
        inputRef.current?.focus();
        autoGrow(inputRef.current);
      }, 260);
    }
    // `send` change à chaque message : on ne dépend que de la demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, open]);

  // --- Messages déposés par une page (ex. les 3 miniatures du composer) ---
  useEffect(() => {
    if (!pendingInjection) return;
    consumePendingInjection();
    setMessages((prev) => [...prev, ...pendingInjection.messages.map((m) => ({ id: newId(), contextKey, ...m }))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInjection]);

  function onChoosePick(url: string) {
    sendThumbnailPick(url);
    setChosenPick(url);
    // Sur téléphone, le tiroir couvre la page : on le ferme pour voir le résultat.
    if (window.innerWidth < 1024) setOpen(false);
  }

  function resetConversation() {
    setMessages([]);
    setConversationId(null);
    setChosenPick(null);
    setBatch(0);
    setFollowupBatch(0);
    setInput("");
    setView("chat");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  // --- Discussions : conversations passées de cette marque -----------------
  const loadHistory = useCallback(async () => {
    if (!brandId) return;
    setHistoryError(false);
    const res = await fetch(`/api/ai/conversations?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).catch(() => null);
    const data = res && res.ok ? ((await res.json().catch(() => null)) as { conversations?: ConversationSummary[] } | null) : null;
    if (!data?.conversations) {
      setHistoryError(true);
      setHistory([]);
      return;
    }
    setHistory(data.conversations);
  }, [brandId]);

  function openHistory() {
    setConfirmDelete(null);
    setView("history");
    void loadHistory();
  }

  async function openConversation(id: string) {
    if (id === conversationId) {
      setView("chat");
      return;
    }
    setOpening(id);
    const res = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    const data = res && res.ok ? ((await res.json().catch(() => null)) as { conversation?: { id: string; messages: { role: "user" | "model"; text: string }[] } } | null) : null;
    setOpening(null);
    if (!data?.conversation) {
      setHistoryError(true);
      return;
    }
    setMessages(data.conversation.messages.map((m) => ({ id: newId(), role: m.role, text: m.text, contextKey })));
    setConversationId(data.conversation.id);
    setChosenPick(null);
    setFollowupBatch((b) => b + 1);
    setInput("");
    setView("chat");
  }

  async function removeConversation(id: string) {
    setConfirmDelete(null);
    setHistory((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    // La conversation affichée vient d'être supprimée : on repart d'un chat vide.
    if (id === conversationId) {
      setMessages([]);
      setConversationId(null);
    }
  }

  function onGenerateThumbnail(brief: ThumbnailBrief) {
    sendThumbnailBrief(brief);
    if (pathname !== "/composer") router.push("/composer");
    // Sur téléphone, le tiroir couvre la page : on le ferme pour laisser voir
    // la section Miniature. Sur ordinateur, on le garde ouvert à côté.
    if (window.innerWidth < 1024) setOpen(false);
  }

  const suggestions = useMemo(() => pickSuggestionBatch(ctx.suggestions, batch), [ctx, batch]);
  const hasMoreSuggestions = suggestionBatchCount(ctx.suggestions) > 1;
  const lastMessage = messages[messages.length - 1];
  // Relances : celles du contexte de la dernière réponse (07/10/2026).
  const followupKey: AssistantContextKey = lastMessage?.contextKey ?? contextKey;
  const followups = useMemo(() => {
    const def = ASSISTANT_CONTEXTS[followupKey];
    return pickSuggestionBatch(def.followups ?? def.suggestions, followupBatch, 2);
  }, [followupKey, followupBatch]);

  if (!enabled) return null;

  const showFollowups = messages.length > 0 && !sending && !externalThinking && lastMessage?.role === "model" && !lastMessage.error;

  return (
    <>
      {/* Voile — téléphone / tablette seulement : sur ordinateur, le tiroir
          se pose sur le bord droit sans bloquer la page. */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={clsx(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        role="dialog"
        aria-label="Demander à Nebula"
        aria-hidden={!open}
        data-open={open ? "true" : "false"}
        // Tiroir à droite aux coins arrondis (globals.css,
        // .nb-assistant-window). visibility est dans la transition : fermé,
        // le tiroir devient invisible (et non focusable au clavier) seulement
        // une fois sorti de l'écran, pour garder l'animation de sortie.
        className="glass-panel-solid nb-assistant-window fixed z-50 flex flex-col"
      >
        {/* En-tête (09/10/2026, comme « Demander à Studio ») : ☰ à gauche
            ouvre « Discussions », « Nouvelle conversation » à côté de la croix. */}
        <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-3">
          {view === "chat" ? (
            <button
              type="button"
              onClick={openHistory}
              title="Discussions"
              aria-label="Discussions : vos conversations passées"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/[0.08]"
            >
              <IconMenu className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setView("chat")}
              title="Revenir au chat"
              aria-label="Revenir au chat"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white transition hover:bg-white/[0.14]"
            >
              <IconChevronLeft className="h-5 w-5" />
            </button>
          )}
          <NebulaIcon size={22} />
          <div className="min-w-0 flex-1 pl-1">
            <p className="truncate font-display text-sm font-semibold text-white">{view === "history" ? "Discussions" : "Demander à Nebula"}</p>
          </div>
          <button
            type="button"
            onClick={resetConversation}
            disabled={view === "chat" && messages.length === 0}
            title="Nouvelle conversation"
            aria-label="Nouvelle conversation"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/[0.08] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <IconCompose className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Fermer"
            aria-label="Fermer l'assistant"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/[0.08]"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        {view === "history" ? (
          <div className="flex min-h-0 flex-1 flex-col" data-testid="assistant-history">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {history === null ? (
                <div className="space-y-2 px-2 py-1" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-xl bg-white/[0.04]" />
                  ))}
                  <span className="sr-only">Chargement des discussions</span>
                </div>
              ) : history.length === 0 ? (
                <p className="px-2 py-4 text-sm leading-relaxed text-slate-400">
                  {historyError
                    ? "Impossible de charger vos discussions pour le moment. Réessayez dans un instant."
                    : `Aucune discussion enregistrée pour « ${activeBrand?.name ?? "cette marque"} ». Vos conversations apparaissent ici dès la première réponse de l'assistant.`}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {history.map((c) => (
                    <li key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => void openConversation(c.id)}
                        disabled={opening !== null}
                        className={clsx(
                          "nb-menu-item flex w-full flex-col rounded-xl py-2.5 pl-3 pr-11 text-left",
                          c.id === conversationId ? "nb-menu-item-current" : "text-slate-100"
                        )}
                      >
                        <span className="truncate text-sm font-medium">{opening === c.id ? "Ouverture…" : c.title}</span>
                        <span className="mt-0.5 text-[11px] text-slate-500">{whenLabel(c.updatedAt)}</span>
                      </button>
                      {confirmDelete === c.id ? (
                        <button
                          type="button"
                          onClick={() => void removeConversation(c.id)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/25"
                        >
                          Supprimer ?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(c.id)}
                          title="Supprimer cette discussion"
                          aria-label={`Supprimer la discussion « ${c.title} »`}
                          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 opacity-0 transition hover:bg-white/[0.08] hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="shrink-0 border-t border-white/[0.06] px-5 py-3 text-[11px] leading-snug text-slate-500">
              Discussions de « {activeBrand?.name ?? "cette marque"} », visibles par vous seul, effacées 90 jours après le dernier message.{" "}
              <a href={ASSISTANT_HELP_PATH} target="_blank" rel="noopener noreferrer" className="font-medium text-aurora-300 underline-offset-2 hover:underline">
                Aide sur l&apos;assistant
              </a>
            </div>
          </div>
        ) : (
          <>

        {/* Corps défilant : accueil + suggestions, ou la conversation */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="px-4 pb-6 pt-6 sm:px-5">
              {/* Accueil (24/09/2026) : aura lumineuse aux couleurs du logo
                  autour du message, « Bonjour [marque] » puis la question en
                  dégradé de la charte (voir .nb-assistant-aura). Sans logo
                  depuis le 09/10/2026 : il est déjà à côté du titre du
                  panneau (demande de Lucas). */}
              <div className="nb-assistant-aura relative isolate rounded-3xl px-5 pb-5 pt-6">
                <h2 className="font-display text-2xl font-semibold leading-tight text-white">
                  Bonjour {activeBrand?.name ?? firstName ?? ""}
                  <span className="nb-assistant-question block text-xl">Comment puis-je vous aider ?</span>
                </h2>
                <p key={contextKey} className="mt-3 animate-fade-in text-sm leading-relaxed text-slate-400">
                  {ctx.welcome}
                </p>
              </div>

              {/* Suggestions alignées à droite, en bulles, comme des messages
                  prêts à envoyer — le centre de l'écran reste aéré. */}
              <p className="mb-2 mt-7 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Suggestions</p>
              <ul key={`${contextKey}-${batch}`} className="flex animate-fade-in-up flex-col items-end gap-2">
                {suggestions.map((s) => (
                  <li key={s} className="flex max-w-[88%] justify-end">
                    <button
                      type="button"
                      onClick={() => void send(s)}
                      disabled={sending || Boolean(cooldownUntil)}
                      className="group flex items-center gap-2 rounded-2xl rounded-br-md border border-aurora-400/25 bg-aurora-500/[0.08] px-3.5 py-2 text-left text-sm text-slate-100 transition hover:border-aurora-400/55 hover:bg-aurora-500/15 hover:text-white disabled:opacity-50"
                    >
                      <span className="leading-snug">{s}</span>
                      <IconChevronRight className="h-3.5 w-3.5 shrink-0 text-aurora-300/70 transition group-hover:translate-x-0.5 group-hover:text-white" />
                    </button>
                  </li>
                ))}
              </ul>
              {hasMoreSuggestions && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setBatch((b) => b + 1)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-aurora-300 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    Autres suggestions
                    <IconChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {messages.map((m) => {
                return (
                  <div key={m.id}>
                    {m.role === "user" ? (
                      <div className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-nebula-600/40 px-3.5 py-2 text-sm leading-relaxed text-white">
                        {m.text}
                      </div>
                    ) : (
                      <div className="flex gap-2.5">
                        <NebulaIcon size={20} className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          {m.error ? (
                            <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-sm leading-relaxed text-amber-200">{m.text}</p>
                          ) : (
                            <MarkdownLite text={m.text} className="text-sm text-slate-200" />
                          )}
                          {m.framePicks && m.framePicks.length > 0 && !m.error && (
                            <div className="mt-3 space-y-2.5">
                              {m.framePicks.map((p, idx) => (
                                <div key={p.url} className={clsx("overflow-hidden rounded-xl border bg-nebula-900/40", chosenPick === p.url ? "border-aurora-400/60" : "border-white/10")}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={p.url}
                                    alt={`Proposition de miniature ${idx + 1}${p.hook ? ` : « ${p.hook} »` : ""}`}
                                    loading="lazy"
                                    className={p.aspect === "9:16" ? "mx-auto aspect-[9/16] max-h-[420px] w-auto bg-black object-cover" : "aspect-video w-full object-cover"}
                                  />
                                  <div className="p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aurora-300">
                                      Option {idx + 1}
                                      {idx === 0 ? " · recommandée" : ""}
                                      {p.angle ? ` · ${p.angle}` : ""}
                                    </p>
                                    {p.hook && <p className="mt-1 font-display text-sm font-semibold text-white">« {p.hook} »</p>}
                                    {typeof p.second === "number" && (
                                      <p className="mt-1 text-[11px] leading-snug text-slate-400">
                                        Image de votre vidéo à {formatTimestamp(p.second)}
                                        {p.moment ? ` : ${p.moment}` : ""}
                                      </p>
                                    )}
                                    {p.why && p.why.length > 0 ? (
                                      <div className="mt-2">
                                        <p className="text-[11px] font-semibold text-slate-200">Pourquoi elle fera cliquer</p>
                                        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-300">
                                          {p.why.map((w) => (
                                            <li key={w}>{w}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : (
                                      p.reason && <p className="mt-1 text-xs leading-relaxed text-slate-300">{p.reason}</p>
                                    )}
                                    {p.sharpness > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                                      <span className="rounded-full border border-white/10 px-2 py-0.5">Netteté {p.sharpness}/5</span>
                                      <span className="rounded-full border border-white/10 px-2 py-0.5">Cadrage {p.framing}/5</span>
                                      <span className="rounded-full border border-white/10 px-2 py-0.5">Potentiel de clic {p.clickPotential}/5</span>
                                    </div>
                                    )}
                                    {pathname === "/composer" ? (
                                      <button
                                        type="button"
                                        onClick={() => onChoosePick(p.url)}
                                        className={clsx(
                                          "mt-2.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                                          chosenPick === p.url ? "bg-aurora-400/15 text-aurora-200" : "btn-glow text-white"
                                        )}
                                      >
                                        {chosenPick === p.url ? "✓ Choisie comme miniature" : "Choisir celle-ci"}
                                      </button>
                                    ) : (
                                      <p className="mt-2 text-[11px] text-slate-500">Revenez sur la page Publier pour choisir une miniature.</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {m.thumbnail && !m.error && (
                            <div className="mt-3 rounded-xl border border-aurora-400/25 bg-nebula-900/40 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aurora-300">Prêt à générer</p>
                              {m.thumbnail.hook && <p className="mt-1 font-display text-base font-semibold text-white">« {m.thumbnail.hook} »</p>}
                              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-400">{m.thumbnail.imagePrompt}</p>
                              <button
                                type="button"
                                onClick={() => onGenerateThumbnail(m.thumbnail as ThumbnailBrief)}
                                className="btn-glow mt-3 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-white"
                              >
                                <AiIcon className="h-4 w-4" tone="onAccent" />
                                Générer cette miniature
                              </button>
                              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                                {pathname === "/composer"
                                  ? "La miniature est créée à partir d'une image de votre vidéo, dans la section Miniature de la page Publier."
                                  : "Vous serez dirigé vers Publier : ajoutez votre vidéo, la génération utilise ce brief."}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {(sending || externalThinking) && (
                <div className="flex items-center gap-2.5" aria-live="polite" aria-label={externalThinkingLabel ?? "L'assistant rédige sa réponse"}>
                  <NebulaIcon size={20} className="shrink-0" />
                  <span className="flex items-center gap-1 rounded-xl bg-white/[0.04] px-3 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aurora-300 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aurora-300 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aurora-300" />
                  </span>
                  {externalThinking && externalThinkingLabel && <span className="text-xs text-slate-400" data-testid="assistant-thinking-label">{externalThinkingLabel}</span>}
                </div>
              )}

              {showFollowups && (
                <div className="flex flex-wrap gap-1.5 pl-[30px]">
                  {followups.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s, followupKey)}
                      disabled={Boolean(cooldownUntil)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-xs text-slate-300 transition hover:border-aurora-400/40 hover:text-white disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Barre de saisie fixe + mention légale */}
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          {cooldownUntil && (
            <p className="mb-2 px-1 text-[11px] text-amber-300" aria-live="polite">
              Quota atteint — l&apos;assistant reprend dans {cooldownSeconds} s.
            </p>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 transition focus-within:border-aurora-400/60">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                autoGrow(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Posez votre question…"
              aria-label="Votre question"
              disabled={Boolean(cooldownUntil)}
              className="max-h-[132px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim() || Boolean(cooldownUntil)}
              aria-label="Envoyer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-nebula-500 to-accent-cyan text-white transition disabled:opacity-40"
            >
              <IconSend className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 px-1 text-center text-[11px] leading-snug text-slate-500">
            {LEGAL_NOTICE}{" "}
            <a href={ASSISTANT_HELP_PATH} target="_blank" rel="noopener noreferrer" className="font-medium text-aurora-300 underline-offset-2 hover:underline">
              En savoir plus
            </a>
          </p>
        </div>
          </>
        )}
      </aside>
    </>
  );
}
