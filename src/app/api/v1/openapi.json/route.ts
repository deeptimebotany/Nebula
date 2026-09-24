import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";

// GET /api/v1/openapi.json — description de l'API (publique, sans clé).
export function GET() {
  const base = (process.env.NEXTAUTH_URL || "https://nebulahub.space").replace(/\/$/, "");
  return NextResponse.json(openApiSpec(base), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
}
