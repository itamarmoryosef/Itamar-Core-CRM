"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { LEAD_SOURCE_OPTIONS } from "@/lib/leadSource";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveDataTable,
  type ResponsiveColumnDef,
} from "@/components/ui/ResponsiveDataTable";

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מארס",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

type MonthlyChartDatum = {
  key: string;
  label: string;
  total: number;
};

function monthKeyFromPaidOn(paidOn: string): string | null {
  const s = paidOn?.trim().slice(0, 7);
  if (!s || s.length < 7) return null;
  return s;
}

/** Every calendar month in [rangeStart, rangeEnd], chronologically, with revenue totals. */
function buildMonthlyRevenueChartData(
  payments: PaymentWithClient[],
  rangeStartIso: string,
  rangeEndIso: string
): MonthlyChartDatum[] {
  const rangeStart = rangeStartIso <= rangeEndIso ? rangeStartIso : rangeEndIso;
  const rangeEnd = rangeStartIso <= rangeEndIso ? rangeEndIso : rangeStartIso;

  const byMonth = new Map<string, number>();
  for (const p of payments) {
    const k = monthKeyFromPaidOn(p.paid_on);
    if (!k) continue;
    byMonth.set(k, (byMonth.get(k) ?? 0) + Number(p.amount));
  }

  const start = new Date(`${rangeStart}T12:00:00`);
  const end = new Date(`${rangeEnd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const out: MonthlyChartDatum[] = [];
  const cur = new Date(startMonth);
  while (cur <= endMonth) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = `${HEBREW_MONTHS[m]} ${y}`;
    out.push({
      key,
      label,
      total: byMonth.get(key) ?? 0,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

type LeadProviderRow = {
  id: string;
  name: string;
  phone: string | null;
  commission_percent: number | string;
};

type CloserProfileEmbed = {
  full_name: string | null;
  commission_percentage: number | string | null;
} | null;

type ClientEmbed = {
  full_name: string;
  lead_source?: string | null;
  lead_provider_name?: string | null;
  closed_by?: string | null;
  closer?: CloserProfileEmbed;
};

type PaymentWithClient = {
  id: string;
  amount: number | string;
  paid_on: string;
  method: string;
  description: string | null;
  client_id: string;
  /** Supabase may return object (many-to-one) or single-element array */
  clients: ClientEmbed | ClientEmbed[] | null;
};

/** Per-agent rollup for revenue breakdown table */
type AgentBreakdownRow = {
  key: string;
  name: string;
  sales: number;
  commission: number;
};

function paymentClientEmbed(r: PaymentWithClient): ClientEmbed | null {
  const c = r.clients;
  if (!c) return null;
  if (Array.isArray(c)) {
    return c[0] ?? null;
  }
  return c;
}

function paymentClientFullName(r: PaymentWithClient): string {
  return paymentClientEmbed(r)?.full_name?.trim() ?? "";
}

function paymentClientLeadSource(r: PaymentWithClient): string {
  return paymentClientEmbed(r)?.lead_source?.trim() ?? "";
}

function paymentClientLeadProvider(r: PaymentWithClient): string {
  return paymentClientEmbed(r)?.lead_provider_name?.trim() ?? "";
}

function paymentCloserDisplayName(r: PaymentWithClient): string {
  const c = paymentClientEmbed(r);
  if (!c?.closed_by?.trim()) return "לא שויך";
  return c.closer?.full_name?.trim() || "—";
}

function paymentAgentCommissionNis(r: PaymentWithClient): number {
  const c = paymentClientEmbed(r);
  if (!c?.closed_by?.trim()) return 0;
  const pct = Number(c.closer?.commission_percentage);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const amt = Number(r.amount);
  if (!Number.isFinite(amt)) return 0;
  return (amt * pct) / 100;
}

const PAYMENTS_PAGE_SIZE = 20;

function paymentServiceLabel(r: PaymentWithClient): string {
  return (
    r.description?.trim() ||
    paymentClientLeadSource(r) ||
    paymentClientLeadProvider(r) ||
    "—"
  );
}

function formatAgentCommissionBadge(r: PaymentWithClient): string {
  const name = paymentCloserDisplayName(r);
  const c = paymentClientEmbed(r);
  const pct = Number(c?.closer?.commission_percentage);
  const pctOk =
    Boolean(c?.closed_by?.trim()) && Number.isFinite(pct) && pct > 0;
  const comm = paymentAgentCommissionNis(r);
  const pctStr = pctOk ? `${pct}%` : "—";
  const commStr =
    comm > 0
      ? `${comm.toLocaleString("he-IL", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })} ₪`
      : "—";
  return `${name} (${pctStr} / ${commStr})`;
}

function toIsoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const start = new Date(y, mo, 1);
  const end = new Date(y, mo + 1, 0);
  return { start: toIsoLocalDate(start), end: toIsoLocalDate(end) };
}

function escapeCsvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

/** Plain number for Excel / SUM (dot decimal, no thousands separator). */
function formatCsvExcelNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Date-only for CSV: DD/MM/YYYY from DB date or ISO string (no time / TZ in output). */
function formatPaidOnForCsv(paidOn: string | null | undefined): string {
  const raw = paidOn?.trim() ?? "";
  if (!raw) return "";
  const datePart = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(datePart);
  if (m) {
    const [, y, mo, day] = m;
    return `${day}/${mo}/${y}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const y = String(d.getFullYear());
  return `${day}/${mo}/${y}`;
}

