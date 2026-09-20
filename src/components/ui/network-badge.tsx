import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { IconTikTok, IconYouTube, IconInstagram, IconFacebook } from "@/components/dashboard/icons";

const NETWORK_ICONS: Record<Network, (props: { className?: string }) => JSX.Element> = {
  TIKTOK: IconTikTok,
  YOUTUBE: IconYouTube,
  INSTAGRAM: IconInstagram,
  FACEBOOK: IconFacebook
};

/** Glyphe du réseau (voir icons.tsx) — utilisé notamment dans "Réseaux cibles". */
export function NetworkLogo({ network, className = "h-5 w-5" }: { network: Network; className?: string }) {
  const Icon = NETWORK_ICONS[network];
  return <Icon className={className} />;
}

export function NetworkBadge({ network, size = "md" }: { network: Network; size?: "sm" | "md" }) {
  const meta = NETWORK_META[network];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      )}
      style={{
        borderColor: `${meta.color}55`,
        background: `${meta.color}14`,
        color: meta.color
      }}
    >
      <NetworkLogo network={network} className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {meta.label}
    </span>
  );
}

export function NetworkDot({ network }: { network: Network }) {
  const meta = NETWORK_META[network];
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: meta.color, boxShadow: `0 0 10px ${meta.glow}` }}
      title={meta.label}
    />
  );
}
