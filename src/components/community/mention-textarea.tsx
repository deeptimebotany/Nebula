"use client";

// Champ de texte de la Communauté avec suggestions de membres (10/10/2026,
// demande de Lucas) : taper « @ » puis le début d'un pseudo propose jusqu'à
// 6 membres ; ↑ ↓ pour choisir, Entrée ou Tab pour insérer « @pseudo »,
// Échap pour fermer. La personne mentionnée reçoit une notification à
// l'envoi (src/lib/community/mentions.ts). S'utilise comme un <textarea>,
// avec `value` et `onValueChange`.
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { insertMention, mentionAtCursor } from "@/lib/community/mention-rules";
import { clsx } from "@/lib/clsx";
import { MemberAvatar } from "./member-avatar";

interface Suggestion {
  id: string;
  handle: string;
  avatarUrl: string | null;
  levelName: string;
}

const cache = new Map<string, Suggestion[]>();

async function fetchSuggestions(query: string): Promise<Suggestion[]> {
  const hit = cache.get(query);
  if (hit) return hit;
  const res = await fetch(`/api/community/members?q=${encodeURIComponent(query)}`).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { members?: Suggestion[] } | null;
  const list = res?.ok ? (data?.members ?? []) : [];
  cache.set(query, list);
  return list;
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
};

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea({ value, onValueChange, onKeyDown, onBlur, wrapperClassName, ...rest }, ref) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
  const listId = useId();
  const [at, setAt] = useState<{ start: number; query: string } | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);

  const query = at?.query ?? "";
  useEffect(() => {
    if (!at || !query) {
      setItems([]);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      void fetchSuggestions(query).then((list) => {
        if (!alive) return;
        setItems(list);
        setActive(0);
      });
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, Boolean(at)]);

  const open = Boolean(at) && items.length > 0;

  function track(el: HTMLTextAreaElement) {
    setAt(mentionAtCursor(el.value, el.selectionStart ?? el.value.length));
  }

  function choose(s: Suggestion) {
    if (!at) return;
    const next = insertMention(value, at, s.handle);
    onValueChange(next.text);
    setAt(null);
    setItems([]);
    window.requestAnimationFrame(() => {
      const el = inner.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function keyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
        return;
      }
      if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey) || e.key === "Tab") {
        e.preventDefault();
        choose(items[active] ?? items[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAt(null);
        return;
      }
    }
    onKeyDown?.(e);
  }

  return (
    <div className={clsx("relative", wrapperClassName)}>
      <textarea
        {...rest}
        ref={inner}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          track(e.target);
        }}
        onKeyDown={keyDown}
        onClick={(e) => track(e.currentTarget)}
        onBlur={(e) => {
          // Laisse le temps d'un clic dans la liste.
          window.setTimeout(() => setAt(null), 150);
          onBlur?.(e);
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Membres à mentionner" className="glass-panel-solid absolute left-0 top-full z-40 mt-1 w-72 max-w-full overflow-hidden rounded-xl py-1 shadow-2xl" data-testid="mention-suggestions">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm", i === active ? "bg-white/[0.08] text-white" : "text-slate-300")}
            >
              <MemberAvatar author={{ id: s.id, name: `@${s.handle}`, handle: s.handle, avatarUrl: s.avatarUrl }} size={24} interactive={false} />
              <span className="min-w-0 flex-1 truncate font-medium">@{s.handle}</span>
              <span className="shrink-0 text-[11px] text-slate-500">{s.levelName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
