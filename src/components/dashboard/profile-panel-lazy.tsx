"use client";

// Panneau « Mon profil » monté à la première ouverture seulement (audit
// performance, lot 4) : badges, easter eggs, parrainage et classement ne
// sont téléchargés — et leurs 5 appels d'API lancés — que si la personne
// ouvre réellement son profil.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { PROFILE_OPEN_EVENT, type ProfileSection } from "./profile-panel-events";

const ProfilePanel = dynamic(() => import("./profile-panel").then((m) => m.ProfilePanel), { ssr: false });

export function ProfilePanelLazy() {
  const [first, setFirst] = useState<{ section: ProfileSection | null } | null>(null);

  useEffect(() => {
    if (first) return;
    function onOpen(e: Event) {
      setFirst({ section: (e as CustomEvent<ProfileSection | undefined>).detail ?? null });
    }
    window.addEventListener(PROFILE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(PROFILE_OPEN_EVENT, onOpen);
  }, [first]);

  if (!first) return null;
  return <ProfilePanel initialSection={first.section} />;
}
