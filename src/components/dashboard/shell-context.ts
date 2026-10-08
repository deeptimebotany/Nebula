"use client";

// Vrai dans l'application connectée (voir app-shell.tsx) : <PageHeader> sait
// dès le rendu serveur que son titre ira dans la barre du haut, et ne
// l'affiche donc jamais dans la page (pas de saut à l'hydratation).
import { createContext } from "react";

export const InShellContext = createContext(false);
