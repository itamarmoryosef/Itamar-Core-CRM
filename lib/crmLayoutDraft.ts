import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeCrmLayoutSlotRow,
  type CrmLayoutSlotRow,
} from "@/lib/crmClientCardLayout";

function coalesceSlotLayoutNums(s: CrmLayoutSlotRow) {
  return {
    row_number: s.row_number ?? 1,
    column_span: s.column_span ?? 4,
    sort_order: s.sort_order ?? 0,
  };
}

/**
 * REST body for `crm_layout_slots` insert. Omits `divider_config` unless
 * `slot_kind === "divider"` so DBs without that column still accept core/custom rows.
 * Sets explicit nulls for `crm_layout_slots_ref_check`.
 */
export function buildCrmLayoutSlotInsertRow(
  s: CrmLayoutSlotRow
): Record<string, unknown> {
  const n = normalizeCrmLayoutSlotRow(s);
  const nums = coalesceSlotLayoutNums(n);
  const base = {
    section_id: n.section_id,
    row_number: nums.row_number,
    column_span: nums.column_span,
    sort_order: nums.sort_order,
    slot_kind: n.slot_kind,
  };
  if (n.slot_kind === "core") {
    return {
      ...base,
      core_key: n.core_key,
      definition_id: null,
    };
  }
  if (n.slot_kind === "custom") {
    return {
      ...base,
      core_key: null,
      definition_id: n.definition_id,
    };
  }
  return {
    ...base,
    slot_kind: "divider",
    column_span: 4,
    core_key: null,
    definition_id: null,
    divider_config: n.divider_config ?? null,
  };
}

export function cloneLayoutSlots(slots: CrmLayoutSlotRow[]): CrmLayoutSlotRow[] {
  return JSON.parse(JSON.stringify(slots)) as CrmLayoutSlotRow[];
}

