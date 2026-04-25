"use client";

import type { CrmLayoutSlotRow } from "@/lib/crmClientCardLayout";
import { crmAdminColumnSpanToGrid12 } from "@/lib/crmFieldLayout";
import { LayoutSection } from "@/components/admin/LayoutSection";

type SectionLite = { id: string; title: string; sort_order: number };

/**
 * Mimics the CRM card grid (sections + 12-col slots) while values load.
 */
export function ClientCardOverviewSkeleton({
  sections,
  slots,
}: {
  sections: SectionLite[];
  slots: CrmLayoutSlotRow[];
}) {
  const bySection = new Map<string, CrmLayoutSlotRow[]>();
  for (const s of slots) {
    const arr = bySection.get(s.section_id) ?? [];
    arr.push(s);
    bySection.set(s.section_id, arr);
  }

  const ordered =
    sections.length > 0
      ? [...sections].sort((a, b) => a.sort_order - b.sort_order)
      : Array.from(bySection.keys()).map((id, i) => ({
          id,
          title: "מודול",
          sort_order: 900_000 + i,
        }));

  if (ordered.length === 0) {
    return (
      <div className="animate-pulse space-y-8">
        <LayoutSection title="פרטים">
          <div className="grid grid-cols-12 gap-4">
            {[1, 2, 3].map((k) => (
              <div key={k} className="col-span-4 space-y-2">
                <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-10 w-full rounded-lg bg-slate-200/90 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        </LayoutSection>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {ordered.map((sec) => {
        const secSlots = bySection.get(sec.id) ?? [];
        const rowNums = [...new Set(secSlots.map((x) => x.row_number))].sort(
          (a, b) => a - b
        );
        const rows = rowNums.length > 0 ? rowNums : [1];
        return (
          <LayoutSection key={sec.id} title={sec.title}>
            {rows.map((rn) => (
              <div key={`${sec.id}-${rn}`} className="grid grid-cols-12 gap-4">
                {(() => {
                  const rowSlots = secSlots.filter((x) => x.row_number === rn);
                  const cells =
                    rowSlots.length > 0
                      ? rowSlots
                      : [{ column_span: 4 } as CrmLayoutSlotRow];
                  return cells.map((sl, idx) => (
                  <div
                    key={idx}
                    className={`${crmAdminColumnSpanToGrid12(
                      "column_span" in sl && sl.column_span ? sl.column_span : 4
                    )} min-w-0 animate-pulse space-y-2`}
                  >
                    <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-10 w-full rounded-lg border border-slate-200/80 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/80" />
                  </div>
                  ));
                })()}
              </div>
            ))}
          </LayoutSection>
        );
      })}
    </div>
  );
}
