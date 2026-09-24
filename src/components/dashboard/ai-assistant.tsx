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
// La conversation survit à la navigation (le composant vit dans le layout)
// et au rechargement (sessionStorage, par marque) ; « Nouvelle conversation »
// la vide.

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
import { IconChevronRight, IconClose, IconRefresh, IconSend, IconSparkle } from "./icons";
import { NebulaIcon } from "./nebula-brandmark";
import { clsx } from "@/lib/clsx";

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  /** Onglet dans lequel la question a été posée — sert à afficher un petit
   *  séparateur « Contexte : … » quand on change d'onglet en cours de
   *  conversation, et à ne pas mélanger les réponses. */
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

const STORAGE_PREFIX = "nebula:assistant:conversation:";
const STORAGE_MAX_MESSAGES = 40;
const LEGAL_NOTICE =
  "L'assistant peut faire des erreurs : vérifiez les informations importantes. Vos questions et les données de votre marque sont envoyées à Google Gemini pour générer la réponse.";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadConversation(brandId: string): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + brandId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Message[]).filter((m) => m && typeof m.text === "string") : [];
  } catch {
    return [];
  }
}

function saveConversation(brandId: string, messages: Message[]): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + brandId, JSON.stringify(messages.slice(-STORAGE_MAX_MESSAGES)));
  } catch {
    // Stockage indisponible : la conversation vit juste en mémoire.
  }
}

function firstNameOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : null;
}

