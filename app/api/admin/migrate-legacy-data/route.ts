import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { parseClientCustomFieldsData } from "@/lib/customFieldsTemplate";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  customFieldSlugMapsToCoreFullName,
  isCrmCoreFieldKey,
  normalizeCoreSlotKey,
  type CrmCoreFieldKey,
} from "@/lib/crmClientCardLayout";
import { isProfileTeamAdmin } from "@/lib/teamAdmin";

export const dynamic = "force-dynamic";

type DefRow = { id: string; slug: string | null };

type Source =
  | { kind: "core"; key: CrmCoreFieldKey }
  | { kind: "column"; name: string };

function slugToValueSource(slug: string): Source | null {
  const nk = normalizeCoreSlotKey(slug);
  if (nk && isCrmCoreFieldKey(nk)) {
    return { kind: "core", key: nk };
  }
  const lower = slug.trim().toLowerCase().replace(/\s+/g, "_");
  if (lower === "email") {
    return { kind: "column", name: "email" };
  }
  return null;
}

function scalarFromRow(
  row: Record<string, unknown>,
  source: Source
): string {
  if (source.kind === "column") {
    const v = row[source.name];
    if (v === undefined || v === null) return "";
    return String(v).trim();
  }

  const key = source.key;
  if (key === "crm_status") {
    const v = row.status_id ?? row.crm_status;
    return v == null ? "" : String(v).trim();
  }

  const nk = key;
  const camel = nk.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
  const candidates = [nk, camel];
  for (const c of candidates) {
    const v = row[c];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
  }
  return "";
}

/**
 * One-time: merge שם מלא from legacy column + JSON + CFV into one value, write to
 * `clients.full_name`, `custom_fields_data`, and `custom_field_values` for every
 * definition whose slug maps to core `full_name`.
 */
async function consolidateClientFullName(admin: ReturnType<typeof createServiceRoleSupabase>) {
  const { data: defs, error: defErr } = await admin
    .from("custom_field_definitions")
    .select("id, slug");

  if (defErr) {
    return NextResponse.json(
      { success: false, error: defErr.message },
      { status: 500 }
    );
  }

  const nameDefs = ((defs ?? []) as DefRow[]).filter((d) => {
    const s = d.slug?.trim() ?? "";
    return s !== "" && customFieldSlugMapsToCoreFullName(s);
  });

  if (nameDefs.length === 0) {
    return NextResponse.json({
      success: true,
      consolidatedClients: 0,
      message:
        "אין שדה מותאם עם slug שממופה לשם מלא (למשל full_name או name). הוסיפו שדה כזה בהגדרות.",
    });
  }

  const nameDefIds = nameDefs.map((d) => d.id);

  const { data: clients, error: clientsErr } = await admin
    .from("clients")
    .select("id, full_name, custom_fields_data");

  if (clientsErr) {
    return NextResponse.json(
      { success: false, error: clientsErr.message },
      { status: 500 }
    );
  }

  const { data: cfvRows, error: cfvErr } = await admin
    .from("custom_field_values")
    .select("client_id, definition_id, value_text")
    .in("definition_id", nameDefIds);

  if (cfvErr) {
    return NextResponse.json(
      { success: false, error: cfvErr.message },
      { status: 500 }
    );
  }

  const cfvMap = new Map<string, Map<string, string>>();
  for (const r of cfvRows ?? []) {
    const row = r as {
      client_id: string;
      definition_id: string;
      value_text?: string | null;
    };
    const cid = String(row.client_id);
    const did = String(row.definition_id);
    if (!cfvMap.has(cid)) cfvMap.set(cid, new Map());
    cfvMap.get(cid)!.set(
      did,
      row.value_text == null ? "" : String(row.value_text).trim()
    );
  }

  let consolidatedClients = 0;
  let cfvUpserts = 0;
  const cfvChunk: {
    client_id: string;
    definition_id: string;
    value_text: string;
  }[] = [];

  for (const c of clients ?? []) {
    const row = c as {
      id: string;
      full_name?: string | null;
      custom_fields_data?: unknown;
    };
    const id = row.id;
    if (typeof id !== "string") continue;

    const columnName = String(row.full_name ?? "").trim();
    const parsed = parseClientCustomFieldsData(row.custom_fields_data);
    const byDef = cfvMap.get(id) ?? new Map<string, string>();

    let unified = "";
    for (const nd of nameDefs) {
      const slug = nd.slug!.trim();
      const jsonPart = String(parsed[slug] ?? "").trim();
      if (jsonPart) {
        unified = jsonPart;
        break;
      }
    }
    if (!unified) {
      for (const nd of nameDefs) {
        const cfvPart = String(byDef.get(nd.id) ?? "").trim();
        if (cfvPart) {
          unified = cfvPart;
          break;
        }
      }
    }
    if (!unified) {
      unified = columnName;
    }

    if (!unified) continue;

    const nextJson = { ...parsed };
    for (const nd of nameDefs) {
      nextJson[nd.slug!.trim()] = unified;
    }

    const { error: upErr } = await admin
      .from("clients")
      .update({
        full_name: unified,
        custom_fields_data: nextJson,
      })
      .eq("id", id);

    if (upErr) {
      return NextResponse.json(
        { success: false, error: upErr.message, consolidatedClients },
        { status: 500 }
      );
    }
    consolidatedClients += 1;

    for (const nd of nameDefs) {
      cfvChunk.push({
        client_id: id,
        definition_id: nd.id,
        value_text: unified,
      });
    }
  }

  const chunkSize = 200;
  for (let i = 0; i < cfvChunk.length; i += chunkSize) {
    const chunk = cfvChunk.slice(i, i + chunkSize);
    const { error: upErr } = await admin.from("custom_field_values").upsert(chunk, {
      onConflict: "client_id,definition_id",
    });
    if (upErr) {
      return NextResponse.json(
        {
          success: false,
          error: upErr.message,
          consolidatedClients,
        },
        { status: 500 }
      );
    }
    cfvUpserts += chunk.length;
  }

  return NextResponse.json({
    success: true,
    consolidatedClients,
    cfvUpserts,
    nameFieldSlugs: nameDefs.map((d) => d.slug),
  });
}

