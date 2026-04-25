"use client";

import { Loader2 } from "lucide-react";

export type ResponsiveColumnDef<T> = {
  id: string;
  header: string;
  /** Mobile card label; default: `header` + ':' if header has no trailing colon */
  mobileLabel?: string;
  cell: (row: T) => React.ReactNode;
  thClassName?: string;
  tdClassName?: string;
};

export type ResponsiveDataTableProps<T> = {
  columns: ResponsiveColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Last column on desktop; full-width stack under md */
  actions?: (row: T) => React.ReactNode;
  /** Desktop table header for the actions column */
  actionsHeader?: string;
  actionsThClassName?: string;
  actionsTdClassName?: string;
  emptyMessage?: React.ReactNode;
  loading?: boolean;
  minTableWidth?: string;
  desktopScrollHint?: string;
  className?: string;
  tableWrapperClassName?: string;
};

function mobileLabelFor<T>(col: ResponsiveColumnDef<T>): string {
  if (col.mobileLabel) return col.mobileLabel;
  const h = col.header.trim();
  return h.endsWith(":") || h.endsWith("：") ? h : `${h}:`;
}

export function ResponsiveDataTable<T>({
  columns,
  data,
  rowKey,
  actions,
  actionsHeader = "פעולות",
  actionsThClassName = "px-2 py-0.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400",
  actionsTdClassName = "px-2 py-0.5 align-top",
  emptyMessage = "אין נתונים",
  loading = false,
  minTableWidth = "640px",
  desktopScrollHint,
  className = "",
  tableWrapperClassName = "",
}: ResponsiveDataTableProps<T>) {
  const colCount = columns.length + (actions ? 1 : 0);

  const mobileList = (
    <ul className={`space-y-1 md:hidden ${className}`} role="list">
      {loading ? (
        <li className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-6 text-sm text-slate-500 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-slate-400">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
          טוען…
        </li>
      ) : data.length === 0 ? (
        <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-6 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/30 dark:text-slate-400">
          {emptyMessage}
        </li>
      ) : (
        data.map((row) => (
          <li
            key={rowKey(row)}
            className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60"
          >
            <dl className="space-y-1 text-start text-xs">
              {columns.map((col) => (
                <div key={col.id}>
                  <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {mobileLabelFor(col)}
                  </dt>
                  <dd className={col.tdClassName ?? ""}>{col.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {actions ? (
              <div className="mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                {actions(row)}
              </div>
            ) : null}
          </li>
        ))
      )}
    </ul>
  );

  const desktopTable = (
    <div className={`hidden md:block ${className}`}>
      {desktopScrollHint ? (
        <p className="mb-2 text-start text-xs text-neutral-500 dark:text-neutral-400">
          {desktopScrollHint}
        </p>
      ) : null}
      <div
        className={`w-full overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50 ${tableWrapperClassName}`}
      >
        <table
          className="w-full border-collapse text-start text-xs"
          style={{ minWidth: minTableWidth }}
        >
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-neutral-700 dark:bg-neutral-900/70">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={
                    col.thClassName ??
                    "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400"
                  }
                >
                  {col.header}
                </th>
              ))}
              {actions ? (
                <th className={actionsThClassName}>{actionsHeader}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  <span className="inline-flex items-center gap-2">
                    <Loader2
                      className="h-5 w-5 shrink-0 animate-spin"
                      aria-hidden
                    />
                    טוען…
                  </span>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-slate-100 dark:border-slate-800/80"
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={
                        col.tdClassName ??
                        "px-2 py-0.5 text-xs leading-tight text-slate-800 dark:text-slate-200"
                      }
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                  {actions ? (
                    <td className={actionsTdClassName}>{actions(row)}</td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      {mobileList}
      {desktopTable}
    </>
  );
}
