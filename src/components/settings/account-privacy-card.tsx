"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { IconLock } from "@/components/dashboard/icons";
import { useBootstrap } from "@/components/bootstrap-provider";
import { PASSWORD_MIN_LENGTH, passwordTooLong } from "@/lib/password-rules";

export function AccountPrivacyCard() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const router = useRouter();
  const { data: me, patch: patchMe } = useBootstrap();
  // Compte ouvert avec Google / Apple / Facebook, sans mot de passe Nebula :
  // on en DÉFINIT un (pas d'« ancien mot de passe » à saisir).
  const hasPassword = me?.user.hasPassword ?? true;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Partial<Record<"current" | "next" | "confirm", string>>>({});
  const [savingPassword, setSavingPassword] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // 29/09/2026 : vérifications à l'écran (les erreurs s'affichent sous les
  // champs, plus seulement dans une notification), confirmation du nouveau
  // mot de passe, et session rouverte après le changement (le serveur coupe
  // toutes les sessions, y compris celle-ci).
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const errors: typeof passwordErrors = {};
    if (hasPassword && !currentPassword) errors.current = "Saisissez votre mot de passe actuel.";
    if (newPassword.length < PASSWORD_MIN_LENGTH) errors.next = `${PASSWORD_MIN_LENGTH} caractères minimum.`;
    else if (passwordTooLong(newPassword)) errors.next = "72 caractères au plus.";
    if (!errors.next && confirmPassword !== newPassword) errors.confirm = "Les deux mots de passe ne correspondent pas.";
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;

    setSavingPassword(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: hasPassword ? currentPassword : "", newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Échec du changement de mot de passe.";
        if (/actuel/i.test(message)) setPasswordErrors({ current: message });
        else toast.error(message);
        return;
      }
      // Les sessions ont été coupées : on rouvre celle-ci avec le nouveau mot de passe.
      const relog = await signIn("credentials", { email: data.email ?? me?.user.email ?? "", password: newPassword, redirect: false }).catch(() => null);
      if (!relog || relog.error) {
        toast.success("Mot de passe enregistré. Reconnectez-vous avec le nouveau mot de passe.");
        await signOut({ redirect: false }).catch(() => undefined);
        router.push("/login");
        return;
      }
      toast.success(data.firstTime ? "Mot de passe défini : vous pouvez aussi vous connecter par e-mail." : "Mot de passe changé. Vos autres appareils ont été déconnectés.");
      if (me) patchMe({ user: { ...me.user, hasPassword: true } });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
    } finally {
      setSavingPassword(false);
    }
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
    if (!deleteConfirm) {
      toast.error(hasPassword ? "Entrez votre mot de passe pour confirmer." : "Saisissez votre adresse e-mail pour confirmer.");
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
      body: JSON.stringify(hasPassword ? { password: deleteConfirm } : { confirmEmail: deleteConfirm.trim() })
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

      <form onSubmit={changePassword} className="mt-4 space-y-3 border-t border-white/[0.06] pt-4" noValidate>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{hasPassword ? "Changer de mot de passe" : "Définir un mot de passe"}</p>
        {!hasPassword && (
          <p className="text-sm text-slate-400">
            Vous vous connectez avec Google, Apple ou Facebook. Définissez un mot de passe pour pouvoir aussi vous connecter avec votre adresse e-mail.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {hasPassword && (
            <div className="sm:col-span-2 sm:max-w-[calc(50%-0.375rem)]">
              <PasswordInput
                label="Mot de passe actuel"
                name="current-password"
                id="settings-current-password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={passwordErrors.current}
              />
            </div>
          )}
          <PasswordInput
            label="Nouveau mot de passe"
            name="new-password"
            id="settings-new-password"
            autoComplete="new-password"
            showStrength
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={passwordErrors.next}
            placeholder="8 caractères minimum"
          />
          <PasswordInput
            label="Confirmer le nouveau mot de passe"
            name="confirm-password"
            id="settings-confirm-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={passwordErrors.confirm}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={savingPassword}>
            {savingPassword ? "Enregistrement..." : hasPassword ? "Mettre à jour le mot de passe" : "Définir le mot de passe"}
          </Button>
          {hasPassword && (
            <Link href="/forgot-password" className="text-xs text-slate-400 hover:text-aurora-300 hover:underline">
              Mot de passe actuel oublié ?
            </Link>
          )}
        </div>
        <p className="text-xs text-slate-500">Après le changement, vos autres appareils sont déconnectés et un e-mail de confirmation vous est envoyé.</p>
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
        <p className="text-xs font-medium uppercase tracking-wide text-red-400">Zone de danger</p>
        <p className="mt-1 text-sm text-slate-400">
          Supprime définitivement votre compte, vos marques et toutes les publications associées. Irréversible.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type={hasPassword ? "password" : "email"}
            name={hasPassword ? "delete-account-password" : "delete-account-email"}
            id="settings-delete-password"
            autoComplete={hasPassword ? "current-password" : "off"}
            aria-label={hasPassword ? "Votre mot de passe, pour confirmer" : "Votre adresse e-mail, pour confirmer"}
            placeholder={hasPassword ? "Votre mot de passe" : "Votre adresse e-mail"}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="w-56 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-red-400/60"
          />
          <Button variant="danger" onClick={deleteAccount} disabled={deleting}>
            {deleting ? "Suppression..." : "Supprimer mon compte"}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
