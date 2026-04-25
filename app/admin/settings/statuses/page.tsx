"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Loader2,
  Plus,
  Tags,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { clientStatusBadgeStyle } from "@/lib/clientStatusStyle";

type ClientStatusRow = {
  id: string;
  label: string;
  color_hex: string;
  sort_order: number;
  is_system: boolean;
};

const cardClass =
  "rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900";

export default function AdminStatusesSettingsPage() {
  const [rows, setRows] = useState<ClientStatusRow[]>([]);
  const [botEnabledStatusIds, setBotEnabledStatusIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#64748b");

  const [deleteModal, setDeleteModal] = useState<{
    row: ClientStatusRow;
    clientCount: number;
  } | null>(null);
  const [reassignToId, setReassignToId] = useState<string>("");

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("client_statuses")
      .select("id, label, color_hex, sort_order, is_system")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

    setLoading(false);
    if (error) {
      setLoadError(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as ClientStatusRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        const data = (await res.json()) as {
          client_crm_bot_enabled_status_ids?: string[];
        };
        if (!res.ok || cancelled) return;
        const ids = Array.isArray(data.client_crm_bot_enabled_status_ids)
          ? data.client_crm_bot_enabled_status_ids
              .map((s) => String(s).trim())
              .filter(Boolean)
          : [];
        setBotEnabledStatusIds(Array.from(new Set(ids)));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (botEnabledStatusIds.length > 0) return;
    const waiting = rows.find((r) => r.label.trim() === "ממתין למסמכים");
    if (!waiting) return;
    setBotEnabledStatusIds([waiting.id]);
  }, [rows, botEnabledStatusIds.length]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.label.localeCompare(b.label, "he")
      ),
    [rows]
  );

  const saveRowPatch = async (id: string, patch: Partial<ClientStatusRow>) => {
    setBusy(true);
    const { error } = await supabase
      .from("client_statuses")
      .update(patch)
      .eq("id", id);
    setBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return false;
    }
    await load();
    setToast({ type: "success", message: "נשמר." });
    return true;
  };

  const persistBotEnabledStatusIds = useCallback(
    async (nextIds: string[]) => {
      setBusy(true);
      try {
        const res = await fetch("/api/admin/settings", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_crm_bot_enabled_status_ids: Array.from(new Set(nextIds)),
          }),
        });
        let payload: { error?: string } = {};
        try {
          payload = (await res.json()) as { error?: string };
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          setToast({
            type: "error",
            message: payload.error ?? "שמירת הגדרות בוט נכשלה",
          });
          return false;
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const toggleBotForStatus = async (statusId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...botEnabledStatusIds, statusId]))
      : botEnabledStatusIds.filter((id) => id !== statusId);
    setBotEnabledStatusIds(next);
    const ok = await persistBotEnabledStatusIds(next);
    if (!ok) {
      setBotEnabledStatusIds(botEnabledStatusIds);
      return;
    }
    setToast({
      type: "success",
      message: checked
        ? "הסטטוס יסומן לשליחת הודעות בוט."
        : "הסטטוס הוסר משליחת הודעות בוט.",
    });
  };

  const seedRecommendedStatuses = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/seed-default-statuses", {
        method: "POST",
        credentials: "include",
      });
      let message = "";
      try {
        const j = (await res.json()) as { error?: string };
        message = j.error ?? "";
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: message || `שגיאה (${res.status})`,
        });
        return;
      }
      await load();
      setToast({ type: "success", message: "נוספו סטטוסים מומלצים." });
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) {
      setToast({ type: "error", message: "יש להזין שם סטטוס." });
      return;
    }
    const hex = newColor.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setToast({
        type: "error",
        message: "צבע חייב להיות בפורמט #RRGGBB",
      });
      return;
    }
    const nextOrder =
      rows.length === 0
        ? 0
        : Math.max(...rows.map((r) => r.sort_order), 0) + 1;
    setBusy(true);
    const { error } = await supabase.from("client_statuses").insert({
      label,
      color_hex: hex,
      sort_order: nextOrder,
      is_system: false,
    });
    setBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    setNewLabel("");
    setNewColor("#64748b");
    await load();
    setToast({ type: "success", message: "הסטטוס נוסף." });
  };

  const moveRow = async (id: string, delta: -1 | 1) => {
    const list = sorted;
    const i = list.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i];
    const b = list[j];
    setBusy(true);
    const { error: e1 } = await supabase
      .from("client_statuses")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    if (e1) {
      setBusy(false);
      setToast({ type: "error", message: e1.message });
      return;
    }
    const { error: e2 } = await supabase
      .from("client_statuses")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    setBusy(false);
    if (e2) {
      setToast({ type: "error", message: e2.message });
      await load();
      return;
    }
    await load();
  };

  const openDelete = async (row: ClientStatusRow) => {
    if (row.is_system) return;
    setBusy(true);
    const { count, error } = await supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("status_id", row.id);
    setBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    const n = count ?? 0;
    if (n === 0) {
      const ok = window.confirm(
        `למחוק את הסטטוס "${row.label}"? פעולה זו בלתי הפיכה.`
      );
      if (!ok) return;
      setBusy(true);
      const { error: delErr } = await supabase
        .from("client_statuses")
        .delete()
        .eq("id", row.id);
      setBusy(false);
      if (delErr) {
        setToast({ type: "error", message: delErr.message });
        return;
      }
      await load();
      setToast({ type: "success", message: "הסטטוס נמחק." });
      return;
    }
    const firstOther = sorted.find((r) => r.id !== row.id);
    setReassignToId(firstOther?.id ?? "");
    setDeleteModal({ row, clientCount: n });
  };

  const confirmDeleteWithReassign = async () => {
    if (!deleteModal) return;
    const { row, clientCount } = deleteModal;
    if (!reassignToId || reassignToId === row.id) {
      setToast({
        type: "error",
        message: "בחרו סטטוס יעד להעברת הלקוחות.",
      });
      return;
    }
    setBusy(true);
    const { error: upErr } = await supabase
      .from("clients")
      .update({ status_id: reassignToId })
      .eq("status_id", row.id);
    if (upErr) {
      setBusy(false);
      setToast({ type: "error", message: upErr.message });
      return;
    }
    const { error: delErr } = await supabase
      .from("client_statuses")
      .delete()
      .eq("id", row.id);
    setBusy(false);
    if (delErr) {
      setToast({ type: "error", message: delErr.message });
      await load();
      return;
    }
    setDeleteModal(null);
    await load();
    setToast({
      type: "success",
      message:
        clientCount > 0
          ? `הועברו ${clientCount} לקוחות לסטטוס החדש והסטטוס נמחק.`
          : "הסטטוס נמחק.",
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      {toast ? (
        <div
          role="status"
          className={`fixed start-4 top-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <nav className="text-start text-sm text-neutral-500 dark:text-neutral-400">
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
          חזרה להגדרות
        </Link>
      </nav>

      <header className="flex flex-col gap-2 border-b border-neutral-200 pb-6 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <Tags
            className="h-8 w-8 shrink-0 text-indigo-600 dark:text-indigo-400"
            aria-hidden
          />
          <h1 className="text-start text-xl font-bold text-neutral-900 dark:text-neutral-50">
            סטטוסי לקוחות (CRM)
          </h1>
        </div>
        <p className="text-start text-sm text-neutral-600 dark:text-neutral-400">
          ניהול תוויות וצבעי תגיות ללוח הבקרה ולכרטיס לקוח. סטטוסי מערכת לא
          ניתנים למחיקה; ניתן לערוך שם וצבע.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : loadError ? (
        <p className="text-start text-sm text-red-600 dark:text-red-400">
          {loadError}
          <span className="mt-2 block text-neutral-600 dark:text-neutral-400">
            אם העמודה חסרה, הריצו ב-Supabase את הקובץ{" "}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
              add_client_statuses.sql
            </code>
            .
          </span>
        </p>
      ) : (
        <>
          <section className={cardClass}>
            <h2 className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100">
              הוספת סטטוס
            </h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="grid min-w-[12rem] flex-1 gap-1 text-start text-sm">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  שם
                </span>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  placeholder="לדוגמה: בטיפול משפטי"
                />
              </label>
              <label className="grid w-full gap-1 text-start text-sm sm:w-auto sm:min-w-[8rem]">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  צבע
                </span>
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-lg border border-neutral-300 bg-white sm:w-28 dark:border-neutral-600"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAdd()}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                <Plus className="h-4 w-4" aria-hidden />
                הוסף
              </button>
            </div>
          </section>

          <section className={`${cardClass} space-y-3`}>
            <h2 className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100">
              סטטוסים ({sorted.length})
            </h2>
            {sorted.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/80 px-4 py-10 text-center dark:border-neutral-600 dark:bg-neutral-900/40">
                <p className="text-start text-sm text-neutral-600 dark:text-neutral-400">
                  אין סטטוסים עדיין. ניתן לטעון סט שלבים מומלץ לצינור עבודה.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void seedRecommendedStatuses()}
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  טען סטטוסים מומלצים
                </button>
              </div>
            ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {sorted.map((r, idx) => {
                const badge = clientStatusBadgeStyle(r.color_hex);
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || idx === 0}
                        onClick={() => void moveRow(r.id, -1)}
                        className="rounded-lg border border-neutral-200 p-2 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-600 dark:hover:bg-neutral-800"
                        aria-label="הזז למעלה"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={busy || idx === sorted.length - 1}
                        onClick={() => void moveRow(r.id, 1)}
                        className="rounded-lg border border-neutral-200 p-2 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-600 dark:hover:bg-neutral-800"
                        aria-label="הזז למטה"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <span
                      className="inline-flex max-w-full rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: badge.backgroundColor,
                        color: badge.color,
                      }}
                    >
                      {r.label}
                    </span>
                    <label className="grid min-w-0 flex-1 gap-1 text-start text-sm">
                      <span className="sr-only">שם סטטוס</span>
                      <input
                        defaultValue={r.label}
                        key={`l-${r.id}-${r.label}`}
                        disabled={busy}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== r.label) {
                            void saveRowPatch(r.id, { label: v });
                          }
                        }}
                        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                      />
                    </label>
                    <label className="flex shrink-0 items-center gap-2 text-sm">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        צבע
                      </span>
                      <input
                        type="color"
                        defaultValue={r.color_hex}
                        key={`c-${r.id}-${r.color_hex}`}
                        disabled={busy}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== r.color_hex) {
                            void saveRowPatch(r.id, { color_hex: v });
                          }
                        }}
                        className="h-9 w-14 cursor-pointer rounded border border-neutral-300 dark:border-neutral-600"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={botEnabledStatusIds.includes(r.id)}
                          disabled={busy}
                          onChange={(e) =>
                            void toggleBotForStatus(r.id, e.target.checked)
                          }
                          className="h-4 w-4 rounded border-neutral-400 text-indigo-600 focus:ring-indigo-500"
                        />
                        שליחת בוט (V)
                      </label>
                      {r.is_system ? (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          מערכת
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void openDelete(r)}
                          className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                          aria-label={`מחק ${r.label}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            )}
          </section>
        </>
      )}

      {deleteModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="סגור"
            className="absolute inset-0 bg-black/50"
            onClick={() => !busy && setDeleteModal(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-status-title"
            className="relative z-10 w-full max-w-md rounded-t-2xl border border-neutral-200 bg-white p-5 shadow-xl sm:rounded-2xl dark:border-neutral-700 dark:bg-neutral-900"
          >
            <h2
              id="del-status-title"
              className="text-start text-lg font-semibold text-neutral-900 dark:text-neutral-50"
            >
              מחיקת סטטוס
            </h2>
            <p className="mt-3 text-start text-sm text-neutral-600 dark:text-neutral-400">
              יש{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">
                {deleteModal.clientCount}
              </strong>{" "}
              לקוחות בסטטוס &quot;{deleteModal.row.label}&quot;. בחרו סטטוס אליו
              יועברו לפני המחיקה.
            </p>
            <label className="mt-4 grid gap-2 text-start text-sm">
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                העבר לקוחות לסטטוס
              </span>
              <select
                value={reassignToId}
                onChange={(e) => setReassignToId(e.target.value)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
              >
                <option value="">— בחרו —</option>
                {sorted
                  .filter((r) => r.id !== deleteModal.row.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
              </select>
            </label>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteModal(null)}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDeleteWithReassign()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "מבצע…" : "העבר ומחק"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
