"use client";

// Réglages Pinterest de Publier (lot 2, 25/09/2026) : le tableau où ranger
// l'épingle et le lien vers lequel elle renvoie. Sans choix, l'épingle va
// dans le premier tableau du compte (voir src/lib/social/pinterest.ts).

import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui/input";

export interface PinterestComposerOptions {
  boardId: string; // "" = premier tableau du compte
  link: string; // "" = aucun lien
}

export const DEFAULT_PINTEREST_OPTIONS: PinterestComposerOptions = { boardId: "", link: "" };

interface Board {
  id: string;
  name: string;
  privacy?: string;
}

export function PinterestOptions({
  connectionId,
  value,
  onChange
}: {
  connectionId: string | undefined;
  value: PinterestComposerOptions;
  onChange: (next: PinterestComposerOptions) => void;
}) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    setBoards(null);
    setError(null);
    fetch(`/api/social/pinterest/boards?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { boards?: Board[]; error?: string };
        if (cancelled) return;
        if (!r.ok) setError(data.error || "Impossible de charger vos tableaux.");
        setBoards(data.boards ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Impossible de charger vos tableaux.");
          setBoards([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const linkInvalid = value.link.trim() !== "" && !/^https?:\/\/\S+\.\S+/.test(value.link.trim());

  return (
    <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
      <Select
        label="Tableau"
        value={value.boardId}
        onChange={(e) => onChange({ ...value, boardId: e.target.value })}
        disabled={boards === null}
        hint={error ?? (boards && boards.length === 0 ? "Aucun tableau sur ce compte : créez-en un sur Pinterest." : undefined)}
      >
        <option value="">{boards === null ? "Chargement des tableaux…" : "Premier tableau du compte"}</option>
        {(boards ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.privacy === "SECRET" ? " (secret)" : ""}
          </option>
        ))}
      </Select>
      <Input
        label="Lien de l'épingle (facultatif)"
        placeholder="https://votresite.fr/article"
        value={value.link}
        onChange={(e) => onChange({ ...value, link: e.target.value })}
        error={linkInvalid ? "Adresse invalide : elle doit commencer par https://" : undefined}
        hint={!linkInvalid ? "Là où arrive la personne qui clique sur l'épingle : votre site, un article, votre page bio…" : undefined}
      />
    </div>
  );
}
