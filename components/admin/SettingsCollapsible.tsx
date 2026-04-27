"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  id?: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

const wrap = `group rounded-2xl border border-slate-200/80 bg-white shadow-sm transition
  dark:border-zinc-800 dark:bg-zinc-900/40`;

const summaryBar =
  "flex w-full cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-start " +
  "sm:px-5 [&::-webkit-details-marker]:hidden border-b border-slate-100/90 dark:border-zinc-800 " +
  "open:border-b open:bg-slate-50/50 dark:open:bg-zinc-900/60";

/**
 * בלוק ניווט/הגדרה נפתח — אותו שפה ויזואלית כמו כרטיסי מסוף.
 */
export function SettingsCollapsible({
  id,
  title,
  subtitle,
  defaultOpen = true,
  children,
}: Props) {
  return (
    <details id={id} className={wrap} open={defaultOpen}>
      <summary className={summaryBar}>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition group-open:rotate-180 dark:border-zinc-600 dark:bg-zinc-800 dark:text-slate-300"
          aria-hidden
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </summary>
      <div className="p-4 sm:p-5">{children}</div>
    </details>
  );
}
