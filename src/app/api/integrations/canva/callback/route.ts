import { NextRequest } from "next/server";
import { finishIntegrationOAuth } from "@/lib/integrations/oauth-routes";
import { canvaDisplayName, exchangeCanvaCode } from "@/lib/integrations/canva";

// GET /api/integrations/canva/callback — retour de Canva après autorisation.
export function GET(req: NextRequest) {
  return finishIntegrationOAuth(req, "canva", exchangeCanvaCode, canvaDisplayName);
}
