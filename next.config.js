/** @type {import('next').NextConfig} */

// En-têtes de sécurité envoyés sur TOUTES les réponses (pages et API).
// - HSTS : force HTTPS pendant 2 ans, sous-domaines compris (Vercel sert déjà
//   en HTTPS, l'en-tête évite qu'un navigateur retente un jour en clair).
// - X-Frame-Options SAMEORIGIN : le site ne peut pas être affiché dans une
//   iframe d'un autre domaine (protection "clickjacking"). L'application
//   Windows (Electron) charge le site directement, pas en iframe : non
//   concernée.
// - nosniff / Referrer-Policy / Permissions-Policy : durcissements standard,
//   sans effet sur le fonctionnement (aucune fonctionnalité n'utilise la
//   caméra, le micro, la géolocalisation ni l'API Payment Request — Stripe
//   passe par une redirection vers sa page de paiement).
// - La Content-Security-Policy, elle, est posée par src/middleware.ts (elle a
//   besoin d'un nonce différent à chaque requête, impossible ici).
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" }
];

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb"
    }
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }
    ]
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  // /terms et /privacy ont été fusionnées en une seule page /legal (certains
  // formulaires tiers, ex. TikTok Developer Portal, n'acceptent qu'une seule
  // URL "legal"). On garde les deux anciennes URLs fonctionnelles via
  // redirection permanente, pour ne pas casser un lien déjà soumis ailleurs.
  async redirects() {
    return [
      { source: "/terms", destination: "/legal#conditions", permanent: true },
      { source: "/privacy", destination: "/legal#confidentialite", permanent: true }
    ];
  }
};

module.exports = nextConfig;
