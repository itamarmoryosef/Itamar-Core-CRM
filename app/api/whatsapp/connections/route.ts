import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { proxyJson } from "@/lib/whatsappServiceProxy";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getRouteSessionUser();
  if (!u) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return proxyJson("GET", "/v1/connections");
}

export async function POST(request: Request) {
  const u = await getRouteSessionUser();
  if (!u) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  return proxyJson("POST", "/v1/connections", { body });
}
