"use client";

import {
  crmAdminColumnSpanToGrid12,
  normalizeCrmFieldType,
  parseCrmSelectOptions,
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
                    const filled = val.trim().length > 0;
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
                            {val.trim() || "—"}
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
                            dir="ltr"
                            value={val}
                            disabled={disabled}
                            onChange={(e) => onChange(slug, e.target.value)}
                            placeholder="הזינו מספר"
                            aria-invalid={!filled}
                            className={ctl}
                          />
                        ) : t === "date" ? (
                          <input
                            type="date"
                            value={val.length >= 10 ? val.slice(0, 10) : val}
                            disabled={disabled}
                            onChange={(e) => onChange(slug, e.target.value)}
                            aria-invalid={!filled}
                            className={ctl}
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
