import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";

type ScheduledReminderRow = {
  id: string;
  client_id: string;
  scheduled_at: string;
  message: string;
  status: string;
  created_at: string;
  sent_at: string | null;
};

function adminDb() {
  return createServiceRoleSupabase();
}

export async function GET(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId")?.trim() ?? "";
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  let db;
  try {
    db = adminDb();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service role not configured";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data, error } = await db
    .from("client_scheduled_reminders")
    .select("id, client_id, scheduled_at, message, status, created_at, sent_at")
    .eq("client_id", clientId)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true });

  if (error) {
    if (
      error.message.includes("client_scheduled_reminders") ||
      error.code === "42P01"
    ) {
      return NextResponse.json(
        {
          error: error.message,
          hint: "הריצו ב-Supabase את add_client_reminders_hybrid.sql",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ScheduledReminderRow[];

  return NextResponse.json({ reminders: rows });
}

export async function POST(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  let db;
  try {
    db = adminDb();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service role not configured";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const kind = typeof b.kind === "string" ? b.kind.trim() : "";

  if (kind === "settings") {
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
    const reminderMode =
      b.reminderMode === "manual" ? "manual" : b.reminderMode === "auto"
        ? "auto"
        : null;
    const nextRaw = b.nextCustomReminder;
    const nextCustomReminder =
      typeof nextRaw === "string" && nextRaw.trim()
        ? nextRaw.trim()
        : nextRaw === null
          ? null
          : undefined;

    const remindersEnabledRaw = b.remindersEnabled;
    const remindersEnabled =
      typeof remindersEnabledRaw === "boolean" ? remindersEnabledRaw : undefined;

    if (!clientId || !reminderMode) {
      return NextResponse.json(
        { error: "Missing clientId or reminderMode" },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = { reminder_mode: reminderMode };
    if (reminderMode === "manual") {
      payload.next_custom_reminder =
        nextCustomReminder === undefined || nextCustomReminder === null
          ? null
          : nextCustomReminder;
    } else {
      payload.next_custom_reminder = null;
    }
    if (remindersEnabled !== undefined) {
      payload.reminders_enabled = remindersEnabled;
    }

    const { error: upErr } = await db
      .from("clients")
      .update(payload)
      .eq("id", clientId);

    if (upErr) {
      if (
        upErr.message.includes("reminder_mode") ||
        upErr.message.includes("next_custom_reminder") ||
        upErr.message.includes("reminders_enabled")
      ) {
        return NextResponse.json(
          {
            error: upErr.message,
            hint: upErr.message.includes("reminders_enabled")
              ? "הריצו ב-Supabase את add_client_reminders_enabled.sql"
              : "הריצו ב-Supabase את add_client_reminders_hybrid.sql",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (kind === "schedule") {
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
    const scheduledAt =
      typeof b.scheduledAt === "string" ? b.scheduledAt.trim() : "";
    const message = typeof b.message === "string" ? b.message.trim() : "";

    if (!clientId || !scheduledAt || !message) {
      return NextResponse.json(
        { error: "Missing clientId, scheduledAt, or message" },
        { status: 400 }
      );
    }

    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json(
        { error: "Invalid scheduledAt" },
        { status: 400 }
      );
    }

    const { data: ins, error: insErr } = await db
      .from("client_scheduled_reminders")
      .insert({
        client_id: clientId,
        scheduled_at: when.toISOString(),
        message,
        status: "pending",
      })
      .select("id")
      .single();

    if (insErr) {
      if (
        insErr.message.includes("client_scheduled_reminders") ||
        insErr.code === "42P01"
      ) {
        return NextResponse.json(
          {
            error: insErr.message,
            hint: "הריצו ב-Supabase את add_client_reminders_hybrid.sql",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: ins?.id });
  }

  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let db;
  try {
    db = adminDb();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service role not configured";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: row, error: fetchErr } = await db
    .from("client_scheduled_reminders")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((row as { status?: string }).status !== "pending") {
    return NextResponse.json(
      { error: "Only pending reminders can be cancelled" },
      { status: 400 }
    );
  }

  const { error: upErr } = await db
    .from("client_scheduled_reminders")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
