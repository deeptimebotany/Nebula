"use client";

// Paramètres → Compte : pseudo de la Communauté (10/10/2026, demande de
// Lucas : « tout le monde ne veut pas montrer son nom »). Le pseudo remplace
// le nom partout dans la Communauté ; attribué d'office, modifiable ici.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useBootstrap } from "@/components/bootstrap-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { HANDLE_MAX, handleError, normalizeHandle } from "@/lib/community/handle-rules";

export function HandleSettings() {
  const bootstrap = useBootstrap();
  const toast = useToast();
  const current = bootstrap.data?.user?.handle ?? "";
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(current), [current]);

  const normalized = normalizeHandle(value);
  const changed = normalized !== current;
  const localError = changed && normalized ? handleError(normalized) : null;

  async function save() {
    if (!changed || localError || saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/handle", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: normalized }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { handle?: string; error?: string } | null;
    setSaving(false);
    if (!res?.ok || !data?.handle) {
      setError(data?.error ?? "Pseudo non enregistré : réessayez dans un instant.");
      return;
    }
    const user = bootstrap.data?.user;
    if (user) bootstrap.patch({ user: { ...user, handle: data.handle } });
    toast.success(`Votre pseudo est maintenant @${data.handle}.`);
  }

  return (
    <div className="nb-settings-row py-5" data-testid="handle-settings">
      <p className="text-[15px] font-semibold text-white">Pseudo dans la Communauté</p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
        C&apos;est ce que les autres voient à la place de votre nom (forum, avis, vidéos, classements). Lettres, chiffres, point ou tiret bas.
        {current && (
          <>
            {" "}
            <Link href={`/community/membre/${current}`} className="text-aurora-300 underline underline-offset-2 hover:text-white">
              Voir mon profil
            </Link>
          </>
        )}
      </p>
      <form
        className="mt-3 flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex min-w-0 flex-1 items-center rounded-xl border border-white/10 bg-white/[0.03] px-3 focus-within:border-aurora-400/60 sm:max-w-sm">
          <span className="text-sm text-slate-500" aria-hidden="true">
            @
          </span>
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            maxLength={HANDLE_MAX + 1}
            autoComplete="off"
            spellCheck={false}
            aria-label="Pseudo dans la Communauté"
            aria-invalid={Boolean(localError || error)}
            className="min-w-0 flex-1 bg-transparent py-2 pl-0.5 text-sm text-white outline-none"
          />
        </label>
        <Button type="submit" disabled={!changed || Boolean(localError) || saving || !normalized}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>
      {changed && normalized && normalized !== value.replace(/^@/, "") && !localError && <p className="mt-1.5 text-xs text-slate-500">Sera enregistré : @{normalized}</p>}
      {(localError || error) && (
        <p role="alert" className="mt-1.5 text-xs text-red-300">
          {localError ?? error}
        </p>
      )}
    </div>
  );
}
