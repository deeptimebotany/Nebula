"use client";

import { useEffect, useRef, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { Skeleton } from "@/components/ui/skeleton";
import { signIn } from "next-auth/react";
import { clsx } from "@/lib/clsx";
import { IconAvatar, IconChevron, IconPlus, IconClose, IconTrophy } from "./icons";
import { openProfilePanel } from "./profile-panel";

interface LinkedAccount {
  uid: string;
  name: string | null;
  email: string | null;
  image: string | null;
  active: boolean;
}

interface AccountSwitcherProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
}

// Vrai sélecteur multi-compte façon Google, en haut à droite du tableau de
// bord : liste les comptes Nebula déjà connectés dans CE navigateur (voir
// /api/accounts/linked et multi-account.ts), bascule instantanément entre
// eux sans repasser par une reconnexion, et propose "+" pour en ajouter un
// nouveau via Google. Distinct de la "marque" active (voir le sélecteur de
// marque, ligne 2 de topnav.tsx) : un même compte peut posséder plusieurs
// marques, mais représente toujours une seule vraie personne connectée.
export function AccountSwitcher({ oauth }: AccountSwitcherProps) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function refresh() {
    fetch("/api/accounts/linked")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => undefined);
  }

  useEffect(() => {
    // Mémorise le compte actif dans le sélecteur (voir /api/accounts/link,
    // POST) avant de charger la liste — couvre aussi bien une connexion
    // normale depuis /login que le flux "+" ci-dessous, sans jamais écrire
    // de cookie depuis un Server Component (voir (dashboard)/layout.tsx).
    fetch("/api/accounts/link", { method: "POST" })
      .catch(() => undefined)
      .finally(refresh);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function switchTo(uid: string) {
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
  }

  async function unlink(e: React.MouseEvent, uid: string) {
    e.stopPropagation();
    await fetch("/api/accounts/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid })
    }).catch(() => undefined);
    refresh();
  }

  function addAccount() {
    signIn("google", { callbackUrl: "/api/accounts/link" });
  }

  const active = accounts.find((a) => a.active) ?? null;
  const canAddAccount = Boolean(oauth?.google);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Compte"
        className={clsx(
          "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 transition",
          open
            ? "border-aurora-400/60 bg-aurora-400/10 text-white"
            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-aurora-400/40 hover:text-white"
        )}
      >
        {active?.image ? (
          <RemoteImage src={active.image} className="h-7 w-7 rounded-full" sizes="28px" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
            <IconAvatar className="h-4 w-4" />
          </span>
        )}
        <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">
          {active?.name || active?.email || "Mon compte"}
        </span>
        <IconChevron className={clsx("h-3.5 w-3.5 shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="glass-panel-solid absolute right-0 top-[calc(100%+6px)] z-20 w-72 rounded-xl p-1.5">
          {/* Profil (badges, easter eggs, parrainage) : panneau latéral, voir
              profile-panel.tsx. */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openProfilePanel();
            }}
            className="mb-1 flex w-full items-center gap-2.5 rounded-lg border-b border-white/[0.06] px-2.5 py-2.5 text-sm text-slate-200 transition hover:bg-white/5 hover:text-white"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-aurora-300">
              <IconTrophy className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-left">Mon profil</span>
            <span className="text-[11px] text-slate-500">badges · succès · parrainage</span>
          </button>
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] uppercase tracking-wide text-slate-500">
            Comptes connectés sur cet appareil
          </p>
          {accounts.length === 0 && (
            <div className="space-y-2 px-2.5 py-2" aria-busy="true">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {accounts.map((a) => (
            <div
              key={a.uid}
              onClick={() => !a.active && switchTo(a.uid)}
              className={clsx(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                a.active ? "bg-aurora-400/[0.08] text-white" : "cursor-pointer text-slate-300 hover:bg-white/5",
                switching === a.uid && "opacity-50"
              )}
            >
              {a.image ? (
                <RemoteImage src={a.image} className="h-7 w-7 shrink-0 rounded-full" sizes="28px" />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-400">
                  <IconAvatar className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name || "Compte Nebula"}</p>
                {a.email && <p className="truncate text-xs text-slate-500">{a.email}</p>}
              </div>
              {a.active ? (
                <span className="shrink-0 rounded-full border border-aurora-400/40 bg-aurora-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-aurora-300">
                  Actif
                </span>
              ) : (
                <button
                  onClick={(e) => unlink(e, a.uid)}
                  title="Retirer de cet appareil"
                  className="shrink-0 rounded-full p-1 text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                >
                  <IconClose className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}

          {canAddAccount && (
            <button
              onClick={addAccount}
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg border-t border-white/[0.06] px-2.5 py-2.5 text-sm text-aurora-300 transition hover:bg-white/5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-aurora-400/40">
                <IconPlus className="h-3.5 w-3.5" />
              </span>
              Ajouter un compte
            </button>
          )}
        </div>
      )}
    </div>
  );
}
