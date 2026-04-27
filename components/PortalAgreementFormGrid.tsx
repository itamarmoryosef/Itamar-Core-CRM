"use client";

import { useId } from "react";
import { Calendar } from "lucide-react";
import {
  crmAdminColumnSpanToGrid12,
  crmLocalTodayYmd,
  formatCrmDateValueForHebrewDisplay,
  formatYesNoHebrewForDisplay,
  isCrmDateYmdBeforeLocalToday,
  isYesNoAnswered,
  normalizeCrmFieldType,
  parseCrmDateFieldConfig,
  parseCrmSelectOptions,
  sanitizeCrmNumberInput,
  parseMultiSelectStoredValue,
  serializeMultiSelectValue,
} from "@/lib/crmFieldLayout";
import {
  groupTemplateFieldsBySectionAndRow,
  type TemplateFieldRow,
} from "@/lib/agreementFormTemplateLayout";

type Props = {
  /** Flat list from template + definitions (sections resolved in layout). */
  fields: TemplateFieldRow[];
  values: Record<string, string>;
  onChange: (slug: string, value: string) => void;
  disabled?: boolean;
  /** When true, render labels/values only (builder preview). */
  preview?: boolean;
  /** Dense typography/spacing (e.g. template builder). Does not change data binding. */
  compact?: boolean;
};

const ctlClass =
  "mt-1.5 w-full min-h-[2.5rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition placeholder:text-neutral-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200/80 disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:ring-neutral-700/50";

const ctlClassCompact =
  "mt-0.5 w-full h-7 min-h-[1.75rem] rounded border border-slate-200 bg-white px-2 py-0 text-[11px] font-medium leading-none text-neutral-900 transition placeholder:text-neutral-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-200/80 disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:ring-neutral-700/50";

const sectionCardClass =
  "rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900";

const sectionCardClassCompact =
  "rounded-lg border border-slate-200/70 bg-white p-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-900";

function PortalDateField({
  value,
  onChange,
  disabled,
  compact,
  requireFuture,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  compact: boolean;
  requireFuture: boolean;
}) {
  const errId = useId();
  const ymd = value.length >= 10 ? value.slice(0, 10) : "";
  const hebrew = ymd ? formatCrmDateValueForHebrewDisplay(ymd) : "";
  const filled = ymd.length > 0;
  const pastInvalid =
    requireFuture && filled && isCrmDateYmdBeforeLocalToday(ymd);
  const ariaInvalid = !filled || pastInvalid;
  const shell = compact
    ? `mt-0.5 flex w-full h-7 min-h-[1.75rem] items-stretch overflow-hidden rounded border transition focus-within:ring-1 focus-within:ring-slate-200/80 dark:focus-within:ring-neutral-700/50 ${
        pastInvalid
          ? "border-amber-500/90 ring-1 ring-amber-300/70 focus-within:border-amber-500 dark:border-amber-500/80 dark:ring-amber-800/50"
          : "border-slate-200 focus-within:border-slate-300 dark:border-neutral-600"
      } ${disabled ? "opacity-60" : ""} bg-white dark:bg-neutral-950`
    : `mt-1.5 flex w-full min-h-[2.5rem] items-stretch overflow-hidden rounded-xl border transition focus-within:ring-2 focus-within:ring-slate-200/80 dark:focus-within:ring-neutral-700/50 ${
        pastInvalid
          ? "border-amber-500/90 ring-2 ring-amber-300/60 focus-within:border-amber-500 dark:border-amber-500/80 dark:ring-amber-800/50"
          : "border-slate-200 focus-within:border-slate-300 dark:border-neutral-600"
      } ${disabled ? "opacity-60" : ""} bg-white dark:bg-neutral-950`;

  return (
    <>
      <div dir="ltr" className={shell}>
        <div
          className={
            compact
              ? "flex w-7 shrink-0 items-center justify-center border-e border-slate-200/90 bg-slate-50/80 dark:border-neutral-600 dark:bg-neutral-900/50"
              : "flex w-9 shrink-0 items-center justify-center border-e border-slate-200/90 bg-slate-50/80 dark:border-neutral-600 dark:bg-neutral-900/50"
          }
          aria-hidden
        >
          <Calendar
            className={
              compact
                ? "h-3.5 w-3.5 text-slate-500 dark:text-slate-400"
                : "h-4 w-4 text-slate-500 dark:text-slate-400"
            }
            strokeWidth={2}
          />
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            dir="rtl"
            className={
              compact
                ? "pointer-events-none flex min-h-full items-center px-1.5 py-0.5 text-start leading-none"
                : "pointer-events-none flex min-h-full items-center px-2 py-1.5 text-start"
            }
          >
            {hebrew ? (
              <span
                className={
                  compact
                    ? "w-full min-w-0 truncate text-[11px] font-bold text-neutral-900 tabular-nums dark:text-neutral-100"
                    : "w-full min-w-0 truncate text-sm font-bold text-neutral-900 tabular-nums dark:text-neutral-100"
                }
              >
                {hebrew}
              </span>
            ) : (
              <span
                className={
                  compact
                    ? "w-full text-[11px] text-neutral-400 dark:text-neutral-500"
                    : "w-full text-sm text-neutral-400 dark:text-neutral-500"
                }
              >
                בחרו תאריך
              </span>
            )}
          </div>
          <input
            type="date"
            className="absolute inset-0 z-10 h-full w-full min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            value={ymd}
            disabled={disabled}
            min={requireFuture ? crmLocalTodayYmd() : undefined}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={ariaInvalid}
            aria-describedby={pastInvalid ? errId : undefined}
          />
        </div>
      </div>
      {pastInvalid ? (
        <p
          id={errId}
          role="alert"
          className={`mt-1 text-start font-medium text-amber-800 dark:text-amber-200/95 ${
            compact ? "text-[10px] leading-tight" : "text-[11px]"
          }`}
        >
          התאריך שנבחר חל בעבר. נא לבחור תאריך מהיום ואילך (למשל מועד פגישה).
        </p>
      ) : null}
    </>
  );
}

