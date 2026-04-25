import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isProfileTeamAdmin } from "@/lib/teamAdmin";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LEN = 8;

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
  commission_percentage?: number | string | null;
};

async function requireTeamAdmin() {
  const sessionUser = await getRouteSessionUser();
  if (!sessionUser) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let adminClient;
  try {
    adminClient = createServiceRoleSupabase();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service role not configured";
    return {
      ok: false as const,
      response: NextResponse.json({ error: msg }, { status: 500 }),
    };
  }

  const allowed = await isProfileTeamAdmin(adminClient, sessionUser.id);
  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "אין הרשאה — נדרשת תפקיד admin בפרופיל" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, sessionUser, adminClient };
}

export async function GET() {
  const gate = await requireTeamAdmin();
  if (!gate.ok) return gate.response;

  const { adminClient } = gate;

  const { data, error } = await adminClient
    .from("profiles")
    .select("id, email, full_name, role, created_at, commission_percentage")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint:
          error.message.includes("profiles") || error.code === "42P01"
            ? "הריצו את profiles_team.sql ב-Supabase"
            : undefined,
      },
      { status: 500 }
    );
  }

  const members = (data ?? []) as ProfileRow[];
  return NextResponse.json({
    members: members.map((m) => {
      const cp = Number(m.commission_percentage);
      return {
        id: m.id,
        email: m.email ?? "",
        full_name: m.full_name?.trim() || null,
        role: m.role,
        created_at: m.created_at,
        commission_percentage: Number.isFinite(cp) ? cp : 0,
      };
    }),
  });
}

type PatchMemberBody = {
  id?: string;
  full_name?: string | null;
  email?: string;
  role?: string;
  new_password?: string;
  commission_percentage?: number | string | null;
};

export async function PATCH(request: Request) {
  const gate = await requireTeamAdmin();
  if (!gate.ok) return gate.response;

  const { adminClient } = gate;

  let body: PatchMemberBody;
  try {
    body = (await request.json()) as PatchMemberBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "חסר מזהה משתמש" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await adminClient
    .from("profiles")
    .select("id, email, full_name, role, commission_percentage")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
  }

  const existingRow = existing as {
    id: string;
    email: string | null;
    full_name: string | null;
    role: string;
    commission_percentage?: number | string | null;
  };

  const fullNameRaw =
    typeof body.full_name === "string"
      ? body.full_name.trim()
      : body.full_name === null
        ? ""
        : undefined;
  if (fullNameRaw === undefined) {
    return NextResponse.json({ error: "חסר שם מלא" }, { status: 400 });
  }
  const full_name = fullNameRaw === "" ? null : fullNameRaw;

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "כתובת אימייל לא תקינה" }, { status: 400 });
  }

  if (body.role !== "admin" && body.role !== "staff") {
    return NextResponse.json({ error: "תפקיד לא חוקי" }, { status: 400 });
  }
  const role = body.role;

  const newPassword =
    typeof body.new_password === "string" ? body.new_password : "";
  const setPassword = newPassword.length > 0;
  if (setPassword && newPassword.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `סיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LEN} תווים` },
      { status: 400 }
    );
  }

  let commission_percentage = 0;
  if (body.commission_percentage !== undefined && body.commission_percentage !== null) {
    const raw =
      typeof body.commission_percentage === "number"
        ? body.commission_percentage
        : String(body.commission_percentage).trim().replace(",", ".");
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json(
        { error: "אחוז עמלה חייב להיות מספר בין 0 ל־100" },
        { status: 400 }
      );
    }
    commission_percentage = n;
  } else {
    const existingCp = Number(existingRow.commission_percentage);
    commission_percentage = Number.isFinite(existingCp) ? existingCp : 0;
  }

  if (existingRow.role === "admin" && role === "staff") {
    const { data: admins, error: adminErr } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "admin");
    if (!adminErr && admins && admins.length <= 1) {
      return NextResponse.json(
        { error: "לא ניתן להסיר את מנהל המערכת האחרון" },
        { status: 400 }
      );
    }
  }

  const prevEmail = (existingRow.email ?? "").trim();
  const emailChanged = email !== prevEmail;

  if (emailChanged || setPassword) {
    const authUpdate: {
      email?: string;
      password?: string;
      email_confirm?: boolean;
    } = {};
    if (emailChanged) {
      authUpdate.email = email;
      authUpdate.email_confirm = true;
    }
    if (setPassword) {
      authUpdate.password = newPassword;
    }
    const { error: authErr } = await adminClient.auth.admin.updateUserById(
      id,
      authUpdate
    );
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }
  }

  const { error: upErr } = await adminClient
    .from("profiles")
    .update({
      full_name,
      email,
      role,
      commission_percentage,
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json(
      {
        error: upErr.message,
        hint: upErr.message.includes("full_name")
          ? "הריצו profiles_team.sql או הוסיפו עמודה full_name ל־profiles"
          : undefined,
      },
      { status: 500 }
    );
  }

  const { data: refreshed, error: refErr } = await adminClient
    .from("profiles")
    .select("id, email, full_name, role, created_at, commission_percentage")
    .eq("id", id)
    .single();

  if (refErr || !refreshed) {
    return NextResponse.json({ ok: true });
  }

  const row = refreshed as ProfileRow;
  const cpOut = Number(row.commission_percentage);
  return NextResponse.json({
    ok: true,
    member: {
      id: row.id,
      email: row.email ?? "",
      full_name: row.full_name?.trim() || null,
      role: row.role,
      created_at: row.created_at,
      commission_percentage: Number.isFinite(cpOut) ? cpOut : 0,
    },
  });
}

export async function POST(request: Request) {
  const gate = await requireTeamAdmin();
  if (!gate.ok) return gate.response;

  const { adminClient } = gate;

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "כתובת אימייל לא תקינה" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `סיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LEN} תווים` },
      { status: 400 }
    );
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userId = data.user.id;
  const userEmail = data.user.email ?? email;

  const { error: profileErr } = await adminClient.from("profiles").upsert(
    {
      id: userId,
      email: userEmail,
      role: "staff",
    },
    { onConflict: "id" }
  );

  if (profileErr) {
    await adminClient.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: `יצירת פרופיל נכשלה: ${profileErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    member: {
      id: userId,
      email: userEmail,
      role: "staff",
      created_at: data.user.created_at,
    },
  });
}

export async function DELETE(request: Request) {
  const gate = await requireTeamAdmin();
  if (!gate.ok) return gate.response;

  const { sessionUser, adminClient } = gate;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (id === sessionUser.id) {
    return NextResponse.json(
      { error: "לא ניתן למחוק את המשתמש המחובר" },
      { status: 400 }
    );
  }

  const { data: target } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();

  if (target?.role === "admin") {
    const { data: adminRows, error: adminErr } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    if (!adminErr && adminRows && adminRows.length <= 1) {
      return NextResponse.json(
        { error: "לא ניתן למחוק את מנהל המערכת האחרון" },
        { status: 400 }
      );
    }
  }

  const { error } = await adminClient.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