export function AiAssistant() {
  const { activeBrand } = useBrand();
  const { data: bootstrap } = useBootstrap();
  const { enabled, open, setOpen, contextKey, pendingPrompt, consumePendingPrompt, pendingInjection, consumePendingInjection, externalThinking } = useAiAssistant();
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
  const loadedBrandRef = useRef<string | null>(null);

  const ctx = ASSISTANT_CONTEXTS[contextKey];
  const firstName = firstNameOf(bootstrap?.user?.name);

  // --- Conversation persistée par marque -------------------------------
  useEffect(() => {
    if (!activeBrand) return;
    if (loadedBrandRef.current === activeBrand.id) return;
    loadedBrandRef.current = activeBrand.id;
    setMessages(loadConversation(activeBrand.id));
  }, [activeBrand]);

  useEffect(() => {
    if (activeBrand && loadedBrandRef.current === activeBrand.id) saveConversation(activeBrand.id, messages);
  }, [messages, activeBrand]);

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
    async (rawText?: string) => {
      const text = (rawText ?? input).trim();
      if (!text || !activeBrand || sending || cooldownUntil) return;

      const userMessage: Message = { id: newId(), role: "user", text, contextKey };
      // Historique envoyé : sans les messages d'erreur (jamais utiles à Gemini,
      // et « ⚠️ » à la place d'une vraie réponse fausserait le fil).
      const history = [...messages, userMessage].filter((m) => !m.error)
        .map((m) => ({
          role: m.role,
          // Propositions de miniatures : le « pourquoi » de chaque option
          // accompagne le texte, pour pouvoir en reparler (« et la 2 ? »).
          text: m.framePicks?.length ? `${m.text}\n${m.framePicks.map((p, k) => `Option ${k + 1} : ${p.reason || "image extraite de la vidéo"}`).join("\n")}` : m.text
        }));

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setSending(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: activeBrand.id, contextKey, messages: history })
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          error?: string | unknown;
          retryAfterSeconds?: number;
          thumbnail?: ThumbnailBrief | null;
        };

        if (!res.ok) {
          const errorText = typeof data.error === "string" ? data.error : "L'assistant n'a pas pu répondre. Réessayez dans un instant.";
          // Palier sans IA (fin d'essai) : paywall contextuel plutôt qu'une
          // erreur dans le fil (lot G2.b).
          if (res.status === 402 && upgrade.openFromResponse(res.status, data)) {
            setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
            setInput(text);
            return;
          }
          if (res.status === 429) {
            const seconds = Math.min(Math.max(Number(data.retryAfterSeconds) || 60, 5), 600);
            setCooldownUntil(Date.now() + seconds * 1000);
            setNow(Date.now());
          }
          setMessages((prev) => [...prev, { id: newId(), role: "model", text: errorText, error: true, contextKey }]);
          return;
        }
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "model", text: data.reply ?? "", contextKey, thumbnail: data.thumbnail ?? null }
        ]);
        setFollowupBatch((b) => b + 1);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "model", text: "Connexion perdue pendant la réponse. Vérifiez votre réseau puis réessayez.", error: true, contextKey }
        ]);
      } finally {
        setSending(false);
      }
    },
    [input, activeBrand, sending, cooldownUntil, messages, contextKey, upgrade]
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
    setBatch(0);
    setFollowupBatch(0);
    setInput("");
    inputRef.current?.focus();
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
  const followups = useMemo(() => pickSuggestionBatch(ctx.suggestions, followupBatch, 2), [ctx, followupBatch]);

  if (!enabled) return null;

  const lastMessage = messages[messages.length - 1];
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
        className={clsx(
          // visibility est dans la transition : fermé, le tiroir devient
          // invisible (et non focusable au clavier) seulement une fois sorti
          // de l'écran, pour garder l'animation de sortie.
          "glass-panel-solid fixed inset-y-0 right-0 z-50 flex w-full flex-col border-y-0 border-r-0 transition-[transform,visibility] duration-200 ease-out sm:w-[420px] sm:rounded-l-2xl",
          open ? "visible translate-x-0" : "invisible translate-x-full"
        )}
      >
        {/* En-tête */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
          <NebulaIcon size={24} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold text-white">Demander à Nebula</p>
            <p className="truncate text-[11px] text-slate-500">Contexte : {ctx.label}</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetConversation}
              title="Nouvelle conversation"
              aria-label="Nouvelle conversation"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <IconRefresh className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer l'assistant"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Corps défilant : accueil + suggestions, ou la conversation */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="px-4 pb-6 pt-6 sm:px-5">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-nebula-600/70 to-accent-cyan/40 text-white shadow-glow">
                <IconSparkle className="h-5 w-5" />
              </div>
              <h2 className="font-display text-2xl font-semibold leading-tight text-white">{firstName ? `Bonjour ${firstName}` : "Bonjour"}</h2>
              <p key={contextKey} className="mt-2 animate-fade-in text-sm leading-relaxed text-slate-400">
                {ctx.welcome}
              </p>

              <p className="mb-2 mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Suggestions</p>
              <ul key={`${contextKey}-${batch}`} className="animate-fade-in-up space-y-1.5">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => void send(s)}
                      disabled={sending || Boolean(cooldownUntil)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left text-sm text-slate-200 transition hover:border-aurora-400/40 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                    >
                      <IconSparkle className="h-4 w-4 shrink-0 text-aurora-300/80" />
                      <span className="flex-1 leading-snug">{s}</span>
                      <IconChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
                    </button>
                  </li>
                ))}
              </ul>
              {hasMoreSuggestions && (
                <button
                  type="button"
                  onClick={() => setBatch((b) => b + 1)}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-aurora-300 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Autres suggestions
                  <IconChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {messages.map((m, i) => {
                const prevUser = [...messages.slice(0, i)].reverse().find((x) => x.role === "user");
                const contextChanged = m.role === "user" && m.contextKey && prevUser?.contextKey && prevUser.contextKey !== m.contextKey;
                return (
                  <div key={m.id}>
                    {contextChanged && (
                      <div className="mb-4 flex items-center gap-2 text-[11px] text-slate-500" aria-hidden="true">
                        <span className="h-px flex-1 bg-white/[0.06]" />
                        Contexte : {ASSISTANT_CONTEXTS[m.contextKey as AssistantContextKey].label}
                        <span className="h-px flex-1 bg-white/[0.06]" />
                      </div>
                    )}
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
                                  <img src={p.url} alt={`Proposition de miniature ${idx + 1}`} loading="lazy" className="aspect-video w-full object-cover" />
                                  <div className="p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aurora-300">
                                      Option {idx + 1}
                                      {idx === 0 ? " · recommandée" : ""}
                                    </p>
                                    {p.reason && <p className="mt-1 text-xs leading-relaxed text-slate-300">{p.reason}</p>}
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
                                <IconSparkle className="h-4 w-4" />
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
                <div className="flex items-center gap-2.5" aria-live="polite" aria-label="L'assistant rédige sa réponse">
                  <NebulaIcon size={20} className="shrink-0" />
                  <span className="flex items-center gap-1 rounded-xl bg-white/[0.04] px-3 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aurora-300 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aurora-300 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aurora-300" />
                  </span>
                </div>
              )}

              {showFollowups && (
                <div className="flex flex-wrap gap-1.5 pl-[30px]">
                  {followups.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
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
              placeholder={`Posez une question sur ${ctx.label === "Nebula" ? "Nebula" : `« ${ctx.label} »`}…`}
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
          <p className="mt-2 px-1 text-center text-[10.5px] leading-snug text-slate-500">{LEGAL_NOTICE}</p>
        </div>
      </aside>

      {/* Bouton flottant — masqué quand le tiroir est ouvert */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          "nebula-chat-launcher fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white lg:bottom-6 lg:right-6",
          open && "pointer-events-none opacity-0"
        )}
        aria-label="Demander à Nebula"
        title="Demander à Nebula"
        tabIndex={open ? -1 : 0}
      >
        <NebulaIcon size={30} />
      </button>
    </>
  );
}
