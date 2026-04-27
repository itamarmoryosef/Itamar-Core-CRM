"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAdminSession } from "@/lib/adminSessionContext";
import { checkFeature } from "@/lib/checkFeature";
import { ORG_FEATURE } from "@/lib/orgFeatureCodes";

const fmtIls = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

type StatsResponse = {
  organizationId: string;
  from: string;
  to: string;
  pieSlug: string | null;
  scorecards: {
    totalRevenueInRange: number;
    revenueThisCalendarMonth: number;
    newClientsInRange: number;
    newClientsLast30Days: number;
    totalActiveClients: number;
  };
  monthlyRevenue: { month: string; label: string; amount: number }[];
  clientsByStatus: {
    statusId: string | null;
    label: string;
    count: number;
    color: string | null;
  }[];
  pieByCustomField: {
    slug: string;
    label: string;
    segments: { name: string; value: number }[];
  } | null;
  selectFieldsForPie: { slug: string; label: string }[];
  error?: string;
};

const PIE_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

export default function AdminDashboardPage() {
  const session = useAdminSession();
  const me = session?.me;
  const activeOrg = session?.activeOrganization;
  const enabled = session?.enabledFeatureCodes ?? null;

  const today = useMemo(() => new Date(), []);
  const [to, setTo] = useState(() => ymd(today));
  const [from, setFrom] = useState(() => ymd(addDays(today, -180)));
  const [pieSlug, setPieSlug] = useState<string | null>(null);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const canAccess = useMemo(() => {
    if (enabled == null) {
      return true;
    }
    return (
      checkFeature(enabled, ORG_FEATURE.revenue) ||
      checkFeature(enabled, ORG_FEATURE.dashboard)
    );
  }, [enabled]);

  const load = useCallback(async () => {
    if (!activeOrg?.id) {
      setData(null);
      setLoading(false);
      return;
    }
    if (!canAccess) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    if (pieSlug) {
      params.set("pieSlug", pieSlug);
    }
    if (me?.platformSuper && activeOrg.id) {
      params.set("organizationId", activeOrg.id);
    }
    const res = await fetch(`/api/admin/stats?${params.toString()}`, {
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as StatsResponse & {
      error?: string;
    };
    if (!res.ok) {
      setData(null);
      setErr(
        j.error ||
          (res.status === 403
            ? "אין גישה — יש להפעיל פיצ'ר «דשבורד» או «הכנסות» לארגון."
            : res.status === 401
              ? "נא להתחבר מחדש."
              : res.status === 503
                ? "תשתית פיצ'רים לא מותקנת."
                : "שגיאה בטעינת נתונים")
      );
      setLoading(false);
      return;
    }
    setData(j);
    setLoading(false);
  }, [activeOrg?.id, from, to, pieSlug, me?.platformSuper, canAccess]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyDefaultRange = useCallback(() => {
    const t = new Date();
    setTo(ymd(t));
    setFrom(ymd(addDays(t, -180)));
  }, []);

  if (!me) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <span className="ms-2">טוען…</span>
      </div>
    );
  }

  if (enabled && !canAccess) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
        role="status"
      >
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">הדשבורד אינו זמין</p>
          <p className="mt-1 text-sm text-amber-800/90">
            יש להפעיל עבור הארגון את פיצ'ר «דשבורד» או «הכנסות» בהגדרות Super.
          </p>
        </div>
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800"
        role="status"
      >
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
        <p>אין ארגון פעיל. בחר ארגון או התחבר מחדש.</p>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"
        role="alert"
      >
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
        <p>{err}</p>
      </div>
    );
  }

  const sc = data?.scorecards;
  const monthData =
    data?.monthlyRevenue.map((m) => ({
      label: m.label,
      amount: m.amount,
    })) ?? [];
  const statusData = data?.clientsByStatus ?? [];
  const pieSegments = data?.pieByCustomField?.segments ?? [];
  const pieLabel = data?.pieByCustomField?.label;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="text-start">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          ניתוח ותצוגה
        </p>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          דשבורד
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          סיכומי תקבולים, לקוחות ופילוח לפי שדה רשימה —{" "}
          <span className="font-medium text-slate-800">
            {activeOrg.brand_name?.trim() || activeOrg.name}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 sm:px-4 sm:py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <span className="text-[10px] font-semibold text-slate-500">
            מסננים
          </span>
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <label className="flex min-w-0 flex-col gap-0.5 text-sm">
              <span className="text-xs text-slate-600">מ־</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5 text-sm">
              <span className="text-xs text-slate-600">עד</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            {data && data.selectFieldsForPie.length > 0 ? (
              <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5 text-sm sm:min-w-[12rem]">
                <span className="text-xs text-slate-600">
                  פילוח עוגה (רשימה)
                </span>
                <select
                  value={
                    pieSlug ??
                    data.pieSlug ??
                    data.selectFieldsForPie[0]?.slug ??
                    ""
                  }
                  onChange={(e) => setPieSlug(e.target.value || null)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900"
                >
                  {data.selectFieldsForPie.map((f) => (
                    <option key={f.slug} value={f.slug}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-stretch justify-end gap-2">
          <button
            type="button"
            onClick={applyDefaultRange}
            className="inline-flex min-h-10 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 sm:min-w-[8.5rem] sm:flex-initial"
          >
            180 יום
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 min-w-[6.5rem] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 sm:min-w-[8.5rem] sm:flex-initial"
          >
            {loading ? (
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin"
                aria-hidden
              />
            ) : (
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            )}
            רענן
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : null}

      {sc ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-indigo-50/80 to-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              סה״כ תקבולים בטווח
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {fmtIls.format(sc.totalRevenueInRange || 0)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-emerald-50/80 to-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">תקבולי החודש (קלנדר)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {fmtIls.format(sc.revenueThisCalendarMonth || 0)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-sky-50/80 to-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">לקוחות חדשים בטווח</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {sc.newClientsInRange}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              לקוחות חדשים (30 יום אחרונים)
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {sc.newClientsLast30Days}
            </p>
          </div>
        </div>
      ) : null}

      {err && data ? (
        <p className="text-sm text-amber-700" role="status">
          {err}
        </p>
      ) : null}

      <div
        className="space-y-5 rounded-2xl border border-slate-200/50 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800/60 dark:bg-slate-950/30"
        aria-label="לוח הדוחות"
      >
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="min-h-[280px] min-w-0 rounded-xl border border-slate-100 bg-slate-50/30 p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            הכנסות לפי חודש (בטווח)
          </h2>
          <div className="h-[240px] w-full min-w-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={monthData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) =>
                    v == null
                      ? ["", ""]
                      : [fmtIls.format(Number(v)), "תקבולים"]
                  }
                />
                <Bar dataKey="amount" name="תקבולים" fill="var(--primary-brand, #6366f1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-h-[280px] min-w-0 rounded-xl border border-slate-100 bg-slate-50/30 p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            {pieLabel
              ? `לקוחות לפי «${pieLabel}»`
              : "פילוח לפי שדה רשימה"}
          </h2>
          {pieSegments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              אין נתונים — הגדרו שדה מסוג רשימה או הזינו ערכים בכרטיסי לקוחות.
            </p>
          ) : (
            <div className="h-[240px] w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={pieSegments}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieSegments.map((_, i) => (
                      <Cell
                        key={String(i)}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="min-h-[260px] min-w-0 rounded-xl border border-slate-100 bg-slate-50/30 p-3">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          התפלגות לקוחות לפי סטטוס
        </h2>
        <div className="h-[220px] w-full min-w-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              layout="vertical"
              data={statusData}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(n) =>
                  n == null ? ["", ""] : [Number(n), "לקוחות"]
                }
              />
              <Bar dataKey="count" name="לקוחות" radius={[0, 4, 4, 0]}>
                {statusData.map((s, i) => (
                  <Cell
                    key={s.statusId ?? `n-${i}`}
                    fill={s.color && /^#/.test(s.color) ? s.color : PIE_COLORS[i % PIE_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-center text-xs text-slate-500">
          לקוחות פעילים: {sc?.totalActiveClients ?? 0}
        </p>
      </div>
      </div>
    </div>
  );
}
