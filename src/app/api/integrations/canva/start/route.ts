import { NextRequest } from "next/server";
import { startIntegrationOAuth } from "@/lib/integrations/oauth-routes";
import { canvaAuthUrl } from "@/lib/integrations/canva";

// GET /api/integrations/canva/start?returnTo=/composer — relier Canva (lot 3).
export function GET(req: NextRequest) {
  return startIntegrationOAuth(req, "canva", (state, challenge) => canvaAuthUrl(state, challenge));
}
