"use client";

// Sélecteur de marque (espace de travail actif) — vit en haut de la barre
// latérale depuis le Lot 3 (avant : ligne 2 de l'ancienne barre du haut).
// Liste les marques du compte, bascule, et permet d'en créer une nouvelle
// dans la limite du palier (lue dans le bootstrap /api/me).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useBrand } from "@/components/brand-context";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useCosmetics } from "@/components/cosmetics-provider";
import { useToast } from "@/components/dashboard/toast";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import type { Plan } from "@/lib/plans";
import { IconAvatar, IconChevron, IconPlus } from "./icons";
import { UpgradeGem } from "./upgrade-gem";

const PLAN_BADGE_STYLE: Record<Plan, string> = {
  FREE: "border-white/15 bg-white/[0.04] text-slate-400",
  PRO: "border-aurora-400/40 bg-aurora-400/10 text-aurora-300",
  AGENCY: "border-amber-400/40 bg-amber-400/10 text-amber-300"
};

const PLAN_LABEL: Record<Plan, string> = { FREE: "Gratuit", PRO: "Pro", AGENCY: "Agence" };

export function BrandSwitcher({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { brands, activeBrand, setActiveBrandId, createBrand } = useBrand();
  const { data, refresh } = useBootstrap();
  const cosmetics = useCosmetics();
  const toast = useToast();

  const plan: Plan = data?.plan ?? "FREE";
  const maxBrands = data?.maxBrands ?? 1;
  const brandsOwned = data?.brandsOwned ?? brands.length;
  const atBrandLimit = brandsOwned >= maxBrands;

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  // Easter egg : double-clic sur l'avatar (façon « like » Instagram) — un
  // petit cœur flotte puis disparaît.
  const [heart, setHeart] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function submitNewBrand() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await createBrand(newName.trim());
    setCreating(false);
    if (!res.ok) {
      toast.error(res.error ?? "Erreur lors de la création de la marque.");
      return;
    }
    toast.success(`Marque « ${newName.trim()} » créée.`);
    setNewName("");
    setAdding(false);
    setOpen(false);
    refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={() => {
          setHeart(true);
          reportEasterEggFound("avatar-double-tap");
          window.setTimeout(() => setHeart(false), 700);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={compact ? (activeBrand?.name ?? "Sélectionner une marque") : "Changer de marque"}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:border-white/20 hover:bg-white/[0.05]",
          compact ? "justify-center p-2" : "px-3 py-2"
        )}
      >
        {heart && (
          <span className="pointer-events-none absolute -top-3 left-3 text-lg" style={{ animation: "nebula-avatar-heart 0.7s ease-out forwards" }} aria-hidden="true">
            ❤️
          </span>
        )}
        <span
          className={clsx(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-nebula-600/60 to-accent-cyan/30 font-display text-sm font-semibold text-white",
            cosmetics.has("anneau-saturne-avatar") && "nebula-cosmetic-saturn-ring",
            cosmetics.has("halo-dore-avatar") && "nebula-cosmetic-gold-halo"
          )}
        >
          {activeBrand ? activeBrand.name.charAt(0).toUpperCase() : <IconAvatar className="h-4 w-4 text-slate-300" />}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{activeBrand?.name ?? "Sélectionner une marque"}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className={clsx("rounded-full border px-1.5 text-[9px] font-semibold uppercase tracking-wide leading-4", PLAN_BADGE_STYLE[plan])}>{PLAN_LABEL[plan]}</span>
                {brands.length > 1 ? `${brands.length} marques` : "1 marque"}
              </span>
            </span>
            <IconChevron className={clsx("h-3.5 w-3.5 shrink-0 text-slate-500 transition", open && "rotate-180")} />
          </>
        )}
      </button>

      {open && (
        <div role="menu" className={clsx("glass-panel-solid absolute z-30 w-72 rounded-xl p-1.5", compact ? "left-full top-0 ml-2" : "left-0 top-[calc(100%+6px)]")}>
          <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-slate-500">
            Vos marques · {brandsOwned}/{maxBrands}
          </p>
          {brands.map((b) => (
            <button
              key={b.id}
              role="menuitemradio"
              aria-checked={b.id === activeBrand?.id}
              onClick={() => {
                setActiveBrandId(b.id);
                setOpen(false);
                onNavigate?.();
              }}
              className={clsx(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm",
                b.id === activeBrand?.id ? "bg-nebula-600/30 text-white" : "text-slate-300 hover:bg-white/5"
              )}
            >
              <span className="truncate">{b.name}</span>
              <span className="text-[11px] uppercase text-slate-500">{b.role === "OWNER" ? "Propriétaire" : b.role}</span>
            </button>
          ))}
          {brands.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Aucune marque encore.</p>}

          <div className="mt-1 border-t border-white/[0.06] pt-1.5">
            {atBrandLimit ? (
              <Link
                href="/billing"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
              >
                <UpgradeGem className="h-4 w-4 opacity-70" />
                Limite de marques atteinte — voir les paliers
              </Link>
            ) : adding ? (
              <div className="space-y-2 p-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNewBrand()}
                  placeholder="Nom de la nouvelle marque"
                  aria-label="Nom de la nouvelle marque"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={submitNewBrand}
                    disabled={creating || !newName.trim()}
                    className="rounded-lg bg-gradient-to-r from-nebula-500 to-accent-cyan px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {creating ? "Création..." : "Créer"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
              >
                <IconPlus className="h-4 w-4" /> Ajouter une marque
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
