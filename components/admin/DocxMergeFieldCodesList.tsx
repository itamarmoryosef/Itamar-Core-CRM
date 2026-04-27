"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { docxPlaceholderForFieldSlug } from "@/lib/docxFieldPlaceholder";

type DefRow = { id: string; label: string; slug: string };

export function DocxMergeFieldCodesList(props: {
  organizationId: string | null;
  meReady: boolean;
}) {
  const { organizationId, meReady } = props;
  const [rows, setRows] = useState<DefRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!meReady) return;
    if (!organizationId) {
      setRows([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void supabase
      .from("custom_field_definitions")
      .select("id, label, slug")
      .eq("organization_id", organizationId)
      .order("label", { ascending: true })
      .then(
        (res: {
          data: DefRow[] | null;
          error: { message: string } | null;
        }) => {
          if (cancelled) return;
          setLoading(false);
          if (res.error) {
            setError(res.error.message);
            setRows([]);
            return;
          }
          setRows(res.data ?? []);
        }
      );
    return () => {
      cancelled = true;
    };
  }, [meReady, organizationId]);

  const copy = async (id: string, slug: string) => {
    const text = docxPlaceholderForFieldSlug(slug);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(
        () => setCopiedId((c) => (c === id ? null : c)),
        1400
      );
    } catch {
      /* ignore */
    }
  };

  if (!meReady) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-neutral-500 dark:text-neutral-400">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        טוען…
      </div>
    );
  }
  if (!organizationId) {
    return (
      <p
        className="mt-2 text-start text-sm text-amber-800 dark:text-amber-200"
        role="status"
      >
        (Super) בחרו ארגון למעלה כדי לטעון את קודי השתילה לשדות בארגון.
      </p>
    );
  }
  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        טוען שדות…
      </div>
    );
  }
  if (error) {
    return (
      <p className="mt-2 text-start text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-start text-sm text-neutral-600 dark:text-neutral-400">
        אין שדות מוגדרים לארגון זה.{" "}
        <Link
          href="/admin/settings/layout"
          className="font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:opacity-90"
        >
          הוסיפו שדות בבונה הפריסה
        </Link>{" "}
        — אז יופיעו כאן קודי <code className="rounded bg-neutral-100 px-1 text-xs dark:bg-neutral-800">{"{{custom_…}}"}</code>{" "}
        להעתקה.
      </p>
    );
  }

  return (
    <div>
      <ul className="mt-4 space-y-2">
        {rows.map((r) => {
          const ph = docxPlaceholderForFieldSlug(r.slug);
          const copied = copiedId === r.id;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950/40"
            >
              <div className="min-w-0 text-start">
                <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {r.label}
                </span>
                <code
                  dir="ltr"
                  className="mt-0.5 block truncate text-xs font-semibold text-brand"
                >
                  {ph}
                </code>
              </div>
              <button
                type="button"
                onClick={() => void copy(r.id, r.slug)}
                className={`shrink-0 rounded-md p-1.5 transition ${
                  copied
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-400 hover:bg-neutral-200/80 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                }`}
                title="העתק"
                aria-label={`העתק ${ph}`}
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-start text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        הזינו ב־Word בפורמט <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{"{{custom_…}}"}</code> (מומלץ)
        או <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{"{custom_…}"}</code> — לפני המיזוג המערכת
        מנרמלת ל־<code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{"[[custom_…]]"}</code> ל־Docxtemplater.
      </p>
    </div>
  );
}
