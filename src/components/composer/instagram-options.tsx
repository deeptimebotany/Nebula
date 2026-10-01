"use client";

// Réglages Instagram de Publier (01/10/2026) : collaborateurs. Jusqu'à 3
// comptes invités comme co-auteurs ; chacun reçoit une invitation sur
// Instagram et, s'il accepte, la publication apparaît aussi sur son profil
// (même publication, mêmes mentions J'aime et commentaires).
import { useState } from "react";
import { INSTAGRAM_MAX_COLLABORATORS, normalizeInstagramUsername } from "@/lib/social/instagram-collaborators";
import { InfoTip } from "@/components/ui/info-tip";
import { IconUsers } from "@/components/dashboard/icons";

export interface InstagramComposerOptions {
  collaborators: string[];
}

export const DEFAULT_INSTAGRAM_OPTIONS: InstagramComposerOptions = { collaborators: [] };

const HELP =
  "Chaque compte ajouté reçoit une invitation sur Instagram. S'il l'accepte, la publication s'affiche aussi sur son profil et touche ses abonnés. 3 comptes au plus, publics de préférence ; pas pour les stories. Si Instagram refuse un compte (nom introuvable, compte privé), la publication part quand même, sans collaborateur.";

export function InstagramOptions({ value, onChange }: { value: InstagramComposerOptions; onChange: (next: InstagramComposerOptions) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = value.collaborators.length >= INSTAGRAM_MAX_COLLABORATORS;

  function add() {
    if (!draft.trim()) return;
    const name = normalizeInstagramUsername(draft);
    if (!name) {
      setError("Nom d'utilisateur invalide : lettres, chiffres, points et tirets bas, 30 caractères au plus.");
      return;
    }
    if (value.collaborators.includes(name)) {
      setError(`@${name} est déjà dans la liste.`);
      return;
    }
    if (full) return;
    onChange({ collaborators: [...value.collaborators, name] });
    setDraft("");
    setError(null);
  }

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <IconUsers className="h-3.5 w-3.5 text-aurora-300" />
        Collaborateurs
        <InfoTip label="À quoi servent les collaborateurs Instagram ?">{HELP}</InfoTip>
        <span className="ml-auto tabular-nums text-slate-500">
          {value.collaborators.length}/{INSTAGRAM_MAX_COLLABORATORS}
        </span>
      </p>
      {value.collaborators.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Collaborateurs ajoutés">
          {value.collaborators.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] py-0.5 pl-2.5 pr-1 text-xs text-slate-200">
              @{c}
              <button
                type="button"
                onClick={() => onChange({ collaborators: value.collaborators.filter((x) => x !== c) })}
                aria-label={`Retirer @${c}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="@compte_partenaire"
            aria-label="Nom d'utilisateur Instagram du collaborateur"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-aurora-400/50 hover:text-white disabled:opacity-50"
          >
            Ajouter un collaborateur
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
