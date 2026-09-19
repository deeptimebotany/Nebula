"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { IconLock } from "@/components/dashboard/icons";

export function AccountPrivacyCard() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    const res = await fetch("/api/settings/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    setSavingPassword(false);
    if (!res.ok) {
      toast.error(data.error ?? "Échec du changement de mot de passe.");
      return;
    }
    toast.success("Mot de passe mis à jour.");
    setCurrentPassword("");
    setNewPassword("");
  }

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/settings/export");
      if (!res.ok) throw new Error("Échec de l'export.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nebula-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Échec du téléchargement de vos données.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (!deletePassword) {
      toast.error("Entrez votre mot de passe pour confirmer.");
      return;
    }
    const ok = await confirmDialog({
      title: "Supprimer définitivement votre compte ?",
      message: "Cette action est irréversible : vos marques, publications et médias seront effacés. Impossible à annuler.",
      confirmLabel: "Oui, tout supprimer",
      danger: true
    });
    if (!ok) return;

    setDeleting(true);
    const res = await fetch("/api/settings/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: deletePassword })
    });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      toast.error(data.error ?? "Échec de la suppression du compte.");
      return;
    }
    toast.success("Compte supprimé.");
    await signOut({ redirect: false });
    router.push("/");
  }

  return (
    <GlassCard>
      <h2 className="flex items-center gap-2 font-display text-base font-medium text-white">
        <IconLock className="h-4 w-4 text-slate-400" /> Compte &amp; confidentialité
      </h2>
      <p className="mt-1 text-sm text-slate-400">Sécurité de votre compte et contrôle de vos données personnelles.</p>

      <form onSubmit={changePassword} className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Changer de mot de passe</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="password"
            required
            placeholder="Mot de passe actuel"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Nouveau mot de passe (8 car. min.)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
          />
        </div>
        <Button type="submit" variant="outline" disabled={savingPassword}>
          {savingPassword ? "Mise à jour..." : "Mettre à jour le mot de passe"}
        </Button>
      </form>

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Vos données</p>
        <p className="mt-1 text-sm text-slate-400">
          Téléchargez une copie de vos données personnelles (profil, marques, publications, comptes connectés) au
          format JSON.
        </p>
        <Button variant="outline" className="mt-3" onClick={exportData} disabled={exporting}>
          {exporting ? "Préparation..." : "Télécharger mes données"}
        </Button>
      </div>

      <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-red-400/80">Zone de danger</p>
        <p className="mt-1 text-sm text-slate-400">
          Supprime définitivement votre compte, vos marques et toutes les publications associées. Irréversible.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="password"
            placeholder="Votre mot de passe"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className="w-48 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-red-400/60"
          />
          <Button variant="danger" onClick={deleteAccount} disabled={deleting}>
            {deleting ? "Suppression..." : "Supprimer mon compte"}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
