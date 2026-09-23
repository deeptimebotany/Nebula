// Types partagés entre la page Publier (src/app/(dashboard)/composer/page.tsx)
// et ses sous-composants (src/components/composer/*), extraits au Lot 4.
import type { Network } from "@/lib/types";

export interface UploadedAsset {
  id: string;
  url: string;
  filename: string;
  type: "VIDEO" | "IMAGE";
  previewUrl: string;
  thumbnailUrl?: string;
}

export interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
}

export interface NetworkOverride {
  open: boolean;
  title: string;
  caption: string;
}

export type ScheduleMode = "now" | "date";
