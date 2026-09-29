// Intro de création de compte après une inscription Google / Apple /
// Facebook : la création du compte a lieu côté serveur (callback NextAuth,
// createOAuthUser dans lib/auth.ts), qui pose ce cookie ; le tableau de bord
// le lit et joue l'intro une fois (welcome-intro.tsx), puis le navigateur
// l'efface à la fin. Aucun identifiant dedans (valeur « 1 »), 10 minutes au plus.
export const WELCOME_INTRO_COOKIE = "nb_welcome";
export const WELCOME_INTRO_MAX_AGE = 600;
