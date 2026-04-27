import { NextRequest, NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  getOrgEnabledFeatureCodes,
  orgHasAnyFeature,
} from "@/lib/getOrgEnabledFeatureCodes";
import { isProfilePlatformSuper } from "@/lib/teamAdmin";
import { ORG_FEATURE } from "@/lib/orgFeatureCodes";
import { normalizeCrmFieldType } from "@/lib/crmFieldLayout";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const DASH_ACCESS = [ORG_FEATURE.revenue, ORG_FEATURE.dashboard] as const;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function monthKey(paidOn: string): string {
  return String(paidOn).slice(0, 7);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) {
    return ym;
  }
  const mo = Number(m);
  const he = [
    "ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳",
  ];
  return `${he[mo - 1] ?? m} ${y}`;
}

type Json = Record<string, unknown>;

function parseClientCustomData(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const o = raw as Json;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null) {
      out[k] = "";
    } else if (typeof v === "string" || typeof v === "number") {
      out[k] = String(v);
    } else {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

const PAY_IN_CHUNK = 200;

type PaymentRowRange = { amount: number | string; paid_on: string };

async function fetchPaymentsInDateRange(
  admin: SupabaseClient,
  clientIds: string[],
  from: string,
  to: string
): Promise<{
  rows: PaymentRowRange[];
  firstError: { message: string } | null;
}> {
  const rows: PaymentRowRange[] = [];
  for (let i = 0; i < clientIds.length; i += PAY_IN_CHUNK) {
    const part = clientIds.slice(i, i + PAY_IN_CHUNK);
    const { data, error } = await admin
      .from("payments")
      .select("amount, paid_on")
      .in("client_id", part)
      .gte("paid_on", from)
      .lte("paid_on", to);
    if (error) {
      return { rows: [], firstError: { message: error.message } };
    }
    for (const p of (data ?? []) as PaymentRowRange[]) {
      rows.push(p);
    }
  }
  return { rows, firstError: null };
}

async function fetchAmountsInCalendarMonth(
  admin: SupabaseClient,
  clientIds: string[],
  first: string,
  last: string
): Promise<{
  amounts: { amount: number | string }[];
  firstError: { message: string } | null;
}> {
  const amounts: { amount: number | string }[] = [];
  for (let i = 0; i < clientIds.length; i += PAY_IN_CHUNK) {
    const part = clientIds.slice(i, i + PAY_IN_CHUNK);
    const { data, error } = await admin
      .from("payments")
      .select("amount")
      .in("client_id", part)
      .gte("paid_on", first)
      .lte("paid_on", last);
    if (error) {
      return { amounts: [], firstError: { message: error.message } };
    }
    for (const p of (data ?? []) as { amount: number | string }[]) {
      amounts.push(p);
    }
  }
  return { amounts, firstError: null };
}

/**
 * GET /api/admin/stats?from=2025-01-01&to=2025-12-31&organizationId=&pieSlug=
 * דורש: פיצ'ר `revenue` או `dashboard` לארגון הפעיל.
 */
export async function GET(req: NextRequest) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin: SupabaseClient;
  try {
    admin = createServiceRoleSupabase();
  } catch {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }

  const superU = await isProfilePlatformSuper(admin, user.id);
  const { data: prof, error: pe } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (pe) {
    const m = pe.message?.toLowerCase() ?? "";
    if (!/organization_id|column|schema/.test(m)) {
      return NextResponse.json({ error: pe.message }, { status: 500 });
    }
  }

  const profOrg = (prof as { organization_id?: string | null } | null)
    ?.organization_id?.trim() ?? null;
  const q = req.nextUrl.searchParams.get("organizationId")?.trim() ?? null;
  let orgId: string | null = null;
  if (superU) {
    orgId = q || profOrg;
  } else {
    orgId = profOrg;
    if (q && q !== profOrg) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!orgId) {
    return NextResponse.json(
      { error: "No organization" },
      { status: 400 }
    );
  }

  let enabled: string[] | null;
  try {
    enabled = await getOrgEnabledFeatureCodes(admin, orgId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  /** `null` = אין system_features/organization_feature_map — כמו `useFeatures`: treat as הכל מותר */
  if (enabled !== null && !orgHasAnyFeature(enabled, DASH_ACCESS)) {
    return NextResponse.json(
      { error: "forbidden: dashboard or revenue feature required" },
      { status: 403 }
    );
  }

  const today = new Date();
  const toParam = req.nextUrl.searchParams.get("to")?.trim() ?? ymd(today);
  const defaultFrom = ymd(addDays(today, -180));
  const fromParam = req.nextUrl.searchParams.get("from")?.trim() ?? defaultFrom;
  if (fromParam > toParam) {
    return NextResponse.json(
      { error: "from must be <= to" },
      { status: 400 }
    );
  }

  const pieSlugQ = req.nextUrl.searchParams.get("pieSlug")?.trim() ?? null;

  const { data: clientRows, error: cErr } = await admin
    .from("clients")
    .select("id, custom_fields_data, created_at, status_id")
    .eq("organization_id", orgId);
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  const clients = (clientRows ?? []) as {
    id: string;
    custom_fields_data: unknown;
    created_at: string;
    status_id: string | null;
  }[];

  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) {
    const { data: defsEmpty } = await admin
      .from("custom_field_definitions")
      .select("id, label, slug, field_type, sort_order")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true });
    const selectFields =
      (defsEmpty ?? [])
        .filter(
          (d) =>
            normalizeCrmFieldType(
              (d as { field_type: string }).field_type
            ) === "select"
        )
        .map((d) => {
          const r = d as { id: string; label: string; slug: string };
          return { slug: r.slug, label: r.label };
        }) ?? [];

    return NextResponse.json({
      organizationId: orgId,
      from: fromParam,
      to: toParam,
      scorecards: {
        totalRevenueInRange: 0,
        revenueThisCalendarMonth: 0,
        newClientsInRange: 0,
        newClientsLast30Days: 0,
        totalActiveClients: 0,
      },
      monthlyRevenue: [] as { month: string; label: string; amount: number }[],
      clientsByStatus: [] as {
        statusId: string | null;
        label: string;
        count: number;
        color: string | null;
      }[],
      pieByCustomField: null as
        | { slug: string; label: string; segments: { name: string; value: number }[] }
        | null,
      selectFieldsForPie: selectFields,
    });
  }

  const { rows: payRows, firstError: pErr } =
    await fetchPaymentsInDateRange(
      admin,
      clientIds,
      fromParam,
      toParam
    );

  if (pErr) {
    if (/paid_on|does not exist|42P01/i.test(pErr.message)) {
      return NextResponse.json(
        {
          error: `${pErr.message} — הריצו add_payments_table.sql`,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  const payments = payRows;

  const { data: stRows } = await admin
    .from("client_statuses")
    .select("id, label, color_hex, sort_order")
    .order("sort_order", { ascending: true });

  const statusMeta = new Map(
    (stRows ?? []).map(
      (r) =>
        [
          String((r as { id: string }).id),
          {
            label: String((r as { id: string; label: string }).label),
            color: (r as { color_hex: string | null }).color_hex ?? null,
          },
        ] as const
    )
  );

  const now = new Date();
  const d30 = addDays(now, -30);
  const d30s = d30.toISOString();

  let newClientsLast30Days = 0;
  for (const c of clients) {
    if (c.created_at && c.created_at >= d30s) {
      newClientsLast30Days += 1;
    }
  }

  let newClientsInRange = 0;
  const fromIso = `${fromParam}T00:00:00.000Z`;
  const toIso = `${toParam}T23:59:59.999Z`;
  for (const c of clients) {
    if (c.created_at) {
      const t = c.created_at;
      if (t >= fromIso && t <= toIso) {
        newClientsInRange += 1;
      }
    }
  }

  const byStatus = new Map<string | "null", number>();
  for (const c of clients) {
    const k = c.status_id ?? "null";
    byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
  }
  const clientsByStatus: {
    statusId: string | null;
    label: string;
    count: number;
    color: string | null;
  }[] = [];
  for (const [k, count] of byStatus) {
    const id = k === "null" ? null : k;
    const m = id ? statusMeta.get(id) : null;
    clientsByStatus.push({
      statusId: id,
      label: m?.label ?? (id == null ? "ללא סטטוס" : "סטטוס"),
      count,
      color: m?.color ?? null,
    });
  }
  clientsByStatus.sort((a, b) => b.count - a.count);

  const monthTotals = new Map<string, number>();
  let totalInRange = 0;
  for (const p of payments) {
    const a = Number(p.amount);
    if (!Number.isFinite(a) || a <= 0) continue;
    const mk = monthKey(p.paid_on);
    monthTotals.set(mk, (monthTotals.get(mk) ?? 0) + a);
    totalInRange += a;
  }

  const yC = now.getUTCFullYear();
  const m0 = now.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(yC, m0, 1));
  const lastOfMonth = new Date(Date.UTC(yC, m0 + 1, 0));
  const { amounts: payThisMonth, firstError: pmErr } =
    await fetchAmountsInCalendarMonth(
      admin,
      clientIds,
      ymd(firstOfMonth),
      ymd(lastOfMonth)
    );
  if (pmErr) {
    return NextResponse.json({ error: pmErr.message }, { status: 500 });
  }
  let revenueThisCalendarMonth = 0;
  for (const p of payThisMonth) {
    const a = Number((p as { amount: number | string }).amount);
    if (Number.isFinite(a) && a > 0) {
      revenueThisCalendarMonth += a;
    }
  }

  const monthKeys: string[] = [];
  {
    const start = new Date(fromParam + "T00:00:00.000Z");
    const end = new Date(toParam + "T00:00:00.000Z");
    const cur = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
    );
    const endM = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
    );
    for (; cur <= endM; cur.setUTCMonth(cur.getUTCMonth() + 1)) {
      const ym = `${cur.getUTCFullYear()}-${String(
        cur.getUTCMonth() + 1
      ).padStart(2, "0")}`;
      monthKeys.push(ym);
    }
  }
  const monthlyRevenue = monthKeys.map((month) => ({
    month,
    label: monthLabel(month),
    amount: Math.round((monthTotals.get(month) ?? 0) * 100) / 100,
  }));

  const { data: defRows, error: derr } = await admin
    .from("custom_field_definitions")
    .select("id, label, slug, field_type, sort_order")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true });

  if (derr) {
    return NextResponse.json({ error: derr.message }, { status: 500 });
  }

  const selectDefs = (defRows ?? []).filter(
    (d) =>
      normalizeCrmFieldType((d as { field_type: string }).field_type) ===
      "select"
  ) as { id: string; label: string; slug: string }[];

  const selectFieldsForPie = selectDefs.map((d) => ({
    slug: d.slug,
    label: d.label,
  }));

  let targetSlug: string | null = pieSlugQ;
  if (!targetSlug && selectDefs.length > 0) {
    targetSlug = selectDefs[0]!.slug;
  }

  let pieByCustomField: {
    slug: string;
    label: string;
    segments: { name: string; value: number }[];
  } | null = null;
  if (targetSlug) {
    const def = selectDefs.find((d) => d.slug === targetSlug);
    if (def) {
      const counts = new Map<string, number>();
      for (const c of clients) {
        const parsed = parseClientCustomData(c.custom_fields_data);
        const v = (parsed[def.slug] ?? "").trim();
        const key = v || "(ריק)";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const segments = Array.from(counts.entries()).map(([name, value]) => ({
        name,
        value,
      }));
      segments.sort((a, b) => b.value - a.value);
      pieByCustomField = { slug: def.slug, label: def.label, segments };
    }
  }

  return NextResponse.json({
    organizationId: orgId,
    from: fromParam,
    to: toParam,
    pieSlug: targetSlug,
    scorecards: {
      totalRevenueInRange: Math.round(totalInRange * 100) / 100,
      revenueThisCalendarMonth:
        Math.round(revenueThisCalendarMonth * 100) / 100,
      newClientsInRange,
      newClientsLast30Days,
      totalActiveClients: clients.length,
    },
    monthlyRevenue,
    clientsByStatus,
    pieByCustomField,
    selectFieldsForPie,
  });
}
