"use client";

import type { ReactNode } from "react";

const shellClass =
  "overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const sectionClass =
  "border-b border-slate-200 bg-white px-3 py-3 last:border-b-0 dark:border-slate-700 dark:bg-slate-900";

type SectionProps = {
  id?: string;
  title: string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
};

/** Yoatzim-style client card: slate-50 shell, tight white sections. */
export function AdminClientCardCanvas({ children }: { children: ReactNode }) {
  return <div className={shellClass}>{children}</div>;
}

export function AdminClientCardSection({
  id,
  title,
  description,
  headerExtra,
  children,
}: SectionProps) {
  return (
    <section id={id} className={sectionClass}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-700">
        <div className="min-w-0 text-start">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            {title}
          </h2>
          {description ? (
            <div className="mt-0.5 text-[10px] font-normal leading-snug text-slate-500 dark:text-slate-400">
              {description}
            </div>
          ) : null}
        </div>
        {headerExtra ? (
          <div className="shrink-0">{headerExtra}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