export function normalizeSlotsForCompare(slots: CrmLayoutSlotRow[]) {
  return [...slots]
    .map((s) => ({
      id: s.id,
      section_id: s.section_id,
      row_number: s.row_number,
      sort_order: s.sort_order,
      column_span: s.column_span,
      slot_kind: s.slot_kind,
      core_key: s.core_key,
      definition_id: s.definition_id,
      divider_config: s.divider_config ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function layoutSlotsDirty(
  a: CrmLayoutSlotRow[],
  b: CrmLayoutSlotRow[]
): boolean {
  return (
    JSON.stringify(normalizeSlotsForCompare(a)) !==
    JSON.stringify(normalizeSlotsForCompare(b))
  );
}

export function newLocalSlotId(): string {
  return `local-${crypto.randomUUID()}`;
}

/** Move or insert-active into target row before optional overSlotId. */
export function moveSlotInDraft(
  slots: CrmLayoutSlotRow[],
  activeId: string,
  targetSection: string,
  targetRow: number,
  overSlotId: string | null
): CrmLayoutSlotRow[] {
  const active = slots.find((s) => s.id === activeId);
  if (!active) return slots;
  const rest = slots.filter((s) => s.id !== activeId);
  const rowSlots = rest
    .filter(
      (s) => s.section_id === targetSection && s.row_number === targetRow
    )
    .sort((a, b) => a.sort_order - b.sort_order);
  let insertIdx = rowSlots.length;
  if (overSlotId && rowSlots.some((s) => s.id === overSlotId)) {
    insertIdx = rowSlots.findIndex((s) => s.id === overSlotId);
  }
  const moved: CrmLayoutSlotRow = {
    ...active,
    section_id: targetSection,
    row_number: targetRow,
    ...(active.slot_kind === "divider" ? { column_span: 4 } : {}),
  };
  const merged = [
    ...rowSlots.slice(0, insertIdx),
    moved,
    ...rowSlots.slice(insertIdx),
  ].map((s, i) => ({ ...s, sort_order: i }));
  const others = rest.filter(
    (s) => !(s.section_id === targetSection && s.row_number === targetRow)
  );
  return [...others, ...merged];
}

/** 12-column designer grid: sum of `column_span` per row must not exceed this. */
export const CRM_LAYOUT_GRID_COLS = 12;

export function clampLayoutColumnSpan(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.min(12, Math.max(1, Math.round(n)));
}

/** Sum of column spans in one row (optionally omit a slot id, e.g. the item being moved). */
export function rowSpanUsed(
  slots: CrmLayoutSlotRow[],
  sectionId: string,
  rowNum: number,
  omitSlotId?: string | null
): number {
  return slots
    .filter(
      (s) =>
        s.section_id === sectionId &&
        s.row_number === rowNum &&
        (omitSlotId == null || s.id !== omitSlotId)
    )
    .reduce((acc, s) => acc + clampLayoutColumnSpan(s.column_span), 0);
}

export function canPlaceSpanInRow(
  slots: CrmLayoutSlotRow[],
  sectionId: string,
  rowNum: number,
  span: number,
  omitSlotId?: string | null
): boolean {
  return (
    rowSpanUsed(slots, sectionId, rowNum, omitSlotId) +
      clampLayoutColumnSpan(span) <=
    CRM_LAYOUT_GRID_COLS
  );
}

export function reorderWithinRow(
  slots: CrmLayoutSlotRow[],
  sectionId: string,
  rowNum: number,
  activeId: string,
  overId: string
): CrmLayoutSlotRow[] {
  if (activeId === overId) return slots;
  const rowSlots = slots
    .filter((s) => s.section_id === sectionId && s.row_number === rowNum)
    .sort((a, b) => a.sort_order - b.sort_order);
  const oldIdx = rowSlots.findIndex((s) => s.id === activeId);
  const newIdx = rowSlots.findIndex((s) => s.id === overId);
  if (oldIdx < 0 || newIdx < 0) return slots;
  const nextRow = [...rowSlots];
  const [removed] = nextRow.splice(oldIdx, 1);
  nextRow.splice(newIdx, 0, removed!);
  const renumbered = nextRow.map((s, i) => ({ ...s, sort_order: i }));
  const others = slots.filter(
    (s) => !(s.section_id === sectionId && s.row_number === rowNum)
  );
  return [...others, ...renumbered];
}

/** Row numbers that exist for a section in the draft (slots + optional empty pending row). */
export function rowNumbersForSection(
  slots: CrmLayoutSlotRow[],
  sectionId: string,
  pendingRow: number | undefined
): number[] {
  const fromSlots = slots
    .filter((s) => s.section_id === sectionId)
    .map((s) => s.row_number);
  const set = new Set(fromSlots);
  if (pendingRow != null) set.add(pendingRow);
  if (set.size === 0) set.add(1);
  return [...set].sort((a, b) => a - b);
}

/**
 * Reorder rows in a section (renumbers rows to 1..n in display order).
 * Returns the new slot list and a map oldRow → newRow for syncing `pendingRowBySection`.
 */
export function reorderSectionRowsInDraft(
  slots: CrmLayoutSlotRow[],
  sectionId: string,
  activeRowNum: number,
  overRowNum: number,
  pendingRow: number | undefined
): { next: CrmLayoutSlotRow[]; oldToNew: Map<number, number> } {
  const ordered = rowNumbersForSection(slots, sectionId, pendingRow);
  const oldIdx = ordered.indexOf(activeRowNum);
  const newIdx = ordered.indexOf(overRowNum);
  if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) {
    return { next: slots, oldToNew: new Map() };
  }
  const perm = [...ordered];
  const [removed] = perm.splice(oldIdx, 1);
  perm.splice(newIdx, 0, removed!);
  const oldToNew = new Map<number, number>();
  perm.forEach((oldRn, i) => oldToNew.set(oldRn, i + 1));
  const next = slots.map((s) => {
    if (s.section_id !== sectionId) return s;
    const nr = oldToNew.get(s.row_number);
    return nr != null ? { ...s, row_number: nr } : s;
  });
  return { next, oldToNew };
}

/**
 * Persist draft layout: deletes, inserts, updates; syncs custom_field_definitions
 * for placed custom fields. Caller should refetch slots after success.
 */
export async function persistCrmLayoutSlotsBulk(
  supabase: SupabaseClient,
  committed: CrmLayoutSlotRow[],
  draft: CrmLayoutSlotRow[]
): Promise<{ error: string | null }> {
  const committedIds = new Set(committed.map((s) => s.id));
  const draftIds = new Set(draft.map((s) => s.id));

  const isPersistableId = (id: string) =>
    !id.startsWith("legacy-") && !id.startsWith("local-");

  for (const s of committed) {
    if (!isPersistableId(s.id)) continue;
    if (!draftIds.has(s.id)) {
      const { error: delErr } = await supabase
        .from("crm_layout_slots")
        .delete()
        .eq("id", s.id);
      if (delErr) return { error: delErr.message };
      if (s.slot_kind === "custom" && s.definition_id) {
        await supabase
          .from("custom_field_definitions")
          .update({
            section_id: null,
            row_number: 1,
            sort_order: 0,
            column_span: 4,
          })
          .eq("id", s.definition_id);
      }
    }
  }

  for (const s of draft) {
    if (!s.id.startsWith("local-")) continue;
    const row = buildCrmLayoutSlotInsertRow(s);
    const { error: insErr } = await supabase
      .from("crm_layout_slots")
      .insert(row);
    if (insErr) return { error: insErr.message };
    if (s.slot_kind === "custom" && s.definition_id) {
      const { error: uErr } = await supabase
        .from("custom_field_definitions")
        .update({
          section_id: s.section_id,
          row_number: s.row_number,
          sort_order: s.sort_order,
          column_span: s.column_span,
        })
        .eq("id", s.definition_id);
      if (uErr) return { error: uErr.message };
    }
  }

  for (const s of draft) {
    if (!isPersistableId(s.id)) continue;
    const c = committed.find((x) => x.id === s.id);
    if (!c) continue;
    const dividerChanged =
      s.slot_kind === "divider" &&
      JSON.stringify(c.divider_config ?? null) !==
        JSON.stringify(s.divider_config ?? null);
    const changed =
      c.section_id !== s.section_id ||
      c.row_number !== s.row_number ||
      c.sort_order !== s.sort_order ||
      c.column_span !== s.column_span ||
      dividerChanged;
    if (!changed) continue;
    const nums = coalesceSlotLayoutNums(s);
    const patch: Record<string, unknown> = {
      section_id: s.section_id,
      row_number: nums.row_number,
      sort_order: nums.sort_order,
      column_span: nums.column_span,
    };
    if (s.slot_kind === "divider") {
      patch.column_span = 4;
      patch.divider_config = s.divider_config ?? null;
    }
    const { error: upErr } = await supabase
      .from("crm_layout_slots")
      .update(patch)
      .eq("id", s.id);
    if (upErr) return { error: upErr.message };
    if (s.definition_id) {
      const { error: defErr } = await supabase
        .from("custom_field_definitions")
        .update({
          section_id: s.section_id,
          row_number: s.row_number,
          sort_order: s.sort_order,
          column_span: s.column_span,
        })
        .eq("id", s.definition_id);
      if (defErr) return { error: defErr.message };
    }
  }

  return { error: null };
}
