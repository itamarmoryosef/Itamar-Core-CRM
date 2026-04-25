import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { connectionIdFromRequest, proxyJson } from "@/lib/whatsappServiceProxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const u = await getRouteSessionUser();
  if (!u) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cid = connectionIdFromRequest(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  return proxyJson("POST", `/v1/connections/${encodeURIComponent(cid)}/pairing`, {
    body,
  });
}
