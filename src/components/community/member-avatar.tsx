"use client";

// Photo d'un membre dans la Communauté (10/10/2026, demande de Lucas) :
// cliquer dessus ouvre sa petite bulle de profil (profile-bubble.tsx).
// Sans photo : la première lettre du pseudo, jamais du nom.
import { useRef, useState } from "react";
import { AvatarRing } from "@/components/reussites/avatar-ring";
import { RemoteImage } from "@/components/ui/remote-image";
import type { RingStyle } from "@/lib/reussites/catalog";
import { clsx } from "@/lib/clsx";
import { ProfileBubble } from "./profile-bubble";

export interface MemberLike {
  id: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  ring?: RingStyle | null;
}

/** « @comete4821 » → « C ». */
export function handleInitial(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/^@+/, "").trim();
  return (clean[0] ?? "?").toUpperCase();
}

export function MemberAvatar({ author, size = 36, className, interactive = true }: { author: MemberLike | null | undefined; size?: number; className?: string; interactive?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const face = (
    <AvatarRing ring={author?.ring} shapeClassName="rounded-full">
      {author?.avatarUrl ? (
        <span className="block shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
          <RemoteImage src={author.avatarUrl} className="h-full w-full" sizes={`${size}px`} fallback={<Initial name={author?.name} size={size} />} />
        </span>
      ) : (
        <Initial name={author?.name} size={size} />
      )}
    </AvatarRing>
  );
  if (!author || !interactive) return <span className={clsx("inline-flex shrink-0", className)} style={{ width: size, height: size }}>{face}</span>;
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Profil de ${author.name}`}
        data-testid="member-avatar"
        className={clsx("relative z-10 inline-flex shrink-0 rounded-full transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aurora-400", className)}
        style={{ width: size, height: size }}
      >
        {face}
      </button>
      {open && <ProfileBubble member={author} anchor={ref.current} onClose={() => setOpen(false)} />}
    </>
  );
}

function Initial({ name, size }: { name: string | null | undefined; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-nebula-600/70 to-accent-cyan/40 font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) }}
      aria-hidden="true"
    >
      {handleInitial(name)}
    </span>
  );
}
