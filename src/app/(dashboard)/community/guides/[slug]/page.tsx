"use client";

import { useEffect, useState } from "react";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";

interface Guide {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
}

export default function GuideDetailPage() {
  const params = useParams<{ slug: string }>();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/community/guides/${params.slug}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setGuide(data.guide);
        else setNotFound(true);
      });
  }, [params.slug]);

  if (notFound) return <p className="text-sm text-slate-500">Guide introuvable.</p>;
  if (!guide) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-7 w-1/2" />
        <SkeletonText lines={6} />
        <span className="sr-only">Chargement du guide</span>
      </div>
    );
  }

  // Le corps est écrit en markdown léger (titres "## ", listes "- ") dans le
  // seed — on le rend en HTML très simple, sans dépendance externe.
  const html = guide.body
    .split("\n\n")
    .map((block) => {
      if (block.startsWith("## ")) return `<h2>${block.slice(3)}</h2>`;
      if (block.split("\n").every((l) => l.startsWith("- ") || l.trim() === "")) {
        const items = block.split("\n").filter(Boolean).map((l) => `<li>${l.slice(2)}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/community?tab=guides" className="text-xs text-slate-500 hover:text-slate-300">← Retour aux guides</Link>
      <GlassCard>
        <h1 className="font-display text-2xl font-semibold text-white">{guide.title}</h1>
        <p className="mt-1 text-sm text-slate-400">{guide.summary}</p>
        <div
          className="prose-invert mt-5 space-y-3 text-sm leading-relaxed text-slate-300 [&_h2]:mt-5 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-white [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </GlassCard>
    </div>
  );
}
