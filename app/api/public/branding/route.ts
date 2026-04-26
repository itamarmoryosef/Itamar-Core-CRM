import { NextResponse } from "next/server";
import { getResolvedBranding } from "@/lib/brandingResolve";

export const dynamic = "force-dynamic";

/**
 * Public branding for client UI (portals) — no auth; read from `settings` + env fallback.
 */
export async function GET() {
  try {
    const b = await getResolvedBranding();
    return NextResponse.json({
      businessName: b.businessName,
      tagline: b.tagline,
      primary: b.primary,
      secondary: b.secondary,
      logoUrl: b.logoUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
