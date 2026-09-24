import { NextRequest } from "next/server";
import { startIntegrationOAuth } from "@/lib/integrations/oauth-routes";
import { oneDriveAuthUrl } from "@/lib/integrations/onedrive";

// GET /api/integrations/onedrive/start?returnTo=/composer — relier OneDrive (lot 3).
export function GET(req: NextRequest) {
  return startIntegrationOAuth(req, "onedrive", (state) => oneDriveAuthUrl(state));
}
