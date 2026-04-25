"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { normalizeCustomFieldSlugInput } from "@/lib/customFieldsTemplate";

type DefRow = { id: string; label: string; slug: string };

function placeholderForSlug(slug: string): string {
  const s = normalizeCustomFieldSlugInput(slug);
  return `{{custom_${s || "slug"}}}`;
}

export function EmbedCodesModal(props: {
  open: boolean;
  onClose: () => void;
  onCopied: () => void;
}) {
  const { open, onClose, onCopied } = props;
  const [rows, setRows] = useState<DefRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setCopiedSlug(null);
      return;
    }
    setLoading(true);
    void supabase
      .from("custom_field_definitions")
      .select("id, label, slug")
      .order("label", { ascending: true })
      .then((res: { data: DefRow[] | null; error: PostgrestError | null }) => {
        setLoading(false);
        if (res.error || !res.data) {
          setRows([]);
          return;
        }
        setRows(res.data);
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(s) ||
        r.slug.toLowerCase().includes(s) ||
        placeholderForSlug(r.slug).toLowerCase().includes(s)
    );
  }, [rows, q]);

  const copyRow = async (slug: string) => {
    const text = placeholderForSlug(slug);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSlug(slug);
      onCopied();
      window.setTimeout(() => {
        setCopiedSlug((s) => (s === slug ? null : s));
      }, 1400);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="embed-codes-title"
        className="relative z-10 flex max-h-[min(85dvh,26rem)] w-full max-w-sm flex-col overflow-hidden rounded-[1.25rem] border-0 bg-white shadow-xl shadow-slate-200/40 ring-1 ring-slate-200/60 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-neutral-700/80"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
          <h2
            id="embed-codes-title"
            className="text-start text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
          >
            קודים להטמעה
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="סגור"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="border-b border-slate-100 p-2.5 dark:border-neutral-800">
          <label className="relative block">
            <Search className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש לפי תווית או slug…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/90 py-1.5 pe-9 ps-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200/80 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:ring-neutral-600/50"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              טוען…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              {rows.length === 0 ? "אין שדות מותאמים." : "אין תוצאות."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
              {filtered.map((r) => {
                const ph = placeholderForSlug(r.slug);
                const copied = copiedSlug === r.slug;
                return (
                  <li key={r.id}>
                    <div className="flex w-full items-start gap-2 px-2.5 py-1.5 text-start text-sm">
                      <button
                        type="button"
                        onClick={() => void copyRow(r.slug)}
                        className={`mt-0.5 shrink-0 rounded-md p-1 transition ${
                          copied
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                        }`}
                        title="העתק"
                        aria-label={`העתק ${ph}`}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyRow(r.slug)}
                        className="min-w-0 flex-1 text-start transition hover:bg-neutral-50/80 dark:hover:bg-neutral-800/50"
                      >
                        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {r.label}
                        </span>
                        <code
                          className="mt-0.5 block truncate text-[11px] text-neutral-500 dark:text-neutral-400"
                          dir="ltr"
                        >
                          {ph}
                        </code>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="border-t border-slate-100 px-3 py-1.5 text-center text-[10px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          לחיצה על השורה או על סמל ההעתקה — האייקון יסמן אישור זמני
        </p>
      </div>
    </div>
  );
}
