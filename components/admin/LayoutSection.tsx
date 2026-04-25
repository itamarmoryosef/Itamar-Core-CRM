"use client";

import type { ReactNode } from "react";

type LayoutSectionProps = {
  id?: string;
  /** Plain title (client card). */
  title?: string;
  /** Full title row (designer: editable input + actions). Overrides `title`. */
  titleBar?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Framed CRM module: white panel, slate border, shadow, title row with 3px indigo accent.
 */
export function LayoutSection({
  id,
  title,
  titleBar,
  children,
  className = "",
}: LayoutSectionProps) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden rounded-xl border border-slate-300 bg-white p-6 shadow-md dark:border-slate-600 dark:bg-slate-950 ${className}`}
    >
      <div className="relative mb-6 border-b border-slate-200 pb-4 text-start dark:border-slate-700">
        <span
          className="pointer-events-none absolute end-0 top-0 bottom-1 w-[3px] rounded-sm bg-indigo-500"
          aria-hidden
        />
        <div className="min-w-0 pe-4">
          {titleBar ?? (
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {title}
            </h2>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
