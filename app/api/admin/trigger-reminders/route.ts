import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";

export const dynamic = "force-dynamic";

/** Allow long runs on Vercel when many reminders queue up. */
export const maxDuration = 120;

function internalCronOrigin(request: Request): string {
  const explicit = [
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
  ].find(Boolean);
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }
  return new URL(request.url).origin;
}

/**
 * Run the same job as GET /api/cron/reminders (admin only).
 * Use when Vercel Hobby cron is too infrequent or CRON auth was misconfigured.
 */
export async function POST(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = internalCronOrigin(request);
  /** Bypass Shabbat / night window (same auth as cron). */
  const cronUrl = `${origin}/api/cron/reminders?force=true`;
  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  let res: Response;
  try {
    res = await fetch(cronUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    console.error("[admin/trigger-reminders] fetch cron failed", msg);
    return NextResponse.json(
      { error: `לא ניתן להפעיל את הקרון: ${msg}` },
      { status: 502 }
    );
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  return NextResponse.json(body, { status: res.status });
}
