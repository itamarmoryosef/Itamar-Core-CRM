"use client";

import { useState } from "react";
import { Check, Copy, FileUp, Loader2 } from "lucide-react";
import { extractLabeledFieldValues } from "@/lib/extractCustomFieldsFromDocumentText";
import {
  customFieldDocxNormalizedTag,
  customFieldWordPlaceholder,
} from "@/lib/customFieldsTemplate";

type Def = { label: string; slug: string };

export function CustomFieldsDocumentImportPanel({ defs }: { defs: Def[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    setValues(null);
    setMissing([]);
    setBusy(true);
    try {
      if (defs.length === 0) {
        setErr("אין שדות מוגדרים — הוסיפו שדה לפני ייבוא.");
        return;
      }
      const name = f.name.toLowerCase();
      let text = "";
      if (name.endsWith(".txt")) {
        text = await f.text();
      } else if (name.endsWith(".docx")) {
        const mammoth = (await import("mammoth")).default;
        const r = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
        text = r.value;
      } else {
        setErr("נא קובץ ‎.docx או ‎.txt בלבד.");
        return;
      }
      const { values: v, missingSlugs } = extractLabeledFieldValues(text, defs);
      setValues(v);
      setMissing(missingSlugs);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "שגיאה בקריאת הקובץ");
    } finally {
      setBusy(false);
    }
  };

  const jsonPayload =
    values && Object.keys(values).length > 0
      ? JSON.stringify(values, null, 2)
      : "";

  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 text-start dark:border-slate-700 dark:bg-slate-900/30"
      dir="rtl"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            ייבוא ערכים ממסמך
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            מעלים ‎.docx או ‎.txt שממוספרים בטקסט. המערכת מחפשת שורות לפי{" "}
            <strong>התווית</strong> של כל שדה — למשל{" "}
            <code className="rounded bg-slate-200/90 px-1 [direction:ltr] text-left dark:bg-slate-800">
              מחיר: 5,000
            </code>{" "}
            או <code className="rounded bg-slate-200/90 px-1">מחיר - 5000</code>. אין OCR לתמונות;
            לתוצאות טובות עדיף Word עם טקסט אמיתי.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
            קוד שתילה ב־Word (לפי ה־slug שלכם), למשל:{" "}
            <code className="[direction:ltr]">{customFieldWordPlaceholder("price")}</code> — אחרי
            מיזוג פנימי:{" "}
            <code className="[direction:ltr]">{customFieldDocxNormalizedTag("price")}</code>.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-xl border border-brand-soft bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800">
          {busy ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <FileUp className="h-4 w-4 shrink-0" aria-hidden />
          )}
          בחר מסמך
          <input
            type="file"
            accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="sr-only"
            onChange={(ev) => void onFile(ev)}
            disabled={busy}
          />
        </label>
      </div>
      {err ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}
      {values && Object.keys(values).length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[300px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100/80 text-start text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <th className="p-2">שדה (slug)</th>
                  <th className="p-2">ערך שזוהה</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(values).map(([slug, val]) => (
                  <tr
                    key={slug}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="p-2 font-mono text-xs [direction:ltr] text-left">{slug}</td>
                    <td className="p-2">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.length > 0 ? (
            <p className="text-xs text-slate-500">
              לא זוהה ערך ל־<span className="font-mono">{missing.join(", ")}</span> — ודאו
              שבמסמך מופיעה <strong>בדיוק</strong> התווית ומפריד (: או -).
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!jsonPayload) return;
                try {
                  await navigator.clipboard.writeText(jsonPayload);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* ignore */
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied ? "הועתק" : "העתק JSON (להדבקה ב־`custom_fields_data`)"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
