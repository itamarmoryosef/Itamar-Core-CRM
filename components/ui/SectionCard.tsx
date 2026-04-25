"use client";

import type { ReactNode } from "react";

export type SectionCardProps = {
  title: string;
  /** For accessibility / `aria-labelledby`; defaults to slug from title */
  id?: string;
  description?: ReactNode;
  /** e.g. action buttons aligned to the title row */
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Default `h2`; use `h3` for nested cards */
  headingLevel?: "h2" | "h3";
  titleClassName?: string;
  /** Set false to omit the header divider (rare) */
  withDivider?: boolean;
  /**
   * CRM field-group card: larger title, light gray border, extra padding (profile + portal).
   */
  variant?: "default" | "fieldGroup";
};

/**
 * Yoatzim-style CRM section: white card, light border, subtle shadow, titled header with divider.
 */
export function SectionCard({
  title,
  id,
  description,
  headerExtra,
  children,
  className = "",
  bodyClassName = "",
  headingLevel = "h2",
  titleClassName = "",
  withDivider = true,
  variant = "default",
}: SectionCardProps) {
  const headingId =
    id ??
    `section-${title.replace(/\s+/g, "-").slice(0, 48)}-${headingLevel}`;
  const HeadingTag = headingLevel;
  const isFieldGroup = variant === "fieldGroup";

  const sectionShell = isFieldGroup
    ? "rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm mb-4 last:mb-0 dark:border-neutral-700 dark:bg-neutral-900"
    : "rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900";

  const headerRowClass = isFieldGroup
    ? "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-3 mb-3 dark:border-slate-800"
    : `flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between ${
        withDivider
          ? "border-b border-slate-100 pb-3 dark:border-slate-800"
          : ""
      }`;

  const titleClass = isFieldGroup
    ? `text-base font-semibold tracking-tight text-slate-800 dark:text-neutral-100 ${titleClassName}`.trim()
    : `font-semibold tracking-tight text-slate-900 dark:text-neutral-100 ${titleClassName || "text-base"}`.trim();

  const bodyTop = isFieldGroup
    ? `mt-0 ${bodyClassName}`.trim()
    : withDivider
      ? `mt-3 ${bodyClassName}`.trim()
      : `mt-0 ${bodyClassName}`.trim();

  return (
    <section
      className={`${sectionShell} ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className={headerRowClass}>
        <div className="min-w-0 flex-1 text-start">
          <HeadingTag id={headingId} className={titleClass}>
            {title}
          </HeadingTag>
          {description ? (
            <div className="mt-1 text-sm font-medium leading-relaxed text-neutral-600 dark:text-neutral-400">
              {description}
            </div>
          ) : null}
        </div>
        {headerExtra ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {headerExtra}
          </div>
        ) : null}
      </div>
      <div className={bodyTop}>{children}</div>
    </section>
  );
}
