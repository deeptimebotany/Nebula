import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";

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
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 8px ${meta.glow}` }}
      />
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
