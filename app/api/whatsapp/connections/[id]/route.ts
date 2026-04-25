import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { proxyJson } from "@/lib/whatsappServiceProxy";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const u = await getRouteSessionUser();
  if (!u) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  return proxyJson("DELETE", `/v1/connections/${encodeURIComponent(id)}`);
}
