import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isProfilePlatformSuper } from "@/lib/teamAdmin";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * List all organizations (platform super only; service role for consistent reads).
 */
export async function GET() {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createServiceRoleSupabase();
  if (!(await isProfilePlatformSuper(admin, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await admin
    .from("organizations")
    .select("id, name, slug, branding_settings, created_at")
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ organizations: data ?? [] });
}

type BodyCreate = { name: string; slug: string; branding_settings?: unknown };

/**
 * Create organization.
 */
export async function POST(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createServiceRoleSupabase();
  if (!(await isProfilePlatformSuper(admin, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: BodyCreate;
  try {
    body = (await request.json()) as BodyCreate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? "")
    .trim()
    .toLowerCase();
  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }
  if (!SLUG_RE.test(slug) || slug.length < 2) {
    return NextResponse.json(
      { error: "slug: lowercase a-z, digits, hyphens, 2–64 chars" },
      { status: 400 }
    );
  }
  const branding = body.branding_settings && typeof body.branding_settings === "object"
    ? body.branding_settings
    : {};
  const { data, error } = await admin
    .from("organizations")
    .insert({
      name,
      slug,
      branding_settings: branding as object,
    })
    .select("id, name, slug, branding_settings, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "שם ה-slug כבר קיים" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ organization: data });
}

type BodyPatch = { id: string; name?: string; slug?: string; branding_settings?: unknown };

export async function PATCH(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createServiceRoleSupabase();
  if (!(await isProfilePlatformSuper(admin, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: BodyPatch;
  try {
    body = (await request.json()) as BodyPatch;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const upd: Record<string, unknown> = {};
  if (body.name != null) upd.name = String(body.name).trim();
  if (body.slug != null) {
    const slug = String(body.slug).trim().toLowerCase();
    if (!SLUG_RE.test(slug) || slug.length < 2) {
      return NextResponse.json(
        { error: "Invalid slug" },
        { status: 400 }
      );
    }
    upd.slug = slug;
  }
  if (body.branding_settings != null && typeof body.branding_settings === "object") {
    upd.branding_settings = body.branding_settings;
  }
  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  const { data, error } = await admin
    .from("organizations")
    .update(upd)
    .eq("id", id)
    .select("id, name, slug, branding_settings, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ organization: data });
}
