import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { connectionIdFromRequest, proxyJson } from "@/lib/whatsappServiceProxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const u = await getRouteSessionUser();
  if (!u) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cid = connectionIdFromRequest(request);
  const u0 = new URL(request.url);
  const clear = u0.searchParams.get("clear");
  const search = clear ? "?clear=1" : "";
  return proxyJson("GET", `/v1/connections/${encodeURIComponent(cid)}/qr`, {
    search,
  });
}