export async function GET(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleSupabase();
  const teamAdmin = await isProfileTeamAdmin(admin, user.id);
  if (!teamAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const consolidateName =
    new URL(request.url).searchParams.get("consolidateName") === "1";
  if (consolidateName) {
    return consolidateClientFullName(admin);
  }

  const { data: defs, error: defErr } = await admin
    .from("custom_field_definitions")
    .select("id, slug");

  if (defErr) {
    return NextResponse.json(
      { success: false, error: defErr.message },
      { status: 500 }
    );
  }

  const mappings: { definitionId: string; source: Source }[] = [];
  for (const d of (defs ?? []) as DefRow[]) {
    const slug = d.slug?.trim() ?? "";
    if (!slug) continue;
    const source = slugToValueSource(slug);
    if (source) {
      mappings.push({ definitionId: d.id, source });
    }
  }

  if (mappings.length === 0) {
    return NextResponse.json({
      success: true,
      migratedCount: 0,
      message: "No custom_field_definitions matched core/email slugs.",
    });
  }

  const { data: clients, error: clientsErr } = await admin
    .from("clients")
    .select("*");

  if (clientsErr) {
    return NextResponse.json(
      { success: false, error: clientsErr.message },
      { status: 500 }
    );
  }

  const rows: {
    client_id: string;
    definition_id: string;
    value_text: string;
  }[] = [];

  for (const client of clients ?? []) {
    const row = client as Record<string, unknown>;
    const id = row.id;
    if (typeof id !== "string") continue;

    for (const { definitionId, source } of mappings) {
      const raw = scalarFromRow(row, source).trim();
      if (!raw) continue;
      rows.push({
        client_id: id,
        definition_id: definitionId,
        value_text: raw,
      });
    }
  }

  let migratedCount = 0;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error: upErr } = await admin
      .from("custom_field_values")
      .upsert(chunk, {
        onConflict: "client_id,definition_id",
      });
    if (upErr) {
      return NextResponse.json(
        { success: false, error: upErr.message, migratedCount },
        { status: 500 }
      );
    }
    migratedCount += chunk.length;
  }

  return NextResponse.json({ success: true, migratedCount });
}
