// Détecte quels boutons de connexion rapide afficher (voir login-form.tsx /
// register-form.tsx) selon les variables d'env réellement renseignées — pas
// besoin de toucher au code pour activer Google et/ou Apple, juste .env.
export function getEnabledOAuthProviders() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
    facebook: Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET)
  };
}
