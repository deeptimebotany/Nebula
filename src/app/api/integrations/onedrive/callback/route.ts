import { NextRequest } from "next/server";
import { finishIntegrationOAuth } from "@/lib/integrations/oauth-routes";
import { exchangeOneDriveCode, oneDriveDisplayName } from "@/lib/integrations/onedrive";

// GET /api/integrations/onedrive/callback — retour de Microsoft après autorisation.
export function GET(req: NextRequest) {
  return finishIntegrationOAuth(req, "onedrive", (code) => exchangeOneDriveCode(code), oneDriveDisplayName);
}
