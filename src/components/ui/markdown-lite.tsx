"use client";

// Rendu « markdown léger » SANS innerHTML, pour afficher les réponses de
// l'assistant IA : titres « ## » / « ### », listes « - » et « 1. », gras
// « **…** », code inline « `…` », paragraphes séparés par une ligne vide.
// Tout passe par des nœuds React : un texte venant du modèle ne peut jamais
// injecter de balise. Volontairement minimal — pas de tableaux, pas de liens
// cliquables (le socle système demande à l'IA de s'en tenir à ce sous-
// ensemble, voir src/lib/ai/assistant-prompts.ts).

import { Fragment, type ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Découpe sur **gras** et `code` en gardant les délimiteurs capturés.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[12px] text-aurora-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; lines: string[] };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      blocks.push({ kind: "h3", text: trimmed.replace(/^###\s+/, "") });
      i++;
      continue;
    }
    if (/^##?\s+/.test(trimmed)) {
      blocks.push({ kind: "h2", text: trimmed.replace(/^##?\s+/, "") });
      i++;
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    // Paragraphe : lignes consécutives non vides qui ne sont ni titre ni liste.
    const para: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || /^###?\s+/.test(t) || /^#\s+/.test(t) || /^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) break;
      para.push(t);
      i++;
    }
    blocks.push({ kind: "p", lines: para });
  }
  return blocks;
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const key = `b${bi}`;
        switch (block.kind) {
          case "h2":
            return (
              <h3 key={key} className="mb-1 mt-4 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-aurora-200 first:mt-0">
                {renderInline(block.text, key)}
              </h3>
            );
          case "h3":
            return (
              <h4 key={key} className="mb-1 mt-3 text-sm font-semibold text-white first:mt-0">
                {renderInline(block.text, key)}
              </h4>
            );
          case "ul":
            return (
              <ul key={key} className="my-1.5 space-y-1 pl-4">
                {block.items.map((item, ii) => (
                  <li key={`${key}-${ii}`} className="list-disc leading-relaxed marker:text-slate-500">
                    {renderInline(item, `${key}-${ii}`)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="my-1.5 space-y-1 pl-4">
                {block.items.map((item, ii) => (
                  <li key={`${key}-${ii}`} className="list-decimal leading-relaxed marker:text-slate-500">
                    {renderInline(item, `${key}-${ii}`)}
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={key} className="my-1.5 leading-relaxed first:mt-0 last:mb-0">
                {block.lines.map((l, li) => (
                  <Fragment key={`${key}-${li}`}>
                    {li > 0 && <br />}
                    {renderInline(l, `${key}-${li}`)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
