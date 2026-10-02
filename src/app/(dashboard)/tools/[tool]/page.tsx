import { notFound } from "next/navigation";
import { AppToolView } from "@/components/tools/app-tool-view";
import { APP_TOOL_SLUGS, type ToolSlug } from "@/components/tools/tool-catalog";
import { enabledAuditSources } from "@/lib/audit/config";

// Un outil dans l'application (02/10/2026) : /tools/taux-engagement,
// /tools/meilleur-moment, /tools/bio-instagram, /tools/hashtags,
// /tools/titre-youtube, /tools/audit. Les sources de l'audit dépendent des
// clés présentes sur le serveur, lues ici.
export default function AppToolPage({ params }: { params: { tool: string } }) {
  if (!(APP_TOOL_SLUGS as string[]).includes(params.tool)) notFound();
  const slug = params.tool as Exclude<ToolSlug, "publier">;
  return <AppToolView slug={slug} auditSources={slug === "audit" ? enabledAuditSources() : undefined} />;
}
