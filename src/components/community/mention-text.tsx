"use client";

// Texte d'un message de la Communauté avec les mentions « @pseudo » en liens
// vers la page de profil (10/10/2026). Le reste du texte est affiché tel quel
// (jamais de HTML interprété).
import Link from "next/link";
import { Fragment } from "react";
import { splitMentions } from "@/lib/community/mention-rules";

export function MentionText({ text, links = true }: { text: string; links?: boolean }) {
  return (
    <>
      {splitMentions(text).map((part, i) =>
        part.kind === "text" ? (
          <Fragment key={i}>{part.text}</Fragment>
        ) : links ? (
          <Link key={i} href={`/community/membre/${part.handle}`} className="font-medium text-aurora-300 hover:text-white hover:underline" onClick={(e) => e.stopPropagation()} data-testid="mention-link">
            {part.text}
          </Link>
        ) : (
          <span key={i} className="font-medium text-aurora-300">
            {part.text}
          </span>
        )
      )}
    </>
  );
}
