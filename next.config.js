/** @type {import('next').NextConfig} */
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