export function PortalAgreementFormGrid({
  fields,
  values,
  onChange,
  disabled,
  preview,
  compact = false,
}: Props) {
  const sections = groupTemplateFieldsBySectionAndRow(fields);
  if (sections.length === 0) return null;

  const ctl = compact ? ctlClassCompact : ctlClass;
  const card = compact ? sectionCardClassCompact : sectionCardClass;
  const outerGap = compact ? "gap-1" : "gap-6";
  const stackGap = compact ? "gap-1" : "gap-6";
  const rowGridGap = compact ? "gap-x-1.5 gap-y-1" : "gap-x-3 gap-y-2.5";
  const headBorder = compact ? "pb-1" : "pb-3";
  const h3Cls = compact
    ? "text-start text-[11px] font-semibold text-neutral-900 dark:text-neutral-50"
    : "text-start text-sm font-semibold text-neutral-900 dark:text-neutral-50";
  const subCls = compact
    ? "mt-0.5 text-start text-[11px] text-neutral-600 dark:text-neutral-400"
    : "mt-1 text-start text-sm text-neutral-600 dark:text-neutral-400";
  const h4Cls = compact
    ? "border-b border-slate-100 pb-1 text-start text-[11px] font-semibold text-neutral-800 dark:border-neutral-800 dark:text-neutral-100"
    : "border-b border-slate-100 pb-2 text-start text-sm font-semibold text-neutral-800 dark:border-neutral-800 dark:text-neutral-100";
  const lblCls = compact
    ? "block text-[11px] font-medium text-neutral-600 dark:text-neutral-400"
    : "block text-sm font-medium text-neutral-600 dark:text-neutral-400";
  const previewBoxCls = compact
    ? "mt-0.5 flex min-h-7 items-center rounded border border-dashed border-slate-200 bg-slate-50/80 px-2 text-[11px] text-neutral-700 dark:border-neutral-600 dark:bg-neutral-900/50 dark:text-neutral-300"
    : "mt-1.5 min-h-[2.5rem] rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-600 dark:bg-neutral-900/50 dark:text-neutral-300";

  return (
    <div
      className={`flex flex-col ${outerGap}`}
      aria-labelledby="portal-form-template-heading"
    >
      <div className={`border-b border-slate-100 dark:border-neutral-800 ${headBorder}`}>
        <h3 id="portal-form-template-heading" className={h3Cls}>
          פרטי הטופס
        </h3>
        <p className={subCls}>
          מלאו את השדות לפי הסעיפים. הערכים ישולבו במסמך החתום.
        </p>
      </div>

      <div className={`flex flex-col ${stackGap}`}>
        {sections.map((section) => (
          <section
            key={section.sectionId ?? `ungrouped-${section.title}`}
            className={card}
            aria-labelledby={`portal-section-${section.sectionId ?? "general"}`}
          >
            <h4
              id={`portal-section-${section.sectionId ?? "general"}`}
              className={h4Cls}
            >
              {section.title}
            </h4>
            <div className={compact ? "mt-1 space-y-1" : "mt-4 space-y-5"}>
              {section.rows.map((row, ri) => (
                <div key={ri} className={`grid grid-cols-12 ${rowGridGap}`}>
                  {row.map((tf) => {
                    const slug = tf.definition.slug;
                    const t = normalizeCrmFieldType(tf.definition.field_type);
                    const val = values[slug] ?? "";
                    const spanClass = crmAdminColumnSpanToGrid12(
                      tf.col_span ?? tf.definition.crm_column_span
                    );
                    const filled =
                      t === "multi_select"
                        ? parseMultiSelectStoredValue(val).length > 0
                        : t === "yes_no"
                          ? isYesNoAnswered(val)
                          : val.trim().length > 0;
                    return (
                      <div
                        key={tf.id}
                        className={`min-w-0 text-start ${spanClass}`}
                      >
                        <label className={lblCls}>
                          {tf.definition.label}
                          {!preview && t !== "calculation" ? (
                            <span
                              className="ms-0.5 font-medium text-red-500 dark:text-red-400"
                              aria-hidden
                            >
                              *
                            </span>
                          ) : null}
                        </label>
                        {preview ? (
                          <p className={previewBoxCls}>
                            {t === "multi_select"
                              ? parseMultiSelectStoredValue(val).join(", ") ||
                                "—"
                              : t === "yes_no"
                                ? formatYesNoHebrewForDisplay(val) || "—"
                                : t === "date"
                                  ? (() => {
                                      const s =
                                        formatCrmDateValueForHebrewDisplay(
                                          val
                                        );
                                      return s ? (
                                        <span className="font-bold tabular-nums">
                                          {s}
                                        </span>
                                      ) : (
                                        "—"
                                      );
                                    })()
                                  : val.trim() || "—"}
                          </p>
                        ) : t === "calculation" ? (
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={val}
                            disabled={disabled}
                            dir="ltr"
                            placeholder="—"
                            aria-readonly="true"
                            className={`${ctl} cursor-default bg-slate-50 text-neutral-700 dark:bg-slate-900/40`}
                          />
                        ) : t === "number" ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            dir="ltr"
                            value={val}
                            disabled={disabled}
                            onChange={(e) =>
                              onChange(
                                slug,
                                sanitizeCrmNumberInput(e.target.value)
                              )
                            }
                            placeholder="הזינו מספר"
                            aria-invalid={!filled}
                            className={ctl}
                          />
                        ) : t === "date" ? (
                          <PortalDateField
                            value={val}
                            onChange={(v) => onChange(slug, v)}
                            disabled={disabled}
                            compact={compact}
                            requireFuture={parseCrmDateFieldConfig(
                              tf.definition.options,
                              tf.definition.label,
                              tf.definition.slug
                            ).requireFuture}
                          />
                        ) : t === "select" ? (
                          <select
                            value={val}
                            disabled={disabled}
                            onChange={(e) => onChange(slug, e.target.value)}
                            aria-invalid={!filled}
                            className={ctl}
                          >
                            <option value="">בחרו…</option>
                            {parseCrmSelectOptions(tf.definition.options).map(
                              (opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              )
                            )}
                          </select>
                        ) : t === "multi_select" ? (
                          (() => {
                            const opts = parseCrmSelectOptions(
                              tf.definition.options
                            );
                            return (
                              <ul className="mt-1.5 list-none space-y-1.5" role="group">
                                {opts.map((opt) => {
                                  const on = parseMultiSelectStoredValue(
                                    val
                                  ).includes(opt);
                                  return (
                                    <li key={opt}>
                                      <label
                                        className={
                                          compact
                                            ? "flex cursor-pointer items-center gap-1.5 text-[11px] text-neutral-800 dark:text-neutral-200"
                                            : "flex cursor-pointer items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200"
                                        }
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 shrink-0 rounded border-slate-300"
                                          disabled={disabled}
                                          checked={on}
                                          onChange={() => {
                                            const cur =
                                              parseMultiSelectStoredValue(val);
                                            const set = new Set(cur);
                                            if (set.has(opt)) {
                                              set.delete(opt);
                                            } else {
                                              set.add(opt);
                                            }
                                            const next = opts.filter((o) =>
                                              set.has(o)
                                            );
                                            onChange(
                                              slug,
                                              serializeMultiSelectValue(
                                                next,
                                                opts
                                              )
                                            );
                                          }}
                                        />
                                        {opt}
                                      </label>
                                    </li>
                                  );
                                })}
                              </ul>
                            );
                          })()
                        ) : t === "yes_no" ? (
                          <div
                            role="radiogroup"
                            className={
                              compact
                                ? "mt-1.5 flex flex-wrap gap-3"
                                : "mt-1.5 flex flex-wrap gap-4"
                            }
                            dir="rtl"
                          >
                            <label
                              className={
                                compact
                                  ? "inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-neutral-800 dark:text-neutral-200"
                                  : "inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200"
                              }
                            >
                              <input
                                type="radio"
                                className="h-4 w-4 shrink-0 border-slate-300"
                                name={`yn_${slug}`}
                                disabled={disabled}
                                checked={val === "true"}
                                onChange={() => onChange(slug, "true")}
                                aria-invalid={!filled}
                              />
                              כן
                            </label>
                            <label
                              className={
                                compact
                                  ? "inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-neutral-800 dark:text-neutral-200"
                                  : "inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200"
                              }
                            >
                              <input
                                type="radio"
                                className="h-4 w-4 shrink-0 border-slate-300"
                                name={`yn_${slug}`}
                                disabled={disabled}
                                checked={val === "false"}
                                onChange={() => onChange(slug, "false")}
                                aria-invalid={!filled}
                              />
                              לא
                            </label>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={val}
                            disabled={disabled}
                            onChange={(e) => onChange(slug, e.target.value)}
                            placeholder="הזינו טקסט"
                            aria-invalid={!filled}
                            className={ctl}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
