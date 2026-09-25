// Adresses (clés de cache) des données partagées — voir hooks.ts. Module sans
// « use client » : le serveur s'en sert aussi pour préparer ces données
// (lot 10, voir SeededData dans swr-config.tsx).
export const connectionsKey = (brandId: string) => `/api/connections?brandId=${brandId}`;
export const aiStatusKey = (brandId: string) => `/api/ai/status?brandId=${brandId}`;
export const analyticsKey = (brandId: string) => `/api/analytics?brandId=${brandId}`;
