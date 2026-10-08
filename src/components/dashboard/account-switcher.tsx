"use client";

// Comptes Nebula connectés dans CE navigateur, façon Google (voir
// /api/accounts/linked et multi-account.ts) : bascule instantanée entre eux
// sans reconnexion, et « Ajouter un compte » via Google. Distinct de la
// marque active : un compte peut posséder plusieurs marques, mais représente
// toujours une seule vraie personne connectée.
//
// Refonte V2 (07/10/2026) : plus de bouton à part dans la barre du haut. La
// liste est une vue du menu du profil (« Changer de compte », voir
// profile-menu.tsx), qui monte useLinkedAccounts() dès l'affichage de
// l'application pour mémoriser le compte actif comme avant.
import { useCallback, useEffect, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { Skeleton } from "@/components/ui/skeleton";
import { signIn } from "next-auth/react";
import { clsx } from "@/lib/clsx";
import { IconAvatar, IconPlus, IconClose } from "./icons";

export interface LinkedAccount {
  uid: string;
  name: string | null;
  email: string | null;
  image: string | null;
  active: boolean;
}

/** Comptes de ce navigateur ; mémorise le compte actif au premier affichage. */
export function useLinkedAccounts() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/accounts/linked")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    // Mémorise le compte actif dans le sélecteur (voir /api/accounts/link,
    // POST) avant de charger la liste — couvre aussi bien une connexion
    // normale depuis /login que le flux « Ajouter un compte », sans jamais
    // écrire de cookie depuis un Server Component (voir (dashboard)/layout.tsx).
    fetch("/api/accounts/link", { method: "POST" })
      .catch(() => undefined)
      .finally(refresh);
  }, [refresh]);

  const switchTo = useCallback(
    async (uid: string) => {
      setSwitching(uid);
      const res = await fetch("/api/accounts/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid })
      });
      if (res.ok) {
        // Rechargement complet plutôt qu'un simple router.refresh() : toutes
        // les données affichées (marques, comptes connectés, analytics...)
        // appartiennent au compte précédent et doivent repartir de zéro.
        window.location.href = "/dashboard";
        return;
      }
      setSwitching(null);
      refresh();
    },
    [refresh]
  );

  const unlink = useCallback(
    async (uid: string) => {
      await fetch("/api/accounts/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid })
      }).catch(() => undefined);
      refresh();
    },
    [refresh]
  );

  return { accounts, loaded, switching, switchTo, unlink, refresh };
}

export function addLinkedAccount() {
  signIn("google", { callbackUrl: "/api/accounts/link" });
}

/** Liste des comptes de ce navigateur (vue « Changer de compte » du menu du profil). */
export function LinkedAccountsList({
  linked,
  activeImage,
  canAddAccount
}: {
  linked: ReturnType<typeof useLinkedAccounts>;
  /** Photo du compte actif enregistrée dans Nebula (« Mon profil »). */
  activeImage: string | null;
  canAddAccount: boolean;
}) {
  const { accounts, loaded, switching, switchTo, unlink } = linked;
  return (
    <div>
      {!loaded && accounts.length === 0 && (
        <div className="space-y-2 px-2.5 py-2" aria-busy="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      {accounts.map((a) => {
        const image = a.active ? (activeImage ?? a.image) : a.image;
        return (
          <div
            key={a.uid}
            onClick={() => !a.active && switchTo(a.uid)}
            className={clsx(
              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
              a.active ? "bg-[color:var(--nb-active)] text-white" : "cursor-pointer text-slate-300 hover:bg-[color:var(--nb-hover)]",
              switching === a.uid && "opacity-50"
            )}
          >
            {image ? (
              <RemoteImage src={image} className="h-7 w-7 shrink-0 rounded-full" sizes="28px" />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--nb-active)] text-slate-400">
                <IconAvatar className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{a.name || "Compte Nebula"}</p>
              {a.email && <p className="truncate text-xs text-slate-500">{a.email}</p>}
            </div>
            {a.active ? (
              <span className="shrink-0 text-[11px] font-medium text-slate-500">Actif</span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void unlink(a.uid);
                }}
                title="Retirer de cet appareil"
                aria-label={`Retirer ${a.name || a.email || "ce compte"} de cet appareil`}
                className="shrink-0 rounded-full p-1 text-slate-500 opacity-0 transition hover:bg-[color:var(--nb-hover)] hover:text-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <IconClose className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
      {canAddAccount && (
        <button onClick={addLinkedAccount} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-300 transition hover:bg-[color:var(--nb-hover)] hover:text-white">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-[color:var(--nb-sep-strong)]">
            <IconPlus className="h-3.5 w-3.5" />
          </span>
          Ajouter un compte
        </button>
      )}
    </div>
  );
}
