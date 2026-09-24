// Description OpenAPI 3.0 de l'API publique v1 (lot 4) : servie sur
// /api/v1/openapi.json, importable telle quelle dans n8n, Make, Postman ou
// un connecteur personnalisé Power Automate.
import { NETWORKS, POST_STATUSES } from "@/lib/types";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";

export function openApiSpec(baseUrl: string) {
  const err = { $ref: "#/components/schemas/Error" };
  const errors = {
    "401": { description: "Clé manquante, inconnue ou révoquée", content: { "application/json": { schema: err } } },
    "403": { description: "Palier Agence requis, portée ou marque insuffisante", content: { "application/json": { schema: err } } },
    "429": { description: "Plus de 120 requêtes par minute", content: { "application/json": { schema: err } } }
  };
  const brandIdQuery = { name: "brandId", in: "query", required: true, schema: { type: "string" } };
  return {
    openapi: "3.0.3",
    info: {
      title: "API Nebula",
      version: "1.0.0",
      description:
        "API publique de Nebula (palier Agence). Authentification : en-tête Authorization: Bearer nbk_… (clé créée dans Automatisations). 120 requêtes par minute et par clé. Les webhooks sont signés : en-tête Nebula-Signature « t=<horodatage>,v1=<HMAC-SHA256(secret, t + '.' + corps)> »."
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "nbk_…" } },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] } }
        },
        Brand: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, role: { type: "string", enum: ["OWNER", "EDITOR", "VIEWER"] } } },
        Connection: {
          type: "object",
          properties: {
            id: { type: "string" },
            network: { type: "string", enum: [...NETWORKS] },
            name: { type: "string" },
            handle: { type: "string", nullable: true },
            status: { type: "string" },
            expiresAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        Post: {
          type: "object",
          properties: {
            id: { type: "string" },
            brandId: { type: "string" },
            title: { type: "string" },
            caption: { type: "string" },
            status: { type: "string", enum: [...POST_STATUSES] },
            scheduledAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            url: { type: "string", description: "Page de la publication dans Nebula" },
            targets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  network: { type: "string" },
                  status: { type: "string" },
                  account: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, handle: { type: "string", nullable: true } } },
                  postUrl: { type: "string", nullable: true },
                  error: { type: "string", nullable: true },
                  publishedAt: { type: "string", format: "date-time", nullable: true }
                }
              }
            }
          }
        },
        Webhook: {
          type: "object",
          properties: {
            id: { type: "string" },
            url: { type: "string" },
            description: { type: "string", nullable: true },
            events: { type: "array", items: { type: "string", enum: WEBHOOK_EVENTS.map((e) => e.id) } },
            brandId: { type: "string", nullable: true },
            active: { type: "boolean" },
            secret: { type: "string", description: "Renvoyé uniquement à la création" }
          }
        }
      }
    },
    paths: {
      "/me": { get: { summary: "Compte lié à la clé", operationId: "getMe", responses: { "200": { description: "OK" }, ...errors } } },
      "/brands": {
        get: {
          summary: "Marques accessibles",
          operationId: "listBrands",
          responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Brand" } } } } } } }, ...errors }
        }
      },
      "/brands/{brandId}/connections": {
        get: {
          summary: "Comptes connectés d'une marque",
          operationId: "listConnections",
          parameters: [{ name: "brandId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Connection" } } } } } } }, ...errors }
        }
      },
      "/posts": {
        get: {
          summary: "Lister les publications",
          operationId: "listPosts",
          parameters: [
            { name: "brandId", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string", enum: [...POST_STATUSES] } },
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
            { name: "cursor", in: "query", schema: { type: "string" } }
          ],
          responses: {
            "200": {
              description: "OK",
              content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Post" } }, nextCursor: { type: "string", nullable: true } } } } }
            },
            ...errors
          }
        },
        post: {
          summary: "Créer une publication (brouillon, programmée ou immédiate)",
          operationId: "createPost",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["brandId"],
                  properties: {
                    brandId: { type: "string" },
                    caption: { type: "string" },
                    title: { type: "string" },
                    firstComment: { type: "string" },
                    networks: { type: "array", items: { type: "string", enum: [...NETWORKS] }, description: "Premier compte connecté de chaque réseau" },
                    connectionIds: { type: "array", items: { type: "string" }, description: "Ou des comptes précis" },
                    mediaIds: { type: "array", items: { type: "string" }, description: "Identifiants renvoyés par POST /media" },
                    scheduledAt: { type: "string", format: "date-time", description: "Date future : publication programmée" },
                    publishNow: { type: "boolean", default: false },
                    overrides: { type: "object", additionalProperties: { type: "object", properties: { caption: { type: "string" }, title: { type: "string" } } } }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Créée", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Post" } } } } } }, "400": { description: "Requête invalide", content: { "application/json": { schema: err } } }, "402": { description: "Quota du palier atteint", content: { "application/json": { schema: err } } }, ...errors }
        }
      },
      "/posts/{id}": {
        get: { summary: "Une publication", operationId: "getPost", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" }, "404": { description: "Introuvable" }, ...errors } },
        delete: { summary: "Supprimer un brouillon ou une publication programmée", operationId: "deletePost", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Supprimée" }, "409": { description: "Déjà publiée" }, ...errors } }
      },
      "/media": {
        post: {
          summary: "Ajouter un média depuis une adresse https publique",
          operationId: "createMedia",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["brandId", "url"], properties: { brandId: { type: "string" }, url: { type: "string" }, filename: { type: "string" } } } } } },
          responses: { "201": { description: "Créé" }, ...errors }
        }
      },
      "/analytics": { get: { summary: "Derniers chiffres de chaque compte", operationId: "getAnalytics", parameters: [brandIdQuery], responses: { "200": { description: "OK" }, ...errors } } },
      "/ads": {
        get: {
          summary: "Dépenses et résultats publicitaires (Google Ads, Meta Ads, TikTok Ads)",
          description: "Totaux de la période (dépense, impressions, clics, conversions, CTR, CPC, coût par conversion), comparaison avec la période précédente, détail par régie et par jour, campagnes des 30 derniers jours. Une seule devise à la fois : voir `currencies` et le paramètre `currency`.",
          operationId: "getAds",
          parameters: [
            brandIdQuery,
            { name: "days", in: "query", required: false, schema: { type: "integer", enum: [7, 30, 90], default: 30 } },
            { name: "currency", in: "query", required: false, schema: { type: "string", example: "EUR" } }
          ],
          responses: { "200": { description: "OK" }, ...errors }
        }
      },
      "/webhooks": {
        get: { summary: "Lister les webhooks", operationId: "listWebhooks", responses: { "200": { description: "OK" }, ...errors } },
        post: {
          summary: "S'abonner à des événements",
          operationId: "createWebhook",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url", "events"],
                  properties: { url: { type: "string" }, events: { type: "array", items: { type: "string", enum: WEBHOOK_EVENTS.map((e) => e.id) } }, brandId: { type: "string" }, description: { type: "string" } }
                }
              }
            }
          },
          responses: { "201": { description: "Créé (avec le secret de signature)", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Webhook" } } } } } }, ...errors }
        }
      },
      "/webhooks/{id}": { delete: { summary: "Se désabonner", operationId: "deleteWebhook", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Supprimé" }, ...errors } } }
    }
  };
}
