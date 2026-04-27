"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  BookTemplate,
  ChevronDown,
  Loader2,
  Plus,
  Save,
  SortAsc,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useAdminSession } from "@/lib/adminSessionContext";
import {
  getOutboundMessagePreset,
  OUTBOUND_MESSAGE_PRESETS,
} from "@/lib/outboundMessagePresets";
import { OUTBOUND_MESSAGE_PLACEHOLDER_MENU } from "@/lib/mergeClientOutboundMessage";

type TemplateRow = {
  id: string;
  name: string;
  body: string;
  channel: string;
  associated_status_id: string | null;
  is_active: boolean;
  sort_order: number;
  source_preset_id: string | null;
};

type StatusOpt = { id: string; label: string };

function orgQuery(orgId: string) {
  return `organizationId=${encodeURIComponent(orgId)}`;
}

const fieldPillClass =
  "shrink-0 rounded-lg border border-sky-700/20 bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-sky-700";

const addBarBtnClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-600/30 bg-amber-500/95 px-2.5 py-1.5 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-400/95";

export function MessageTemplatesManager() {
  const session = useAdminSession();
  const orgId = session?.activeOrganization?.id?.trim() ?? null;

  const [statuses, setStatuses] = React.useState<StatusOpt[]>([]);
  const [rows, setRows] = React.useState<TemplateRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const [newPresetId, setNewPresetId] = React.useState("");
  const [reorderBusy, setReorderBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      setRows([]);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/admin/outbound-message-templates?${orgQuery(orgId)}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/admin/client-statuses", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const tJson = (await tRes.json().catch(() => ({}))) as {
        error?: string;
        templates?: TemplateRow[];
      };
      if (!tRes.ok) {
        setErr(tJson.error ?? "טעינת תבניות נכשלה");
        return;
      }
      setRows(tJson.templates ?? []);
      if (sRes.ok) {
        const s = (await sRes.json().catch(() => ({}))) as {
          statuses?: { id: string; label: string }[];
        };
        setStatuses(
          (s.statuses ?? []).map((x) => ({ id: x.id, label: x.label }))
        );
      } else {
        setStatuses([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const createFromPreset = async () => {
    if (!orgId || !newPresetId) return;
    setCreating(true);
    setErr(null);
    const preset = getOutboundMessagePreset(newPresetId);
    const suggested = preset?.suggestedForStatusLabel?.trim();
    const matchStatusId = suggested
      ? statuses.find((s) => s.label.trim() === suggested)?.id
      : undefined;
    try {
      const res = await fetch(
        `/api/admin/outbound-message-templates?${orgQuery(orgId)}`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            presetId: newPresetId,
            organizationId: orgId,
            ...(matchStatusId
              ? { associatedStatusId: matchStatusId }
              : {}),
          }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "שמירה נכשלה");
        return;
      }
      setNewPresetId("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setCreating(false);
    }
  };

  const createEmpty = async () => {
    if (!orgId) return;
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/outbound-message-templates?${orgQuery(orgId)}`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "תבנית חדשה",
            body: "שלום [שם_פרטי],\n\n",
            channel: "whatsapp",
            organizationId: orgId,
          }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "שמירה נכשלה");
        return;
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setCreating(false);
    }
  };

  const saveRow = async (row: TemplateRow) => {
    if (!orgId) return;
    setSavingId(row.id);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/outbound-message-templates/${encodeURIComponent(row.id)}?${orgQuery(orgId)}`,
        {
          method: "PATCH",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.name,
            body: row.body,
            channel: row.channel,
            associatedStatusId: row.associated_status_id,
            isActive: row.is_active,
            organizationId: orgId,
          }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "שמירה נכשלה");
        return;
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!orgId) return;
    if (!window.confirm("למחוק את התבנית?")) return;
    setDeletingId(id);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/outbound-message-templates/${encodeURIComponent(id)}?${orgQuery(orgId)}`,
        { method: "DELETE", credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "מחיקה נכשלה");
        return;
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setDeletingId(null);
    }
  };

  const updateLocal = (id: string, patch: Partial<TemplateRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const copyRowJson = React.useCallback((row: TemplateRow) => {
    const o = {
      name: row.name,
      body: row.body,
      channel: row.channel,
      is_active: row.is_active,
      associated_status_id: row.associated_status_id,
      sort_order: row.sort_order,
    };
    const text = JSON.stringify(o, null, 2);
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        window.prompt("JSON (העתקה ידנית):", text);
      }
    })();
  }, []);

  const reapplyListOrder = React.useCallback(
    async (newRows: TemplateRow[]) => {
      if (!orgId) return;
      setReorderBusy(true);
      setErr(null);
      try {
        for (let k = 0; k < newRows.length; k++) {
          const t = newRows[k]!;
          const res = await fetch(
            `/api/admin/outbound-message-templates/${encodeURIComponent(
              t.id
            )}?${orgQuery(orgId)}`,
            {
              method: "PATCH",
              credentials: "include",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sortOrder: k, organizationId: orgId }),
            }
          );
          if (!res.ok) {
            const tj = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            setErr(tj.error ?? "מיון נכשל");
            return;
          }
        }
        await load();
      } finally {
        setReorderBusy(false);
      }
    },
    [orgId, load]
  );

  const moveAdjacent = React.useCallback(
    (id: string, direction: "up" | "down") => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) return;
      const j = direction === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= rows.length) return;
      const n = [...rows];
      [n[idx], n[j]] = [n[j]!, n[idx]!];
      void reapplyListOrder(n);
    },
    [rows, reapplyListOrder]
  );

  const sortAllByName = React.useCallback(() => {
    if (rows.length < 2) return;
    const sorted = [...rows].sort((a, b) =>
      a.name.trim().localeCompare(b.name.trim(), "he", {
        sensitivity: "base",
      })
    );
    void reapplyListOrder(sorted);
  }, [rows, reapplyListOrder]);

  if (!orgId) {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-200">
        אין הקשר ארגון — הזדהו או הזינו{" "}
        <Link className="underline" href="/admin">
          מסך אדמין
        </Link>{" "}
        כדי לשמור תבניות.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        טוען תבניות…
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}

      <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white p-4 dark:border-emerald-800/50 dark:from-emerald-950/30 dark:to-zinc-900/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <BookTemplate className="h-4 w-4 text-emerald-600" />
              תבניות מוכנות
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              בחרו סוג, לחצו &quot;הוסף לרשימה&quot; — ניתן לערוך מיד אחרי. מציינים
              גם שיוך ל־<strong>שלב ב־CRM</strong> (אופציונלי) לסידור ולשימוש
              עתידי.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center">
            <label className="grid min-w-0 flex-1 gap-1 text-start text-xs font-medium text-slate-600 dark:text-slate-300">
              בחרו תבנית
              <div className="relative">
                <select
                  value={newPresetId}
                  onChange={(e) => setNewPresetId(e.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pe-8 text-sm dark:border-slate-600 dark:bg-slate-900"
                >
                  <option value="">--</option>
                  {OUTBOUND_MESSAGE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </label>
            <button
              type="button"
              disabled={!newPresetId || creating}
              onClick={() => void createFromPreset()}
              className="mt-0 inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              הוסף לרשימה
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={() => void createEmpty()}
          className="mt-3 text-start text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          + או: תבנית ריקה
        </button>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            תבניות שמורות (SMS / WhatsApp)
          </p>
          {rows.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              {reorderBusy ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  מעדכן סדר…
                </span>
              ) : null}
              <button
                type="button"
                disabled={reorderBusy}
                onClick={() => void sortAllByName()}
                className={addBarBtnClass}
              >
                <SortAsc className="h-3.5 w-3.5 shrink-0" />
                מיין לפי שם
              </button>
            </div>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            אין עדיין תבניות — הוסיפו מ&quot;מוכנות&quot; או מריקה.
          </p>
        ) : (
          <ul className="space-y-5">
            {rows.map((r, index) => (
              <li
                key={r.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
              >
                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-800/50">
                  <div className="grid gap-3 sm:grid-cols-[1fr_minmax(12rem,1.2fr)]">
                    <label className="grid min-w-0 gap-1.5 text-start text-xs font-medium text-slate-600 dark:text-slate-300">
                      שם
                      <input
                        value={r.name}
                        onChange={(e) =>
                          updateLocal(r.id, { name: e.target.value })
                        }
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                      />
                    </label>
                    <div className="grid min-w-0 gap-1.5 text-start text-xs font-medium text-slate-600 dark:text-slate-300">
                      <div className="flex flex-wrap items-baseline justify-between gap-1">
                        <span>שיוך לשלב (CRM) — אופציונלי</span>
                        <Link
                          className="font-normal text-indigo-600 hover:underline dark:text-indigo-400"
                          href="/admin/settings/statuses"
                        >
                          ניהול סטטוסים
                        </Link>
                      </div>
                      <select
                        value={r.associated_status_id ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateLocal(r.id, {
                            associated_status_id: v ? v : null,
                          });
                        }}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-600 dark:bg-slate-950"
                      >
                        <option value="">ללא</option>
                        {statuses.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3 dark:border-slate-600/60 dark:bg-slate-950/30">
                    <label className="grid min-w-0 gap-1.5 text-start text-xs font-medium text-slate-600 dark:text-slate-300">
                      גוף ההודעה
                      <textarea
                        value={r.body}
                        onChange={(e) =>
                          updateLocal(r.id, { body: e.target.value })
                        }
                        rows={8}
                        className="w-full min-h-[9rem] resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed tabular-nums dark:border-slate-600 dark:bg-slate-950"
                        dir="auto"
                        spellCheck
                      />
                    </label>
                    <p className="mt-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      הוספת שדות (לחיצה מוסיפה לסוף הטקסט)
                    </p>
                    <div
                      className="mt-2 flex max-h-[9rem] flex-wrap gap-1.5 overflow-y-auto"
                      role="list"
                    >
                      {OUTBOUND_MESSAGE_PLACEHOLDER_MENU.map((m) => (
                        <button
                          type="button"
                          key={m.value}
                          role="listitem"
                          className={fieldPillClass}
                          onClick={() =>
                            updateLocal(r.id, { body: `${r.body}${m.value}` })
                          }
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={addBarBtnClass}
                        onClick={() => copyRowJson(r)}
                        title="העתקת JSON של התבנית"
                      >
                        <Braces className="h-3.5 w-3.5 shrink-0" />
                        JSON
                      </button>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        סדר ברשימה
                      </span>
                      <button
                        type="button"
                        disabled={reorderBusy || index === 0}
                        onClick={() => moveAdjacent(r.id, "up")}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 enabled:hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:enabled:hover:bg-slate-800"
                        title="הזזה למעלה"
                        aria-label="הזזת תבנית למעלה"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={reorderBusy || index === rows.length - 1}
                        onClick={() => moveAdjacent(r.id, "down")}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 enabled:hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:enabled:hover:bg-slate-800"
                        title="הזזה למטה"
                        aria-label="הזזת תבנית למטה"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3 sm:justify-end">
                      <label className="grid min-w-[6.5rem] gap-1 text-start text-xs font-medium text-slate-600">
                        ערוץ
                        <select
                          value={r.channel}
                          onChange={(e) =>
                            updateLocal(r.id, { channel: e.target.value })
                          }
                          className="h-9 w-full min-w-0 rounded-lg border border-slate-200 text-sm dark:border-slate-600 dark:bg-slate-950"
                        >
                          <option value="whatsapp">WhatsApp</option>
                          <option value="sms">SMS</option>
                          <option value="both">שניהם</option>
                        </select>
                      </label>
                      <label className="flex h-9 items-center gap-2 self-end rounded-lg border border-slate-200 px-2.5 text-xs dark:border-slate-600">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded"
                          checked={r.is_active}
                          onChange={(e) =>
                            updateLocal(r.id, { is_active: e.target.checked })
                          }
                        />
                        <span>פעיל</span>
                      </label>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingId === r.id}
                      onClick={() => void saveRow(r)}
                      className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      {savingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      שמור
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === r.id}
                      onClick={() => void remove(r.id)}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-sm text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                    >
                      {deletingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      מחק
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-500">
        <Link className="text-indigo-600 hover:underline" href="/admin/clients">
          בכרטיס לקוח
        </Link>{" "}
        (שליחת הודעה חופשית) — ניתן לבחור תבנית שמורה ולמזג{" "}
        <code className="rounded bg-slate-200 px-1">[שם]</code>{" "}
        אוטומטית ללקוח הנוכחי.
      </p>
    </div>
  );
}
