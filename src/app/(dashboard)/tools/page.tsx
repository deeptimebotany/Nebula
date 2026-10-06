import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { IconWrench } from "@/components/dashboard/icons";
import { TOOL_CATALOG } from "@/components/tools/tool-catalog";

// Menu « Outils » de l'application (02/10/2026) : les outils de /outils,
// une fois connecté, préremplis avec la marque active. (Le Générateur de
// publications, qui renvoyait vers Publier, est retiré le 06/10/2026.)
export default function AppToolsHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconWrench className="h-5 w-5" />}
        title="Outils"
        description="Les outils gratuits du site, remplis avec les chiffres et les comptes de votre marque. Ceux qui utilisent l'IA comptent dans le quota de votre palier."
      />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TOOL_CATALOG.map((tool) => (
          <li key={tool.slug}>
            <Link href={tool.appHref} className="block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400">
              <GlassCard className="h-full transition hover:border-aurora-400/30">
                <div className="flex items-start justify-between gap-3">
                  <tool.icon className="h-6 w-6 text-aurora-300" />
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400">{tool.ai ? "IA · quota du palier" : "Sans IA"}</span>
                </div>
                <h2 className="mt-3 font-display text-lg font-medium text-white">{tool.title}</h2>
                <p className="mt-2 text-sm text-slate-400">{tool.appDesc}</p>
                <span className="mt-4 inline-block text-sm font-medium text-aurora-300" aria-hidden="true">
                  Ouvrir →
                </span>
              </GlassCard>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