function downloadPaymentsCsv(
  rows: PaymentWithClient[],
  start: string,
  end: string,
  options: {
    includeSupplierColumn: boolean;
    commissionPercent: number | null;
  }
) {
  const { includeSupplierColumn, commissionPercent } = options;
  const withSupplierCommission =
    commissionPercent != null && Number.isFinite(commissionPercent);
  const header = [
    "שם לקוח",
    ...(includeSupplierColumn ? ["ספק"] : []),
    "Closer",
    "תאריך",
    "סכום (₪)",
    "Commission",
    ...(withSupplierCommission ? ["עמלת ספק (₪)"] : []),
    "אמצעי תשלום",
    "תיאור",
  ].map(escapeCsvCell);
  const lines = [header.join(",")];
  for (const r of rows) {
    const name = paymentClientFullName(r) || "—";
    const supplier = paymentClientLeadProvider(r) || "—";
    const closerName = paymentCloserDisplayName(r);
    const method = r.method?.trim() || "";
    const desc = r.description?.trim() || "";
    const amt = Number(r.amount);
    let supplierComm: number | null = null;
    if (
      withSupplierCommission &&
      supplier !== "—" &&
      commissionPercent != null &&
      Number.isFinite(commissionPercent)
    ) {
      supplierComm = (amt * commissionPercent) / 100;
    }
    const agentComm = paymentAgentCommissionNis(r);
    const dateCell = formatPaidOnForCsv(r.paid_on);
    const amountNumStr = Number.isFinite(amt)
      ? formatCsvExcelNumber(amt)
      : String(r.amount).replace(",", ".");
    const agentCommNumStr = formatCsvExcelNumber(agentComm);
    const supplierCommNumStr =
      supplierComm != null && Number.isFinite(supplierComm)
        ? formatCsvExcelNumber(supplierComm)
        : "";
    lines.push(
      [
        escapeCsvCell(name),
        ...(includeSupplierColumn ? [escapeCsvCell(supplier)] : []),
        escapeCsvCell(closerName),
        escapeCsvCell(dateCell),
        amountNumStr,
        agentCommNumStr,
        ...(withSupplierCommission ? [supplierCommNumStr] : []),
        escapeCsvCell(method),
        escapeCsvCell(desc),
      ].join(",")
    );
  }
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `סיכום-הכנסות_${start}_${end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminRevenuePage() {
  const [{ start: startDate, end: endDate }, setRange] = useState(
    defaultMonthRange
  );
  const [rows, setRows] = useState<PaymentWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadSourceFilter, setLeadSourceFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(
    null
  );
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [leadProviders, setLeadProviders] = useState<LeadProviderRow[]>([]);
  const [leadProvidersError, setLeadProvidersError] = useState<string | null>(
    null
  );
  const [closerFilter, setCloserFilter] = useState("");
  const [profileFilterOptions, setProfileFilterOptions] = useState<
    { id: string; full_name: string | null }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setProfileFilterOptions([]);
        return;
      }
      setProfileFilterOptions(
        (data ?? []) as { id: string; full_name: string | null }[]
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("lead_providers")
        .select("id, name, phone, commission_percent")
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setLeadProviders([]);
        setLeadProvidersError(error.message);
        return;
      }
      setLeadProvidersError(null);
      setLeadProviders((data ?? []) as LeadProviderRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const rangeStart = startDate <= endDate ? startDate : endDate;
    const rangeEnd = startDate <= endDate ? endDate : startDate;
    const { data, error: qErr } = await supabase
      .from("payments")
      .select(
        "id, amount, paid_on, method, description, client_id, clients(full_name, lead_source, lead_provider_name, closed_by)"
      )
      .gte("paid_on", rangeStart)
      .lte("paid_on", rangeEnd)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (qErr) {
      setLoading(false);
      setRows([]);
      setError(
        qErr.message.includes("payments") || qErr.code === "42P01"
          ? `${qErr.message} — הריצו ב-Supabase את הקובץ add_payments_table.sql`
          : qErr.message.includes("lead_provider_name")
            ? `${qErr.message} — הריצו add_client_lead_provider_name.sql ב-Supabase`
            : qErr.message.includes("closed_by")
              ? `${qErr.message} — הריצו add_closed_by_and_rep_commission.sql ב-Supabase`
              : qErr.message
      );
      return;
    }

    const { data: profRows, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name, commission_percentage");

    setLoading(false);
    if (profErr) {
      setRows([]);
      setError(
        profErr.message.includes("commission_percentage")
          ? `${profErr.message} — הריצו add_closed_by_and_rep_commission.sql ב-Supabase`
          : profErr.message
      );
      return;
    }

    type ProfRow = {
      id: string;
      full_name: string | null;
      commission_percentage: number | string | null;
    };
    const profMap = new Map<string, ProfRow>(
      (profRows ?? []).map((p: ProfRow) => [p.id, p])
    );

    const raw = (data ?? []) as unknown as PaymentWithClient[];
    const merged: PaymentWithClient[] = raw.map((row) => {
      const c = row.clients;
      const emb = Array.isArray(c) ? c[0] : c;
      if (!emb) return row;
      const cid = emb.closed_by?.trim();
      if (!cid) {
        return {
          ...row,
          clients: { ...emb, closer: null },
        };
      }
      const pr = profMap.get(cid);
      return {
        ...row,
        clients: {
          ...emb,
          closer: pr
            ? {
                full_name: pr.full_name ?? null,
                commission_percentage: pr.commission_percentage ?? 0,
              }
            : null,
        },
      };
    });

    setRows(merged);
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerFilterTrim = providerFilter.trim();
  const closerFilterTrim = closerFilter.trim();

  const selectedProviderRow = useMemo(() => {
    if (!providerFilterTrim) return null;
    return (
      leadProviders.find((p) => p.name.trim() === providerFilterTrim) ?? null
    );
  }, [leadProviders, providerFilterTrim]);

  const commissionRatePercent = useMemo(() => {
    if (!selectedProviderRow) return null;
    const n = Number(selectedProviderRow.commission_percent);
    return Number.isFinite(n) ? n : null;
  }, [selectedProviderRow]);

  const showCommissionColumn =
    Boolean(providerFilterTrim) && commissionRatePercent != null;

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (leadSourceFilter && paymentClientLeadSource(r) !== leadSourceFilter) {
        return false;
      }
      if (
        providerFilterTrim &&
        paymentClientLeadProvider(r) !== providerFilterTrim
      ) {
        return false;
      }
      if (closerFilterTrim === "__none__") {
        if (paymentClientEmbed(r)?.closed_by?.trim()) return false;
      } else if (closerFilterTrim) {
        if (paymentClientEmbed(r)?.closed_by?.trim() !== closerFilterTrim) {
          return false;
        }
      }
      return true;
    });
  }, [rows, leadSourceFilter, providerFilterTrim, closerFilterTrim]);

  const paymentTotalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / PAYMENTS_PAGE_SIZE)
  );

  const paginatedPaymentRows = useMemo(() => {
    const start = (paymentsPage - 1) * PAYMENTS_PAGE_SIZE;
    return filteredRows.slice(start, start + PAYMENTS_PAGE_SIZE);
  }, [filteredRows, paymentsPage]);

  useEffect(() => {
    setPaymentsPage(1);
  }, [
    rows,
    leadSourceFilter,
    providerFilterTrim,
    closerFilterTrim,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    setPaymentsPage((p) =>
      p > paymentTotalPages ? paymentTotalPages : Math.max(1, p)
    );
  }, [paymentTotalPages]);

  const totalCommissionPayable = useMemo(() => {
    if (!showCommissionColumn || commissionRatePercent == null) return 0;
    return filteredRows.reduce(
      (s, r) => s + (Number(r.amount) * commissionRatePercent) / 100,
      0
    );
  }, [filteredRows, showCommissionColumn, commissionRatePercent]);

  const totalAgentCommissions = useMemo(() => {
    return filteredRows.reduce((s, r) => s + paymentAgentCommissionNis(r), 0);
  }, [filteredRows]);

  const closerBreakdownRows = useMemo(() => {
    const m = new Map<
      string,
      { name: string; sales: number; commission: number }
    >();
    for (const r of filteredRows) {
      const c = paymentClientEmbed(r);
      const key = c?.closed_by?.trim() || "__unassigned";
      const name = paymentCloserDisplayName(r);
      const amt = Number(r.amount);
      const comm = paymentAgentCommissionNis(r);
      const prev = m.get(key) ?? { name, sales: 0, commission: 0 };
      prev.sales += Number.isFinite(amt) ? amt : 0;
      prev.commission += comm;
      m.set(key, prev);
    }
    return Array.from(m.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.sales - a.sales);
  }, [filteredRows]);

  const totalRevenue = useMemo(
    () => filteredRows.reduce((s, r) => s + Number(r.amount), 0),
    [filteredRows]
  );

  const transactionCount = filteredRows.length;

  const averagePerPayment = useMemo(() => {
    if (transactionCount === 0) return 0;
    return totalRevenue / transactionCount;
  }, [totalRevenue, transactionCount]);

  const monthlyChartData = useMemo(() => {
    const lo = startDate <= endDate ? startDate : endDate;
    const hi = startDate <= endDate ? endDate : startDate;
    return buildMonthlyRevenueChartData(filteredRows, lo, hi);
  }, [filteredRows, startDate, endDate]);

  const handleDeletePayment = async (id: string) => {
    if (
      !window.confirm(
        "למחוק את תשלום זה מהמערכת? הפעולה בלתי הפיכה."
      )
    ) {
      return;
    }
    setDeletingPaymentId(id);
    const { error: delErr } = await supabase
      .from("payments")
      .delete()
      .eq("id", id);
    setDeletingPaymentId(null);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    setRows((prev) => prev.filter((p) => p.id !== id));
    setError(null);
  };

  const agentBreakdownColumns = useMemo(
    (): ResponsiveColumnDef<AgentBreakdownRow>[] => [
      {
        id: "name",
        header: "שם",
        cell: (r) => r.name,
        tdClassName: "font-medium text-neutral-900 dark:text-neutral-100",
      },
      {
        id: "sales",
        header: "סה״כ מכירות",
        cell: (r) => (
          <span className="tabular-nums" dir="ltr">
            {r.sales.toLocaleString("he-IL", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{" "}
            ₪
          </span>
        ),
        tdClassName: "tabular-nums text-neutral-800 dark:text-neutral-200",
      },
      {
        id: "commission",
        header: "סה״כ עמלה",
        cell: (r) => (
          <span
            className="font-medium tabular-nums text-violet-900 dark:text-violet-100"
            dir="ltr"
          >
            {r.commission.toLocaleString("he-IL", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{" "}
            ₪
          </span>
        ),
        tdClassName:
          "font-medium tabular-nums text-violet-900 dark:text-violet-100",
      },
    ],
    []
  );

  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6"
      dir="rtl"
    >
      <header className="space-y-1 text-start">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          💰 סיכום הכנסות
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          דשבורד תשלומים לפי טווח תאריכים (
          <code className="rounded bg-neutral-100 px-1 text-xs dark:bg-neutral-800">
            payments.paid_on
          </code>
          ) — לניתוח וחשבונאות.
        </p>
      </header>

      <section
        className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-white p-4 shadow-sm max-md:px-3 max-md:py-4 sm:p-5 dark:border-emerald-900/45 dark:from-emerald-950/25 dark:via-neutral-900/40 dark:to-neutral-900/40"
        aria-labelledby="revenue-filters-h"
      >
        <h2
          id="revenue-filters-h"
          className="text-start text-base font-semibold text-emerald-950 dark:text-emerald-100"
        >
          סינון תקופה, מקור ליד, ספק וסוגר עסקה
        </h2>
        <p className="mt-1 text-start text-xs text-emerald-800/80 dark:text-emerald-200/80">
          בחרו טווח תאריכים, אופציונלית מקור ליד, ספק ו/או סוגר עסקה — הגרף,
          כרטיסי הסיכום, העמלות והטבלה מתעדכנים מיד. בסינון לפי ספק מוצגת עמלה
          לפי אחוז שהוגדר לספק.
        </p>
        {leadProvidersError ? (
          <p
            className="mt-3 text-start text-xs text-amber-800 dark:text-amber-200"
            role="status"
          >
            לא נטענה טבלת ספקים ({leadProvidersError}). הריצו add_lead_providers.sql
            ב־Supabase.
          </p>
        ) : null}
        {!loading && !error ? (
          <div
            className="mt-4 rounded-xl border border-violet-200/90 bg-violet-50/95 px-4 py-3 text-start shadow-sm dark:border-violet-900/45 dark:bg-violet-950/30"
            role="region"
            aria-label="סיכום עמלות סוכנים"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-900 dark:text-violet-200/90">
              סה״כ עמלות לתשלום
            </p>
            <p
              className="mt-1 text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50"
              dir="ltr"
            >
              {totalAgentCommissions.toLocaleString("he-IL", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                ₪
              </span>
            </p>
            <p className="mt-1 text-xs text-violet-950/85 dark:text-violet-100/80">
              לפי סוגר עסקה ואחוז עמלה בפרופיל (הגדרות → צוות)
            </p>
          </div>
        ) : null}
        {showCommissionColumn && selectedProviderRow ? (
          <div
            className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-start shadow-sm dark:border-amber-900/50 dark:bg-amber-950/35"
            role="region"
            aria-label="סיכום עמלות ספק"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200/90">
              סה״כ עמלות ספק (לפי סינון)
            </p>
            <p
              className="mt-1 text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50"
              dir="ltr"
            >
              {totalCommissionPayable.toLocaleString("he-IL", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                ₪
              </span>
            </p>
            <p className="mt-1 text-xs text-amber-950/80 dark:text-amber-100/80">
              {selectedProviderRow.name} · עמלה {commissionRatePercent}% · לפי
              תשלומים מסוננים בתאריכים שנבחרו
            </p>
          </div>
        ) : null}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-7 xl:items-end">
          <label className="grid min-w-0 gap-1.5 text-start text-sm sm:col-span-1">
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              <span className="md:hidden">מקור ליד</span>
              <span className="hidden md:inline" dir="ltr">
                Lead source
              </span>
            </span>
            <span className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
              סנן לפי מקור ליד
            </span>
            <select
              value={leadSourceFilter}
              onChange={(e) => setLeadSourceFilter(e.target.value)}
              className="h-9 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-neutral-100 dark:focus:border-emerald-500"
            >
              <option value="">הכל</option>
              {LEAD_SOURCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-start text-sm sm:col-span-1">
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              <span className="md:hidden">ספק ליד</span>
              <span className="hidden md:inline" dir="ltr">
                Supplier
              </span>
            </span>
            <span className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
              סנן לפי ספק מההגדרות
            </span>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="h-9 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-neutral-100 dark:focus:border-emerald-500"
            >
              <option value="">הכל</option>
              {leadProviders.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-start text-sm sm:col-span-1">
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              סוגר עסקה
            </span>
            <span className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
              סנן לפי סוכן שסגר את העסקה
            </span>
            <select
              value={closerFilter}
              onChange={(e) => setCloserFilter(e.target.value)}
              className="h-9 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-neutral-100 dark:focus:border-emerald-500"
            >
              <option value="">הכל</option>
              <option value="__none__">לא שויך</option>
              {profileFilterOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name?.trim() || p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-start text-sm sm:col-span-1">
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              <span className="md:hidden">מתאריך</span>
              <span className="hidden md:inline" dir="ltr">
                From
              </span>
            </span>
            <span className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
              תחילת טווח
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                setRange((r) => ({ ...r, start: e.target.value }))
              }
              dir="ltr"
              className="h-9 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-neutral-100 dark:focus:border-emerald-500"
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-start text-sm sm:col-span-1">
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              <span className="md:hidden">עד תאריך</span>
              <span className="hidden md:inline" dir="ltr">
                To
              </span>
            </span>
            <span className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
              סוף טווח
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              dir="ltr"
              className="h-9 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-neutral-100 dark:focus:border-emerald-500"
            />
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-2 xl:flex-row xl:items-end xl:justify-end">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 sm:w-auto dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            רענן
          </button>
          <button
            type="button"
            onClick={() => {
              const anyFilterActive =
                Boolean(leadSourceFilter.trim()) ||
                Boolean(providerFilterTrim) ||
                Boolean(closerFilterTrim);
              downloadPaymentsCsv(filteredRows, startDate, endDate, {
                includeSupplierColumn: anyFilterActive,
                commissionPercent:
                  showCommissionColumn && commissionRatePercent != null
                    ? commissionRatePercent
                    : null,
              });
            }}
            disabled={loading || filteredRows.length === 0}
            title="ייצוא לחשבונאות (לפי הסינון הנוכחי)"
            className="inline-flex h-9 min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 sm:w-auto dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
            <span className="md:hidden">ייצוא לאקסל (CSV)</span>
            <span className="hidden md:inline">CSV</span>
          </button>
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/40"
        aria-labelledby="revenue-chart-h"
      >
        <h2
          id="revenue-chart-h"
          className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
        >
          📈 מגמת הכנסות חודשית
        </h2>
        <p className="mt-1 text-start text-xs text-neutral-500 dark:text-neutral-400">
          סכום תשלומים מצטבר לפי חודש בטווח התאריכים (כרונולוגי).
        </p>
        <div className="mt-4" dir="ltr">
          {loading ? (
            <div className="flex h-[280px] items-center justify-center text-neutral-500 dark:text-neutral-400">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/80 px-4 py-10 text-center text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-900/30 dark:text-neutral-400">
              <span dir="rtl">
                אין מספיק נתונים להצגת גרף
              </span>
            </div>
          ) : (
            <div className="h-[min(320px,50vh)] w-full min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyChartData}
                  margin={{ top: 12, right: 12, left: 4, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-neutral-200 dark:stroke-neutral-700"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="text-neutral-600 dark:text-neutral-400"
                    interval={0}
                    angle={monthlyChartData.length > 6 ? -32 : 0}
                    textAnchor={monthlyChartData.length > 6 ? "end" : "middle"}
                    height={monthlyChartData.length > 6 ? 72 : 36}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="text-neutral-600 dark:text-neutral-400"
                    width={52}
                    tickFormatter={(v) =>
                      Number(v).toLocaleString("he-IL", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      })
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(16, 185, 129, 0.08)" }}
                    formatter={(value) => {
                      const n = Number(value ?? 0);
                      return [
                        `${n.toLocaleString("he-IL", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })} ₪`,
                        "סה״כ",
                      ];
                    }}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid rgb(229 231 235)",
                      direction: "rtl",
                      textAlign: "right",
                    }}
                  />
                  <Bar
                    dataKey="total"
                    name="הכנסות"
                    fill="#059669"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={56}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="revenue-total-h">
        <h2 id="revenue-total-h" className="sr-only">
          סיכומי הכנסות
        </h2>
        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
          <div className="w-full rounded-2xl border-2 border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-white p-4 shadow-md dark:border-emerald-900/50 dark:from-emerald-950/30 dark:via-neutral-900/80 dark:to-neutral-900/40 sm:p-5">
            <p className="text-start text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90 sm:text-sm">
              סה״כ הכנסות
            </p>
            <p
              className="mt-2 text-start text-xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50 max-md:whitespace-nowrap"
              dir="ltr"
            >
              {loading ? (
                <span className="text-neutral-400">…</span>
              ) : (
                <>
                  {totalRevenue.toLocaleString("he-IL", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                    ₪
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="w-full rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50 sm:p-5">
            <p className="text-start text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 sm:text-sm">
              מספר תשלומים
            </p>
            <p
              className="mt-2 text-start text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50"
              dir="ltr"
            >
              {loading ? (
                <span className="text-neutral-400">…</span>
              ) : (
                transactionCount.toLocaleString("he-IL")
              )}
            </p>
          </div>
          <div className="w-full rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50 sm:p-5">
            <p className="text-start text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 sm:text-sm">
              ממוצע לתשלום
            </p>
            <p
              className="mt-2 text-start text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 max-md:whitespace-nowrap"
              dir="ltr"
            >
              {loading ? (
                <span className="text-neutral-400">…</span>
              ) : (
                <>
                  {averagePerPayment.toLocaleString("he-IL", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                    ₪
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        {!loading && closerBreakdownRows.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50 sm:p-5">
            <h3 className="text-start text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              פירוט לפי סוגר עסקה
            </h3>
            <p className="mt-1 text-start text-xs text-neutral-500 dark:text-neutral-400">
              סה״כ מכירות (סכום תשלומים) ועמלת סוכן בטווח ובסינון הנוכחי
            </p>
            <div className="mt-3">
              <ResponsiveDataTable<AgentBreakdownRow>
                columns={agentBreakdownColumns}
                data={closerBreakdownRows}
                rowKey={(r) => r.key}
                minTableWidth="520px"
                desktopScrollHint="גלילה אופקית — טבלת סיכום לפי סוכן"
                emptyMessage="אין נתונים לפירוט"
              />
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-start text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section aria-labelledby="revenue-table-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="revenue-table-h"
            className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
          >
            פירוט תשלומים
          </h2>
          <p className="text-[11px] text-slate-500">
            {PAYMENTS_PAGE_SIZE} שורות בעמוד — תצוגה קומפקטית
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-100 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div
                className="grid h-[50px] max-h-[50px] grid-cols-[minmax(0,1fr)_minmax(0,260px)_auto] items-center gap-x-3 border-b border-slate-100 bg-white px-3 dark:border-neutral-800 dark:bg-neutral-950"
                role="row"
              >
                <div
                  className="text-[11px] font-semibold text-slate-500"
                  role="columnheader"
                >
                  לקוח ושירות
                </div>
                <div
                  className="text-[11px] font-semibold text-slate-500"
                  role="columnheader"
                >
                  תאריך · אמצעי · סוכן
                </div>
                <div
                  className="text-start text-[11px] font-semibold text-slate-500"
                  role="columnheader"
                >
                  סכום
                </div>
              </div>

              {loading ? (
                <div className="flex h-32 items-center justify-center text-slate-500">
                  <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-slate-500">
                  {rows.length === 0
                    ? "אין תשלומים בטווח התאריכים שנבחר."
                    : "אין תשלומים התואמים לסינון הנוכחי (מקור ליד / ספק / סוגר עסקה)."}
                </div>
              ) : (
                paginatedPaymentRows.map((r) => {
                  const name = paymentClientFullName(r) || "—";
                  const service = paymentServiceLabel(r);
                  const dateStr = r.paid_on
                    ? new Date(`${r.paid_on}T12:00:00`).toLocaleDateString(
                        "he-IL"
                      )
                    : "—";
                  const method = r.method?.trim() || "—";
                  const supplierNis =
                    showCommissionColumn && commissionRatePercent != null
                      ? (Number(r.amount) * commissionRatePercent) / 100
                      : null;
                  const supplierBit =
                    supplierNis != null && Number.isFinite(supplierNis)
                      ? ` · ספק ${supplierNis.toLocaleString("he-IL", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })} ₪`
                      : "";
                  const badgeText = formatAgentCommissionBadge(r);
                  return (
                    <div
                      key={r.id}
                      role="row"
                      className="grid h-[50px] max-h-[50px] grid-cols-[minmax(0,1fr)_minmax(0,260px)_auto] items-center gap-x-3 overflow-hidden border-b border-slate-100 bg-white px-3 hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900/60"
                    >
                      <div
                        role="cell"
                        className="flex min-h-0 min-w-0 max-h-[50px] items-center gap-2 overflow-hidden"
                      >
                        <Banknote
                          className="h-4 w-4 shrink-0 text-slate-400"
                          aria-hidden
                        />
                        <div className="min-w-0 truncate">
                          <span className="text-[13px] font-bold text-neutral-900 dark:text-neutral-50">
                            {name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {" "}
                            · {service}
                          </span>
                        </div>
                      </div>
                      <div
                        role="cell"
                        className="flex min-h-0 min-w-0 max-h-[50px] items-center gap-2 overflow-hidden"
                      >
                        <span
                          className="min-w-0 truncate text-[11px] text-slate-500"
                          title={`${dateStr} · ${method}${supplierBit}`}
                        >
                          {dateStr} · {method}
                          {supplierBit}
                        </span>
                        <span
                          className="max-w-[min(160px,40vw)] shrink-0 truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-slate-200"
                          title={badgeText}
                        >
                          {badgeText}
                        </span>
                      </div>
                      <div
                        role="cell"
                        className="flex max-h-[50px] items-center justify-end gap-2 overflow-hidden"
                      >
                        <span
                          className="text-[13px] font-bold tabular-nums text-neutral-900 dark:text-neutral-50"
                          dir="ltr"
                        >
                          {Number(r.amount).toLocaleString("he-IL", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}{" "}
                          ₪
                        </span>
                        <button
                          type="button"
                          aria-label="מחק תשלום"
                          disabled={deletingPaymentId !== null}
                          onClick={() => void handleDeletePayment(r.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-950/80"
                        >
                          {deletingPaymentId === r.id ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {!loading && filteredRows.length > 0 ? (
            <div className="flex h-11 items-center justify-between gap-3 border-t border-slate-100 bg-white px-3 text-[11px] text-slate-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-400">
              <span className="tabular-nums">
                מציג{" "}
                {(paymentsPage - 1) * PAYMENTS_PAGE_SIZE + 1}–
                {Math.min(
                  paymentsPage * PAYMENTS_PAGE_SIZE,
                  filteredRows.length
                )}{" "}
                מתוך {filteredRows.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={paymentsPage <= 1}
                  onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-slate-200 dark:hover:bg-neutral-800"
                >
                  הקודם
                </button>
                <span className="min-w-[4.5rem] text-center font-medium tabular-nums text-slate-700 dark:text-slate-300">
                  {paymentsPage} / {paymentTotalPages}
                </span>
                <button
                  type="button"
                  disabled={paymentsPage >= paymentTotalPages}
                  onClick={() =>
                    setPaymentsPage((p) =>
                      Math.min(paymentTotalPages, p + 1)
                    )
                  }
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-slate-200 dark:hover:bg-neutral-800"
                >
                  הבא
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
