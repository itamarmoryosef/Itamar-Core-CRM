import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { connectionIdFromRequest, proxyJson } from "@/lib/whatsappServiceProxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const u = await getRouteSessionUser();
  if (!u) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cid = connectionIdFromRequest(request);
  return proxyJson("GET", `/v1/connections/${encodeURIComponent(cid)}/status`);
}
