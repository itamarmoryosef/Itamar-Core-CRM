"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  Copy,
  Eye,
  GripVertical,
  LayoutGrid,
  Loader2,
  Minus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { CrmLayoutDividerView } from "@/components/CrmLayoutDivider";
import { LayoutSection } from "@/components/admin/LayoutSection";
import { invalidateAdminClientGlobalCatalog } from "@/lib/adminClientGlobalCatalog";
import { supabase } from "@/lib/supabase";
import {
  customFieldWordPlaceholder,
  ensureUniqueCustomFieldSlug,
  normalizeCustomFieldSlugInput,
  suggestSlugFromLabel,
} from "@/lib/customFieldsTemplate";
import {
  CRM_FIELD_TYPES,
  crmAdminColumnSpanToGrid12,
  normalizeCrmFieldType,
  parseCrmSelectOptions,
  type CrmFieldType,
} from "@/lib/crmFieldLayout";
import {
  CRM_CORE_FIELD_KEYS,
  coreFieldWordPlaceholder as coreLayoutWordPlaceholder,
  defaultDividerConfig,
  labelForCoreKey,
  legacySlotsFromDefinitions,
  normalizeCrmLayoutSlots,
  normalizeDividerConfig,
  type CrmCoreFieldKey,
  type CrmDividerConfig,
  type CrmDividerStyle,
  type CrmLayoutSlotRow,
} from "@/lib/crmClientCardLayout";
import {
  buildCrmLayoutSlotInsertRow,
  canPlaceSpanInRow,
  cloneLayoutSlots,
  layoutSlotsDirty,
  moveSlotInDraft,
  newLocalSlotId,
  persistCrmLayoutSlotsBulk,
  reorderSectionRowsInDraft,
  reorderWithinRow,
} from "@/lib/crmLayoutDraft";
import { fetchCrmLayoutSlotsResilient } from "@/lib/fetchCrmLayoutSlots";
import { getLayoutSectionsTableName } from "@/lib/layoutSectionsTable";

type SectionRow = {
  id: string;
  title: string;
  sort_order: number;
};

type CustomFieldRow = {
  id: string;
  label: string;
  slug: string;
  field_type: string;
  section_id: string | null;
  row_number: number;
  column_span: number;
  sort_order: number;
  options: unknown;
  formula?: string | null;
};

/** Premium framed chip — matches client card field modules. */
const BUILDER_CHIP_FRAME =
  "relative overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-950";

const BUILDER_CHIP_ACCENT =
  "pointer-events-none absolute end-0 top-0 bottom-0 z-[1] w-[3px] bg-indigo-500";

const BUILDER_CHIP_INNER =
  "relative z-0 flex min-h-9 max-h-10 min-w-0 items-center gap-1.5 py-0.5 ps-2 pe-2";

function BuilderChipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={BUILDER_CHIP_FRAME}>
      <span className={BUILDER_CHIP_ACCENT} aria-hidden />
      <div className={BUILDER_CHIP_INNER}>{children}</div>
    </div>
  );
}

const canvasShellClass =
  "min-h-[70vh] space-y-6 rounded-xl bg-slate-50 py-4 dark:bg-neutral-950/50";

/** 12-col canvas row: subtle dashed grid (no instructional copy). */
const canvasRowGridClass =
  "grid min-h-10 grid-cols-12 gap-1 rounded-lg border border-dashed border-slate-200/90 bg-slate-50/80 p-1.5 dark:border-slate-600/70 dark:bg-slate-900/30";

function rowSortId(sectionId: string, rowNum: number) {
  return `row-sort|${sectionId}|${rowNum}`;
}

function parseRowSortId(id: string): { sectionId: string; row: number } | null {
  if (!id.startsWith("row-sort|")) return null;
  const rest = id.slice("row-sort|".length);
  const lastPipe = rest.lastIndexOf("|");
  if (lastPipe < 0) return null;
  const sectionId = rest.slice(0, lastPipe);
  const row = parseInt(rest.slice(lastPipe + 1), 10);
  if (!sectionId || Number.isNaN(row)) return null;
  return { sectionId, row };
}

const minimalistBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800";

const minimalistPrimaryClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white";

function DividerDesignerChip(props: {
  slot: CrmLayoutSlotRow;
  busy: boolean;
  previewConfig: CrmDividerConfig;
  onEdit: () => void;
  onRemove: () => void;
  dragListeners?: Record<string, unknown>;
  disableDrag?: boolean;
}) {
  const {
    slot,
    busy,
    previewConfig,
    onEdit,
    onRemove,
    dragListeners,
    disableDrag,
  } = props;
  return (
    <BuilderChipShell>
      <button
        type="button"
        className="touch-none text-slate-400 disabled:opacity-40"
        disabled={busy || disableDrag || slot.id.startsWith("legacy-")}
        {...(dragListeners ?? {})}
        aria-label="גרירה"
      >
        <GripVertical className="h-3 w-3 shrink-0" />
      </button>
      <div className="min-w-0 flex-1">
        <CrmLayoutDividerView config={previewConfig} variant="designer" />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
        aria-label="עריכת מפריד"
      >
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        aria-label="הסר"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </BuilderChipShell>
  );
}

const DividerConfigModal = memo(function DividerConfigModalInner(props: {
  slot: CrmLayoutSlotRow | null;
  onClose: () => void;
  onApply: (cfg: CrmDividerConfig) => void;
}) {
  const { slot, onClose, onApply } = props;
  const base = normalizeDividerConfig(slot?.divider_config);
  const [title, setTitle] = useState(base.title);
  const [thickness, setThickness] = useState<1 | 2 | 4>(base.thickness_px);
  const [colorHex, setColorHex] = useState(base.color_hex);
  const [style, setStyle] = useState<CrmDividerStyle>(base.style);

  useEffect(() => {
    if (!slot) return;
    const n = normalizeDividerConfig(slot.divider_config);
    setTitle(n.title);
    setThickness(n.thickness_px);
    setColorHex(n.color_hex);
    setStyle(n.style);
  }, [slot?.id, slot?.divider_config]);

  if (!slot) return null;

  const draft: CrmDividerConfig = normalizeDividerConfig({
    title,
    thickness_px: thickness,
    color_hex: colorHex,
    style,
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" dir="rtl">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="divider-modal-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 text-start shadow-2xl dark:border-slate-700 dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2
            id="divider-modal-title"
            className="text-sm font-bold text-slate-900 dark:text-slate-50"
          >
            עיצוב מפריד
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-900/50">
          <CrmLayoutDividerView config={draft} variant="designer" />
        </div>
        <label className="grid gap-0.5">
          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
            כותרת
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="למשל: מסמכי חובה"
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-0.5">
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
              עובי (px)
            </span>
            <select
              value={thickness}
              onChange={(e) =>
                setThickness(Number(e.target.value) as 1 | 2 | 4)
              }
              className="h-9 rounded-md border border-slate-200 bg-white text-xs dark:border-slate-600 dark:bg-slate-900"
            >
              <option value={1}>1px</option>
              <option value={2}>2px</option>
              <option value={4}>4px</option>
            </select>
          </label>
          <label className="grid gap-0.5">
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
              סגנון
            </span>
            <select
              value={style}
              onChange={(e) =>
                setStyle(e.target.value as CrmDividerStyle)
              }
              className="h-9 rounded-md border border-slate-200 bg-white text-xs dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="solid">רציף</option>
              <option value="dashed">מקווקו</option>
              <option value="minimal">מינימליסטי (טקסט בלבד)</option>
            </select>
          </label>
        </div>
        <label className="mt-3 grid gap-0.5">
          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
            צבע
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={
                /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : "#94a3b8"
              }
              onChange={(e) => setColorHex(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-0 dark:border-slate-600"
              title="בוחר צבע"
            />
            <input
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              dir="ltr"
              placeholder="#94a3b8"
              className="h-9 min-w-[6.5rem] flex-1 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
        </label>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`${minimalistBtnClass} flex-1 justify-center`}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className={`${minimalistPrimaryClass} flex-1 justify-center`}
          >
            החלה
          </button>
        </div>
      </div>
    </div>
  );
});

function fieldTypeHebrew(t: string): string {
  switch (normalizeCrmFieldType(t)) {
    case "number":
      return "מספר";
    case "date":
      return "תאריך";
    case "select":
      return "רשימה";
    case "calculation":
      return "חישוב";
    default:
      return "טקסט";
  }
}

function emptyNewFieldDraft(): {
  label: string;
  slug: string;
  slugManual: boolean;
  field_type: CrmFieldType;
} {
  return {
    label: "",
    slug: "",
    slugManual: false,
    field_type: "text",
  };
}

function CanvasCustomFieldChipInner(props: {
  field: CustomFieldRow;
  slot: CrmLayoutSlotRow;
  busy: boolean;
  onEdit: () => void;
  onRemoveFromLayout: () => void;
  onCycleSpan: () => void;
}) {
  const { field, slot, busy, onEdit, onRemoveFromLayout, onCycleSpan } =
    props;
  return (
    <BuilderChipShell>
      <button
        type="button"
        onClick={onEdit}
        onPointerDown={(e) => e.stopPropagation()}
        className="min-w-0 flex-1 truncate text-start text-xs font-medium text-slate-800 dark:text-slate-100"
      >
        {field.label?.trim() ? field.label : "שדה"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void onCycleSpan();
        }}
        className="shrink-0 rounded border border-slate-200 bg-white px-1.5 font-mono text-[9px] text-slate-600 dark:border-slate-600"
      >
        {slot.column_span}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onRemoveFromLayout();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        aria-label="הסר מהלוח"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </BuilderChipShell>
  );
}

const CanvasCustomFieldChip = memo(CanvasCustomFieldChipInner);

const CoreFieldCanvasChip = memo(function CoreFieldCanvasChipInner(props: {
  coreKey: CrmCoreFieldKey;
  busy: boolean;
  columnSpan: number;
  onCycleSpan: () => void;
  onRemove: () => void;
}) {
  const { coreKey, busy, columnSpan, onCycleSpan, onRemove } = props;
  return (
    <BuilderChipShell>
      <div className="min-w-0 flex-1 truncate text-start text-xs font-medium text-slate-800 dark:text-slate-100">
        {labelForCoreKey(coreKey)}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void onCycleSpan();
        }}
        className="shrink-0 rounded border border-slate-200 bg-white px-1.5 font-mono text-[9px] text-slate-600 dark:border-slate-600"
      >
        {columnSpan}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        aria-label="הסר"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </BuilderChipShell>
  );
});

const overlayLiftClass =
  "cursor-grabbing shadow-xl ring-2 ring-indigo-400/50 dark:ring-indigo-500/40";

function LayoutDragOverlayContent({
  activeId,
  draftSlots,
  fieldById,
}: {
  activeId: string | null;
  draftSlots: CrmLayoutSlotRow[];
  fieldById: Map<string, CustomFieldRow>;
}) {
  if (!activeId) return null;
  if (activeId.startsWith("pal-core:")) {
    const coreKey = activeId.slice("pal-core:".length) as CrmCoreFieldKey;
    return (
      <div className={overlayLiftClass}>
        <BuilderChipShell>
          <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
            {labelForCoreKey(coreKey)}
          </div>
        </BuilderChipShell>
      </div>
    );
  }
  if (activeId.startsWith("pal-def:")) {
    const defId = activeId.slice("pal-def:".length);
    const f = fieldById.get(defId);
    if (!f) return null;
    return (
      <div className={overlayLiftClass}>
        <BuilderChipShell>
          <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
            {f.label?.trim() ? f.label : "שדה"}
          </div>
        </BuilderChipShell>
      </div>
    );
  }
  if (activeId.startsWith("row-sort|")) return null;
  const sl = draftSlots.find((s) => s.id === activeId);
  if (!sl) return null;
  if (sl.slot_kind === "core" && sl.core_key) {
    const ck = sl.core_key as CrmCoreFieldKey;
    return (
      <div className={overlayLiftClass}>
        <BuilderChipShell>
          <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
            {labelForCoreKey(ck)}
          </div>
        </BuilderChipShell>
      </div>
    );
  }
  if (sl.slot_kind === "divider") {
    return (
      <div className={`${overlayLiftClass} min-w-[12rem]`}>
        <BuilderChipShell>
          <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <CrmLayoutDividerView
              config={sl.divider_config}
              variant="designer"
            />
          </div>
        </BuilderChipShell>
      </div>
    );
  }
  const f = sl.definition_id ? fieldById.get(sl.definition_id) : undefined;
  if (!f) return null;
  return (
    <div className={overlayLiftClass}>
      <BuilderChipShell>
        <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
          {f.label?.trim() ? f.label : "שדה"}
        </div>
      </BuilderChipShell>
    </div>
  );
}

function RowDropZone({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${canvasRowGridClass} transition-[background-color,box-shadow,ring-color] duration-150 ${
        isOver
          ? "bg-indigo-50/95 ring-2 ring-indigo-400/55 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.12)] dark:bg-indigo-950/35 dark:ring-indigo-500/40"
          : ""
      }`}
    >
      {children}
    </div>
  );
}

function SortableSectionRow(props: {
  id: string;
  disabled: boolean;
  rowLabel: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.id,
    disabled: props.disabled,
    data: { kind: "row-sort" as const },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : undefined,
    zIndex: isDragging ? 3 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="min-w-0">
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          className="touch-none flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 shadow-sm hover:bg-indigo-50/80 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
          aria-label="סידור שורות"
          disabled={props.disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        {props.rowLabel}
        {props.toolbar}
      </div>
      {props.children}
    </div>
  );
}

function CanvasLegacyDraggable({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id,
    disabled: !!disabled,
    data: { kind: "canvas-legacy" as const },
  });
  return (
    <div
      ref={setNodeRef}
      className="touch-none min-h-0"
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function DraggablePaletteCoreChip({
  coreKey,
  disabled,
}: {
  coreKey: CrmCoreFieldKey;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pal-core:${coreKey}`,
    disabled,
    data: { kind: "palette-core" as const, coreKey },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? "opacity-55" : ""} cursor-grab active:cursor-grabbing`}
    >
      <BuilderChipShell>
        <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
          {labelForCoreKey(coreKey)}
        </div>
      </BuilderChipShell>
    </div>
  );
}

function DraggablePaletteDefChip({
  field,
  disabled,
}: {
  field: CustomFieldRow;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pal-def:${field.id}`,
    disabled,
    data: { kind: "palette-def" as const, definitionId: field.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? "opacity-55" : ""} cursor-grab active:cursor-grabbing`}
    >
      <BuilderChipShell>
        <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
          {field.label?.trim() ? field.label : "שדה"}
        </div>
      </BuilderChipShell>
    </div>
  );
}

/**
 * Canvas chips use `useDraggable` (not `useSortable`). Nested per-row SortableContexts
 * caused drops to "snap back" when moving between rows/sections — sortable only commits
 * reorder inside one context. Position is fully controlled by `handleDragEnd` + `draftSlots`.
 */
function CanvasSlotDraggable({
  id,
  disabled,
  gridSpanClass,
  dragHandle = "cell",
  children,
}: {
  id: string;
  disabled?: boolean;
  gridSpanClass: string;
  dragHandle?: "cell" | "children";
  children: (dragListeners: Record<string, unknown> | undefined) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled: !!disabled,
    data: { kind: "canvas-slot" as const },
  });
  const listen = !disabled ? listeners : undefined;
  return (
    <div className={`${gridSpanClass} min-h-0`}>
      <div
        ref={setNodeRef}
        className={`min-h-0 touch-none ${dragHandle === "cell" && !disabled ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-45" : ""}`}
        {...attributes}
        {...(dragHandle === "cell" ? listen : {})}
      >
        {children(
          dragHandle === "children"
            ? (listen as Record<string, unknown> | undefined)
            : undefined
        )}
      </div>
    </div>
  );
}

function syncCustomFieldRowsAfterSlotChange(
  setFields: Dispatch<SetStateAction<CustomFieldRow[]>>,
  nextSlots: CrmLayoutSlotRow[],
  sectionId: string,
  rowNum: number
) {
  const rowSlots = nextSlots.filter(
    (s) =>
      s.section_id === sectionId &&
      s.row_number === rowNum &&
      s.slot_kind === "custom" &&
      s.definition_id
  );
  if (rowSlots.length === 0) return;
  setFields((prev) =>
    prev.map((f) => {
      const sl = rowSlots.find((s) => s.definition_id === f.id);
      return sl
        ? {
            ...f,
            section_id: sl.section_id,
            row_number: sl.row_number,
            sort_order: sl.sort_order,
            column_span: sl.column_span,
          }
        : f;
    })
  );
}

function syncCustomFieldAfterSlotMove(
  setFields: Dispatch<SetStateAction<CustomFieldRow[]>>,
  moved: CrmLayoutSlotRow
) {
  if (moved.slot_kind !== "custom" || !moved.definition_id) return;
  setFields((prev) =>
    prev.map((f) =>
      f.id === moved.definition_id
        ? {
            ...f,
            section_id: moved.section_id,
            row_number: moved.row_number,
            sort_order: moved.sort_order,
            column_span: moved.column_span,
          }
        : f
    )
  );
}

function FieldCardEditor(props: {
  field: CustomFieldRow;
  busy: boolean;
  slotId: string | null;
  onRefresh: () => void;
  onToast: (t: { type: "success" | "error"; message: string }) => void;
  onClose?: () => void;
}) {
  const { field, busy, slotId, onRefresh, onToast, onClose } = props;
  const [localLabel, setLocalLabel] = useState(field.label);
  const [localSlug, setLocalSlug] = useState(field.slug);
  const [localType, setLocalType] = useState<CrmFieldType>(
    normalizeCrmFieldType(field.field_type)
  );
  const [selectOptionLines, setSelectOptionLines] = useState<string[]>(() => {
    const o = parseCrmSelectOptions(field.options);
    return o.length > 0 ? [...o] : [""];
  });
  const [localFormula, setLocalFormula] = useState(field.formula ?? "");

  useEffect(() => {
    setLocalLabel(field.label);
    setLocalSlug(field.slug);
    setLocalType(normalizeCrmFieldType(field.field_type));
    const o = parseCrmSelectOptions(field.options);
    setSelectOptionLines(o.length > 0 ? [...o] : [""]);
    setLocalFormula(field.formula ?? "");
  }, [
    field.id,
    field.label,
    field.slug,
    field.field_type,
    field.options,
    field.formula,
    field.row_number,
    field.column_span,
    field.sort_order,
  ]);

  const ph = customFieldWordPlaceholder(localSlug);

  const copyPlaceholder = async () => {
    try {
      await navigator.clipboard.writeText(ph);
      onToast({ type: "success", message: "הועתק ללוח" });
    } catch {
      onToast({ type: "error", message: "העתקה נכשלה" });
    }
  };

  const saveMeta = async () => {
    const slug = normalizeCustomFieldSlugInput(localSlug);
    if (!slug) {
      onToast({ type: "error", message: "slug לא תקין" });
      return;
    }
    const ft = localType;
    const opts =
      ft === "select"
        ? selectOptionLines.map((s) => s.trim()).filter(Boolean)
        : [];
    const formula =
      ft === "calculation" ? localFormula.trim() || null : null;
    const { error } = await supabase
      .from("custom_field_definitions")
      .update({
        label: localLabel.trim(),
        slug,
        field_type: ft,
        options: ft === "select" ? opts : [],
        formula,
      })
      .eq("id", field.id);
    if (error) {
      onToast({
        type: "error",
        message: error.code === "23505" ? "slug כבר קיים" : error.message,
      });
      return;
    }
    onToast({ type: "success", message: "נשמר" });
    onRefresh();
  };

  const setSpan = async (span: number) => {
    const s = Math.min(4, Math.max(1, span));
    const { error } = await supabase
      .from("custom_field_definitions")
      .update({ column_span: s })
      .eq("id", field.id);
    if (error) {
      onToast({ type: "error", message: error.message });
      return;
    }
    if (slotId) {
      await supabase
        .from("crm_layout_slots")
        .update({ column_span: s })
        .eq("id", slotId);
    }
    onRefresh();
  };

  const cycleSpan = async () => {
    const next = field.column_span >= 4 ? 1 : field.column_span + 1;
    await setSpan(next);
  };

  const removeField = async () => {
    if (!window.confirm("למחוק שדה זה?")) return;
    if (slotId) {
      await supabase.from("crm_layout_slots").delete().eq("id", slotId);
    } else {
      await supabase
        .from("crm_layout_slots")
        .delete()
        .eq("definition_id", field.id);
    }
    const { error } = await supabase
      .from("custom_field_definitions")
      .delete()
      .eq("id", field.id);
    if (error) {
      onToast({ type: "error", message: error.message });
      return;
    }
    onToast({ type: "success", message: "נמחק" });
    onClose?.();
    onRefresh();
  };

  return (
    <div className="flex max-h-[min(85vh,36rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex w-full shrink-0 items-center gap-2 border-b border-slate-100 px-2 py-1.5 dark:border-neutral-800">
        <div className="min-w-0 flex-1 text-start">
          <span className="block truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">
            {field.label}
          </span>
          <code
            className="mt-0.5 block max-w-full truncate text-[9px] font-normal text-slate-500 dark:text-slate-400"
            dir="ltr"
            title={ph}
          >
            {ph}
          </code>
        </div>
        <button
          type="button"
          onClick={() => void copyPlaceholder()}
          className="shrink-0 rounded p-0.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          title={`העתק ${ph}`}
        >
          <Copy className="h-3 w-3" aria-hidden />
        </button>
        <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {field.column_span}/4
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-1.5 overflow-y-auto p-2">
        <input
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          placeholder="תווית"
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        />
        <input
          value={localSlug}
          onChange={(e) => setLocalSlug(e.target.value)}
          dir="ltr"
          placeholder="slug"
          className="h-8 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        />
        <select
          value={localType}
          onChange={(e) =>
            setLocalType(normalizeCrmFieldType(e.target.value))
          }
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        >
          {CRM_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {fieldTypeHebrew(t)}
            </option>
          ))}
        </select>
        {localType === "select" ? (
          <div className="space-y-1.5 rounded-md border border-gray-200 bg-slate-50 p-2 dark:border-neutral-700">
            <p className="text-start text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
              אפשרויות
            </p>
            <ul className="max-h-28 space-y-1 overflow-y-auto">
              {selectOptionLines.map((line, i) => (
                <li key={i} className="flex gap-1">
                  <input
                    value={line}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectOptionLines((prev) => {
                        const next = [...prev];
                        next[i] = v;
                        return next;
                      });
                    }}
                    placeholder={`אפשרות ${i + 1}`}
                    className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-200 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSelectOptionLines((prev) =>
                        prev.filter((_, j) => j !== i)
                      )
                    }
                    className="shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
                    aria-label="הסר אפשרות"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() =>
                setSelectOptionLines((prev) => [...prev, ""])
              }
              className="w-full rounded-xl border border-dashed border-gray-300 bg-white/80 py-1 text-xs font-medium text-neutral-600 hover:bg-white dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"
            >
              + אפשרות
            </button>
          </div>
        ) : null}
        {localType === "calculation" ? (
          <div className="space-y-1 rounded-md border border-gray-200 bg-slate-50 p-2 dark:border-neutral-700">
            <label className="block text-start text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
              נוסחה
            </label>
            <input
              value={localFormula}
              onChange={(e) => setLocalFormula(e.target.value)}
              dir="ltr"
              placeholder="{{שדה_א}} + {{שדה_ב}}"
              className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-200 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-t border-gray-100 px-2 py-1.5 dark:border-neutral-800">
        <button
          type="button"
          disabled={busy}
          onClick={() => void cycleSpan()}
          className="rounded border border-gray-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
          title="החלף רוחב בעמודות"
        >
          רוחב ↻
        </button>
        <div className="ms-auto flex gap-0.5">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => void setSpan(n)}
              className={`h-6 w-6 rounded text-[10px] font-bold ${
                field.column_span === n
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "border border-gray-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 gap-1.5 border-t border-gray-100 px-2 py-1.5 dark:border-neutral-800">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveMeta()}
          className="flex-1 rounded-md bg-neutral-900 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          שמור
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void removeField()}
          className="rounded-md border border-red-200 px-2 py-1.5 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default function AdminCrmLayoutBuilderPage() {
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [fields, setFields] = useState<CustomFieldRow[]>([]);
  const [draftSlots, setDraftSlots] = useState<CrmLayoutSlotRow[]>([]);
  const [committedSlots, setCommittedSlots] = useState<CrmLayoutSlotRow[]>([]);
  const [slotsTableMissing, setSlotsTableMissing] = useState(false);
  const seedSlotsAttemptedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [pendingRowBySection, setPendingRowBySection] = useState<
    Record<string, number>
  >({});
  const [newFieldDraft, setNewFieldDraft] = useState<
    Record<
      string,
      {
        label: string;
        slug: string;
        slugManual: boolean;
        field_type: CrmFieldType;
      }
    >
  >({});
  const [assignFieldId, setAssignFieldId] = useState<string | null>(null);
  const [assignSectionId, setAssignSectionId] = useState<string>("");
  /** Row index as string, or `"__new__"` for a new row below existing. */
  const [assignRowChoice, setAssignRowChoice] = useState<string>("__new__");
  /** Section that receives toolbar actions (e.g. add divider). */
  const [toolbarTargetSectionId, setToolbarTargetSectionId] = useState<
    string | null
  >(null);
  const [dividerModalSlotId, setDividerModalSlotId] = useState<string | null>(
    null
  );
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sectionsTable = await getLayoutSectionsTableName(supabase);
    const { data: sRows, error: sErr } = await supabase
      .from(sectionsTable)
      .select("id, title, sort_order")
      .order("sort_order", { ascending: true });
    if (sErr) {
      setError(sErr.message);
      setLoading(false);
      return;
    }
    const { data: fRows, error: fErr } = await supabase
      .from("custom_field_definitions")
      .select(
        "id, label, slug, field_type, section_id, row_number, column_span, sort_order, options, formula"
      )
      .order("row_number", { ascending: true })
      .order("sort_order", { ascending: true });
    if (fErr) {
      setError(fErr.message);
      setLoading(false);
      return;
    }
    const defs = (fRows ?? []) as CustomFieldRow[];
    setSections((sRows ?? []) as SectionRow[]);
    setFields(defs);

    const {
      rows: slotRows,
      error: slotFetchErr,
      schemaLevel: slotsSchemaLevel,
    } = await fetchCrmLayoutSlotsResilient(supabase);

    const slotErr = slotFetchErr ? { message: slotFetchErr } : null;
    const layoutSchemaIncomplete = slotsSchemaLevel === "legacy_no_span";

    if (slotErr) {
      setSlotsTableMissing(true);
      const leg = normalizeCrmLayoutSlots(legacySlotsFromDefinitions(defs));
      setDraftSlots(cloneLayoutSlots(leg));
      setCommittedSlots(cloneLayoutSlots(leg));
    } else {
      setSlotsTableMissing(layoutSchemaIncomplete);
      let slots = slotRows;
      const placed = defs.filter((d) => d.section_id != null);
      if (
        !layoutSchemaIncomplete &&
        slots.length === 0 &&
        placed.length > 0 &&
        !seedSlotsAttemptedRef.current
      ) {
        seedSlotsAttemptedRef.current = true;
        const inserts = placed.map((d) =>
          buildCrmLayoutSlotInsertRow({
            id: "seed",
            section_id: d.section_id as string,
            row_number: d.row_number ?? 1,
            column_span: d.column_span ?? 4,
            sort_order: d.sort_order ?? 0,
            slot_kind: "custom",
            core_key: null,
            definition_id: d.id,
          })
        );
        const { error: insErr } = await supabase
          .from("crm_layout_slots")
          .insert(inserts);
        if (!insErr) {
          void loadAll();
          return;
        }
        seedSlotsAttemptedRef.current = false;
        slots = legacySlotsFromDefinitions(defs);
      }
      const next = normalizeCrmLayoutSlots(
        slots.length > 0 ? slots : legacySlotsFromDefinitions(defs)
      );
      const cloned = cloneLayoutSlots(next);
      setDraftSlots(cloned);
      setCommittedSlots(cloneLayoutSlots(next));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.sort_order - b.sort_order),
    [sections]
  );

  useEffect(() => {
    if (sortedSections.length === 0) return;
    setToolbarTargetSectionId((prev) =>
      prev && sortedSections.some((s) => s.id === prev)
        ? prev
        : sortedSections[0]!.id
    );
  }, [sortedSections]);

  const layoutDirty = useMemo(
    () =>
      !slotsTableMissing && layoutSlotsDirty(committedSlots, draftSlots),
    [slotsTableMissing, committedSlots, draftSlots]
  );

  const slottedDefIds = useMemo(() => {
    const s = new Set<string>();
    for (const sl of draftSlots) {
      if (sl.definition_id) s.add(sl.definition_id);
    }
    return s;
  }, [draftSlots]);

  const unassigned = useMemo(
    () => fields.filter((f) => !slottedDefIds.has(f.id)),
    [fields, slottedDefIds]
  );

  const existingSlugSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of fields) {
      const sl = normalizeCustomFieldSlugInput(f.slug);
      if (sl) s.add(sl);
    }
    return s;
  }, [fields]);

  const maxRowInSection = useCallback(
    (sectionId: string) => {
      const rows = draftSlots
        .filter((s) => s.section_id === sectionId)
        .map((s) => s.row_number);
      return rows.length === 0 ? 0 : Math.max(...rows);
    },
    [draftSlots]
  );

  const rowsForSection = useCallback(
    (sectionId: string) => {
      const nums = [
        ...new Set(
          draftSlots
            .filter((s) => s.section_id === sectionId)
            .map((s) => s.row_number)
        ),
      ].sort((a, b) => a - b);
      return nums;
    },
    [draftSlots]
  );

  /** Rows that exist in DB + pending empty row slots (visual containers). */
  const getRowNumbersToDisplay = useCallback(
    (sectionId: string) => {
      const fromFields = rowsForSection(sectionId);
      const pending = pendingRowBySection[sectionId];
      const set = new Set(fromFields);
      if (pending != null) set.add(pending);
      if (set.size === 0) set.add(1);
      return [...set].sort((a, b) => a - b);
    },
    [rowsForSection, pendingRowBySection]
  );

  const addSection = async () => {
    const title = newSectionTitle.trim();
    if (!title) {
      setToast({ type: "error", message: "כותרת נדרשת" });
      return;
    }
    setBusy(true);
    const next =
      sortedSections.length === 0
        ? 0
        : Math.max(...sortedSections.map((s) => s.sort_order)) + 1;
    const sectionsTable = await getLayoutSectionsTableName(supabase);
    const { error: e } = await supabase
      .from(sectionsTable)
      .insert({ title, sort_order: next });
    setBusy(false);
    if (e) {
      setToast({
        type: "error",
        message: e.message,
      });
      return;
    }
    setNewSectionTitle("");
    setToast({ type: "success", message: "סקשן נוסף" });
    void loadAll();
  };

  const renameSection = async (id: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    const sectionsTable = await getLayoutSectionsTableName(supabase);
    const { error: e } = await supabase
      .from(sectionsTable)
      .update({ title: t })
      .eq("id", id);
    setBusy(false);
    if (e) {
      setToast({ type: "error", message: e.message });
      return;
    }
    setToast({ type: "success", message: "עודכן" });
    void loadAll();
  };

  const deleteSection = async (sectionId: string) => {
    if (!window.confirm("למחוק מודול? פריטי הפריסה יימחקו; שדות מותאמים יוסרו משיוך הסקשן."))
      return;
    setBusy(true);
    const sectionsTable = await getLayoutSectionsTableName(supabase);
    const { error: e } = await supabase
      .from(sectionsTable)
      .delete()
      .eq("id", sectionId);
    setBusy(false);
    if (e) {
      setToast({ type: "error", message: e.message });
      return;
    }
    setToast({ type: "success", message: "נמחק" });
    void loadAll();
  };

  const addEmptyRow = (sectionId: string) => {
    const next = maxRowInSection(sectionId) + 1;
    setToolbarTargetSectionId(sectionId);
    setPendingRowBySection((prev) => ({ ...prev, [sectionId]: next }));
  };

  const addDividerToToolbarTarget = () => {
    if (slotsTableMissing) {
      setToast({
        type: "error",
        message: "הריצו ב-Supabase את add_crm_layout_slots.sql",
      });
      return;
    }
    const secId =
      toolbarTargetSectionId ?? sortedSections[0]?.id ?? null;
    if (!secId) {
      setToast({ type: "error", message: "הוסיפו סקשן תחילה" });
      return;
    }
    const display = getRowNumbersToDisplay(secId);
    const rowNum =
      pendingRowBySection[secId] ??
      display[display.length - 1] ??
      1;
    const inRow = draftSlots.filter(
      (s) => s.section_id === secId && s.row_number === rowNum
    );
    const sort_order =
      inRow.length === 0
        ? 0
        : Math.max(...inRow.map((s) => s.sort_order)) + 1;
    setDraftSlots((d) => [
      ...d,
      {
        id: newLocalSlotId(),
        section_id: secId,
        row_number: rowNum,
        column_span: 4,
        sort_order,
        slot_kind: "divider",
        core_key: null,
        definition_id: null,
        divider_config: defaultDividerConfig(),
      },
    ]);
    setDividerModalSlotId(null);
  };

  const addFieldToSection = async (sectionId: string) => {
    const draft = newFieldDraft[sectionId] ?? emptyNewFieldDraft();
    const label = draft.label.trim();
    if (!label) {
      setToast({ type: "error", message: "יש להזין תווית לשדה" });
      return;
    }
    const existing = new Set(existingSlugSet);
    let slug = normalizeCustomFieldSlugInput(draft.slug.trim());
    if (!slug) {
      const basis = suggestSlugFromLabel(label);
      slug = basis ? ensureUniqueCustomFieldSlug(basis, existing) : "";
    }
    if (!slug) {
      setToast({ type: "error", message: "לא ניתן ליצור מזהה שדה — נסו תווית אחרת" });
      return;
    }
    if (existing.has(slug)) {
      if (draft.slugManual) {
        setToast({
          type: "error",
          message: "ה־slug כבר קיים במערכת — שנה את המזהה או את התווית",
        });
        return;
      }
      slug = ensureUniqueCustomFieldSlug(slug, existing);
    }
    const fieldType = normalizeCrmFieldType(draft.field_type ?? "text");
    const display = getRowNumbersToDisplay(sectionId);
    const rowNum =
      pendingRowBySection[sectionId] ??
      display[display.length - 1] ??
      1;
    const inRowSlots = draftSlots.filter(
      (s) => s.section_id === sectionId && s.row_number === rowNum
    );
    const sort_order =
      inRowSlots.length === 0
        ? 0
        : Math.max(...inRowSlots.map((s) => s.sort_order)) + 1;

    setBusy(true);
    const { data: created, error: e } = await supabase
      .from("custom_field_definitions")
      .insert({
        label,
        slug,
        field_type: fieldType,
        section_id: sectionId,
        row_number: rowNum,
        column_span: 4,
        sort_order,
        options: [],
        formula: null,
      })
      .select("id")
      .single();
    if (!e && created?.id && !slotsTableMissing) {
      const { data: slotRow, error: se } = await supabase
        .from("crm_layout_slots")
        .insert(
          buildCrmLayoutSlotInsertRow({
            id: "new",
            section_id: sectionId,
            row_number: rowNum,
            column_span: 4,
            sort_order,
            slot_kind: "custom",
            core_key: null,
            definition_id: created.id,
          })
        )
        .select(
          "id, section_id, row_number, column_span, sort_order, slot_kind, core_key, definition_id"
        )
        .single();
      if (se) {
        setBusy(false);
        setToast({ type: "error", message: se.message });
        return;
      }
      if (slotRow) {
        const row = slotRow as CrmLayoutSlotRow;
        setDraftSlots((d) => (d.some((x) => x.id === row.id) ? d : [...d, row]));
        setCommittedSlots((c) =>
          c.some((x) => x.id === row.id) ? c : [...c, row]
        );
      }
      const newField: CustomFieldRow = {
        id: created.id,
        label,
        slug,
        field_type: fieldType,
        section_id: sectionId,
        row_number: rowNum,
        column_span: 4,
        sort_order,
        options: [],
        formula: null,
      };
      setFields((prev) => [...prev, newField]);
    }
    setBusy(false);
    if (e) {
      setToast({
        type: "error",
        message: e.code === "23505" ? "slug קיים" : e.message,
      });
      return;
    }
    setNewFieldDraft((p) => ({
      ...p,
      [sectionId]: emptyNewFieldDraft(),
    }));
    setToast({ type: "success", message: "השדה נוסף" });
    if (slotsTableMissing) void loadAll();
  };

  const confirmAssign = async () => {
    if (!assignFieldId || !assignSectionId) {
      setToast({ type: "error", message: "בחרו סקשן" });
      return;
    }
    let rowNum: number;
    if (assignRowChoice === "__new__") {
      rowNum = Math.max(1, maxRowInSection(assignSectionId) + 1);
    } else {
      rowNum = Math.max(1, parseInt(assignRowChoice, 10) || 1);
    }

    if (!slotsTableMissing) {
      let next = draftSlots;
      const existingSlot = next.find(
        (s) =>
          s.definition_id === assignFieldId && s.slot_kind === "custom"
      );
      if (existingSlot) {
        next = moveSlotInDraft(
          next,
          existingSlot.id,
          assignSectionId,
          rowNum,
          null
        );
      } else {
        const inRow = next.filter(
          (s) => s.section_id === assignSectionId && s.row_number === rowNum
        );
        const sort_order =
          inRow.length === 0
            ? 0
            : Math.max(...inRow.map((s) => s.sort_order)) + 1;
        next = [
          ...next,
          {
            id: newLocalSlotId(),
            section_id: assignSectionId,
            row_number: rowNum,
            column_span: 4,
            sort_order,
            slot_kind: "custom" as const,
            core_key: null,
            definition_id: assignFieldId,
          },
        ];
      }
      setDraftSlots(next);
      const sr = next.find((s) => s.definition_id === assignFieldId)!;
      setFields((prev) =>
        prev.map((f) =>
          f.id === assignFieldId
            ? {
                ...f,
                section_id: sr.section_id,
                row_number: sr.row_number,
                sort_order: sr.sort_order,
                column_span: sr.column_span,
              }
            : f
        )
      );
      setAssignFieldId(null);
      setAssignSectionId("");
      setAssignRowChoice("__new__");
      return;
    }

    const inRowSl = draftSlots.filter(
      (s) => s.section_id === assignSectionId && s.row_number === rowNum
    );
    const sort_order =
      inRowSl.length === 0
        ? 0
        : Math.max(...inRowSl.map((s) => s.sort_order)) + 1;

    setBusy(true);
    const { error: e } = await supabase
      .from("custom_field_definitions")
      .update({
        section_id: assignSectionId,
        row_number: rowNum,
        sort_order,
        column_span: 4,
      })
      .eq("id", assignFieldId);
    setBusy(false);
    if (e) {
      setToast({ type: "error", message: e.message });
      return;
    }
    setAssignFieldId(null);
    setAssignSectionId("");
    setAssignRowChoice("__new__");
    setToast({ type: "success", message: "שויך לסקשן" });
    void loadAll();
  };

  const fieldById = useMemo(() => {
    const m = new Map<string, CustomFieldRow>();
    for (const f of fields) m.set(f.id, f);
    return m;
  }, [fields]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const resolveDropTarget = useCallback(
    (
      overId: string,
      slots: CrmLayoutSlotRow[]
    ): { sectionId: string; row: number; overSlotId: string | null } | null => {
      if (overId.startsWith("row:")) {
        const rest = overId.slice("row:".length);
        const lastColon = rest.lastIndexOf(":");
        if (lastColon < 0) return null;
        const sectionId = rest.slice(0, lastColon);
        const row = parseInt(rest.slice(lastColon + 1), 10);
        if (!sectionId || Number.isNaN(row)) return null;
        return { sectionId, row, overSlotId: null };
      }
      const hit = slots.find((s) => s.id === overId);
      if (!hit) return null;
      return {
        sectionId: hit.section_id,
        row: hit.row_number,
        overSlotId: hit.id,
      };
    },
    []
  );

  const patchDividerInDraft = useCallback(
    (slotId: string, cfg: CrmDividerConfig) => {
      setDraftSlots((d) =>
        d.map((s) => (s.id === slotId ? { ...s, divider_config: cfg } : s))
      );
    },
    []
  );

  const saveLayoutDraft = useCallback(async () => {
    if (slotsTableMissing || !layoutDirty) return;
    setBusy(true);
    const res = await persistCrmLayoutSlotsBulk(
      supabase,
      committedSlots,
      draftSlots
    );
    if (res.error) {
      setToast({ type: "error", message: res.error });
      setBusy(false);
      return;
    }
    setToast({ type: "success", message: "הפריסה נשמרה" });
    setBusy(false);
    invalidateAdminClientGlobalCatalog();
    await loadAll();
  }, [
    slotsTableMissing,
    layoutDirty,
    committedSlots,
    draftSlots,
    loadAll,
  ]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      if (!over) return;
      const a = String(active.id);
      const o = String(over.id);

      if (a.startsWith("row-sort|") && o.startsWith("row-sort|")) {
        const pa = parseRowSortId(a);
        const po = parseRowSortId(o);
        if (!pa || !po || pa.sectionId !== po.sectionId) return;
        let rowRemap = new Map<number, number>();
        setDraftSlots((prev) => {
          const { next, oldToNew } = reorderSectionRowsInDraft(
            prev,
            pa.sectionId,
            pa.row,
            po.row,
            pendingRowBySection[pa.sectionId]
          );
          rowRemap = oldToNew;
          return next;
        });
        setPendingRowBySection((p) => {
          const pend = p[pa.sectionId];
          if (pend == null) return p;
          const nr = rowRemap.get(pend);
          if (nr == null || nr === pend) return p;
          return { ...p, [pa.sectionId]: nr };
        });
        return;
      }

      setDraftSlots((prev) => {
        const target = resolveDropTarget(o, prev);
        if (!target) return prev;

        if (a.startsWith("pal-core:")) {
          const coreKey = a.slice("pal-core:".length);
          const { sectionId, row, overSlotId } = target;
          if (!canPlaceSpanInRow(prev, sectionId, row, 4, null)) return prev;
          const inRow = prev.filter(
            (s) => s.section_id === sectionId && s.row_number === row
          );
          const sort_order =
            inRow.length === 0
              ? 0
              : Math.max(...inRow.map((s) => s.sort_order)) + 1;
          const newSlot: CrmLayoutSlotRow = {
            id: newLocalSlotId(),
            section_id: sectionId,
            row_number: row,
            column_span: 4,
            sort_order,
            slot_kind: "core",
            core_key: coreKey,
            definition_id: null,
          };
          let next = [...prev, newSlot];
          if (overSlotId) {
            next = moveSlotInDraft(next, newSlot.id, sectionId, row, overSlotId);
          }
          return next;
        }

        if (a.startsWith("pal-def:")) {
          const defId = a.slice("pal-def:".length);
          const { sectionId, row, overSlotId } = target;
          let next = prev;
          const ex = next.find(
            (s) => s.definition_id === defId && s.slot_kind === "custom"
          );
          if (ex) {
            const sameRow =
              ex.section_id === sectionId && ex.row_number === row;
            if (
              !sameRow &&
              !canPlaceSpanInRow(
                prev,
                sectionId,
                row,
                ex.column_span,
                null
              )
            ) {
              return prev;
            }
            next = moveSlotInDraft(next, ex.id, sectionId, row, overSlotId);
          } else {
            if (!canPlaceSpanInRow(prev, sectionId, row, 4, null))
              return prev;
            const inRow = next.filter(
              (s) => s.section_id === sectionId && s.row_number === row
            );
            const sort_order =
              inRow.length === 0
                ? 0
                : Math.max(...inRow.map((s) => s.sort_order)) + 1;
            const newSlot: CrmLayoutSlotRow = {
              id: newLocalSlotId(),
              section_id: sectionId,
              row_number: row,
              column_span: 4,
              sort_order,
              slot_kind: "custom",
              core_key: null,
              definition_id: defId,
            };
            next = [...next, newSlot];
            if (overSlotId) {
              next = moveSlotInDraft(
                next,
                newSlot.id,
                sectionId,
                row,
                overSlotId
              );
            }
          }
          const sr = next.find((s) => s.definition_id === defId);
          if (sr) {
            setFields((p) =>
              p.map((f) =>
                f.id === defId
                  ? {
                      ...f,
                      section_id: sr.section_id,
                      row_number: sr.row_number,
                      sort_order: sr.sort_order,
                      column_span: sr.column_span,
                    }
                  : f
              )
            );
          }
          return next;
        }

        if (a.startsWith("legacy-")) return prev;
        const activeSlot = prev.find((s) => s.id === a);
        if (!activeSlot) return prev;
        const overSlot = prev.find((s) => s.id === o);
        if (
          overSlot &&
          activeSlot.section_id === overSlot.section_id &&
          activeSlot.row_number === overSlot.row_number
        ) {
          const next = reorderWithinRow(
            prev,
            activeSlot.section_id,
            activeSlot.row_number,
            a,
            o
          );
          syncCustomFieldRowsAfterSlotChange(
            setFields,
            next,
            activeSlot.section_id,
            activeSlot.row_number
          );
          return next;
        }
        const crossRow =
          activeSlot.section_id !== target.sectionId ||
          activeSlot.row_number !== target.row;
        if (
          crossRow &&
          !canPlaceSpanInRow(
            prev,
            target.sectionId,
            target.row,
            activeSlot.column_span,
            null
          )
        ) {
          return prev;
        }
        const next = moveSlotInDraft(
          prev,
          a,
          target.sectionId,
          target.row,
          target.overSlotId
        );
        const movedSlot = next.find((s) => s.id === a);
        if (movedSlot) syncCustomFieldAfterSlotMove(setFields, movedSlot);
        return next;
      });
    },
    [resolveDropTarget, pendingRowBySection, setFields]
  );

  const removeLayoutSlot = async (
    slot: CrmLayoutSlotRow,
    opts?: { skipConfirm?: boolean }
  ) => {
    if (slot.id.startsWith("legacy-")) {
      setToast({
        type: "error",
        message: "הריצו ב-Supabase את add_crm_layout_slots.sql",
      });
      return;
    }
    if (!slotsTableMissing) {
      if (!opts?.skipConfirm && !window.confirm("להסיר מהלוח?")) return;
      setDraftSlots((d) => d.filter((s) => s.id !== slot.id));
      if (slot.slot_kind === "custom" && slot.definition_id) {
        setFields((prev) =>
          prev.map((f) =>
            f.id === slot.definition_id
              ? {
                  ...f,
                  section_id: null,
                  row_number: 1,
                  sort_order: 0,
                  column_span: 4,
                }
              : f
          )
        );
      }
      return;
    }
    if (!opts?.skipConfirm && !window.confirm("להסיר מהלוח?")) return;
    setBusy(true);
    await supabase.from("crm_layout_slots").delete().eq("id", slot.id);
    if (slot.slot_kind === "custom" && slot.definition_id) {
      await supabase
        .from("custom_field_definitions")
        .update({
          section_id: null,
          row_number: 1,
          sort_order: 0,
          column_span: 4,
        })
        .eq("id", slot.definition_id);
    }
    setBusy(false);
    void loadAll();
  };

  const cycleSlotSpan = async (slot: CrmLayoutSlotRow) => {
    if (slot.id.startsWith("legacy-")) return;
    if (slot.slot_kind === "divider") return;
    if (!slotsTableMissing) {
      const next = slot.column_span >= 4 ? 1 : slot.column_span + 1;
      setDraftSlots((d) =>
        d.map((s) => (s.id === slot.id ? { ...s, column_span: next } : s))
      );
      if (slot.definition_id) {
        setFields((prev) =>
          prev.map((f) =>
            f.id === slot.definition_id ? { ...f, column_span: next } : f
          )
        );
      }
      return;
    }
    const next = slot.column_span >= 4 ? 1 : slot.column_span + 1;
    setBusy(true);
    await supabase
      .from("crm_layout_slots")
      .update({ column_span: next })
      .eq("id", slot.id);
    if (slot.definition_id) {
      await supabase
        .from("custom_field_definitions")
        .update({ column_span: next })
        .eq("id", slot.definition_id);
    }
    setBusy(false);
    void loadAll();
  };

  const renderPreview = () => (
    <div className="flex flex-col gap-8">
      {sortedSections.map((sec) => {
        const secSlots = draftSlots.filter((s) => s.section_id === sec.id);
        if (secSlots.length === 0) return null;
        const rowNums = [...new Set(secSlots.map((s) => s.row_number))].sort(
          (a, b) => a - b
        );
        return (
          <LayoutSection key={sec.id} title={sec.title}>
            <div className="space-y-4">
              {rowNums.map((rn) => (
                <div
                  key={rn}
                  className={`${canvasRowGridClass} border-b-0`}
                >
                  {secSlots
                    .filter((s) => s.row_number === rn)
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((sl) => {
                      if (sl.slot_kind === "core" && sl.core_key) {
                        return (
                          <div
                            key={sl.id}
                            className={crmAdminColumnSpanToGrid12(
                              sl.column_span
                            )}
                          >
                            <div className="pointer-events-none opacity-95">
                              <BuilderChipShell>
                                <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                                  {labelForCoreKey(sl.core_key)}
                                </div>
                              </BuilderChipShell>
                            </div>
                          </div>
                        );
                      }
                      if (sl.slot_kind === "divider") {
                        return (
                          <div key={sl.id} className="col-span-12 min-w-0">
                            <CrmLayoutDividerView
                              config={sl.divider_config}
                              variant="preview"
                            />
                          </div>
                        );
                      }
                      const f = sl.definition_id
                        ? fieldById.get(sl.definition_id)
                        : undefined;
                      if (!f) return null;
                      return (
                        <div
                          key={sl.id}
                          className={crmAdminColumnSpanToGrid12(
                            sl.column_span
                          )}
                        >
                          <div className="pointer-events-none opacity-95">
                            <BuilderChipShell>
                              <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                                {f.label?.trim() ? f.label : "שדה"}
                              </div>
                            </BuilderChipShell>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </LayoutSection>
        );
      })}
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-slate-50 dark:bg-neutral-950" dir="rtl">
        <aside className="fixed top-16 z-20 hidden max-h-[calc(100dvh-5rem)] w-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-1.5 shadow-sm lg:block xl:top-20 start-3 xl:start-6 dark:border-slate-800 dark:bg-slate-950">
          <div className="space-y-1">
            {CRM_CORE_FIELD_KEYS.map((key) => (
              <DraggablePaletteCoreChip
                key={key}
                coreKey={key}
                disabled={busy}
              />
            ))}
          </div>
          {unassigned.length > 0 ? (
            <div className="mt-2 space-y-1 border-t border-slate-200/80 pt-2 dark:border-slate-800">
              {unassigned.map((f) => (
                <DraggablePaletteDefChip
                  key={f.id}
                  field={f}
                  disabled={busy}
                />
              ))}
            </div>
          ) : null}
        </aside>

      <div className="mx-auto max-w-5xl space-y-4 px-2 pb-16 pt-4 lg:pe-56 lg:ps-4">
        {toast ? (
          <div
            role="status"
            className={`fixed start-4 top-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        <header className="flex flex-col gap-2 border-b border-slate-200 pb-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin/settings"
              className="text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400"
            >
              ← הגדרות
            </Link>
            <h1 className="mt-1 text-start text-sm font-bold text-slate-900 dark:text-slate-50">
              פריסת כרטיס
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className={`${minimalistBtnClass} ${
                previewOpen
                  ? "border-slate-800 bg-slate-900 text-white shadow-md dark:border-white dark:bg-white dark:text-slate-900"
                  : ""
              }`}
            >
              <Eye className="h-4 w-4" aria-hidden />
              תצוגה מקדימה
            </button>
            <button
              type="button"
              disabled={
                loading || busy || slotsTableMissing || sortedSections.length === 0
              }
              onClick={() => void addDividerToToolbarTarget()}
              className={`${minimalistBtnClass} disabled:opacity-50`}
            >
              <Minus className="h-4 w-4" aria-hidden />
              הוסף מפריד
            </button>
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void loadAll()}
              className={`${minimalistBtnClass} disabled:opacity-50`}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <LayoutGrid className="h-4 w-4" aria-hidden />
              )}
              רענן
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            טוען…
          </div>
        ) : error ? (
          <p className="text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : (
          <div
            className={
              previewOpen ? "grid gap-4 lg:grid-cols-2 lg:items-start" : ""
            }
          >
            <div className={canvasShellClass}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  className="h-9 min-w-[10rem] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addSection()}
                  className={`${minimalistPrimaryClass} h-9 shrink-0 disabled:opacity-50`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              <div className="flex flex-col gap-8 pt-4">
              {sortedSections.map((sec) => {
                const displayRows = getRowNumbersToDisplay(sec.id);
                const draft = newFieldDraft[sec.id] ?? emptyNewFieldDraft();
                const activeRow =
                  pendingRowBySection[sec.id] ??
                  displayRows[displayRows.length - 1] ??
                  1;

                return (
                  <LayoutSection
                    key={sec.id}
                    titleBar={
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          defaultValue={sec.title}
                          key={`t-${sec.id}-${sec.title}`}
                          onBlur={(e) => {
                            if (e.target.value.trim() !== sec.title) {
                              void renameSection(sec.id, e.target.value);
                            }
                          }}
                          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-bold text-slate-900 focus:border-slate-200 focus:outline-none dark:text-slate-100"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void deleteSection(sec.id)}
                          className="shrink-0 rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-white hover:text-red-600 dark:border-slate-700"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                    }
                  >
                    <SortableContext
                      items={displayRows.map((rn) => rowSortId(sec.id, rn))}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {displayRows.map((rn) => {
                          const rowSlots = draftSlots
                            .filter(
                              (s) =>
                                s.section_id === sec.id && s.row_number === rn
                            )
                            .sort((a, b) => a.sort_order - b.sort_order);
                          const isActiveRow = activeRow === rn;
                          return (
                            <SortableSectionRow
                              key={`${sec.id}-${rn}`}
                              id={rowSortId(sec.id, rn)}
                              disabled={busy}
                              rowLabel={
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setToolbarTargetSectionId(sec.id);
                                    setPendingRowBySection((p) => ({
                                      ...p,
                                      [sec.id]: rn,
                                    }));
                                  }}
                                  className={`h-6 min-w-[1.25rem] rounded px-1 text-center text-[10px] font-mono tabular-nums ${
                                    isActiveRow
                                      ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                                      : "text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  {rn}
                                </button>
                              }
                              toolbar={
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => addEmptyRow(sec.id)}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-900"
                                >
                                  <Plus
                                    className="h-3 w-3"
                                    strokeWidth={2.5}
                                  />
                                </button>
                              }
                            >
                              <RowDropZone id={`row:${sec.id}:${rn}`}>
                                  {rowSlots.map((sl) => {
                                    const gridSpan =
                                      crmAdminColumnSpanToGrid12(
                                        sl.column_span
                                      );
                                    const allowSort =
                                      !sl.id.startsWith("legacy-");
                                    if (
                                      sl.slot_kind === "core" &&
                                      sl.core_key
                                    ) {
                                      const ck =
                                        sl.core_key as CrmCoreFieldKey;
                                      const coreChip = (
                                        <CoreFieldCanvasChip
                                          coreKey={ck}
                                          busy={busy}
                                          columnSpan={sl.column_span}
                                          onCycleSpan={() =>
                                            void cycleSlotSpan(sl)
                                          }
                                          onRemove={() =>
                                            void removeLayoutSlot(sl, {
                                              skipConfirm: true,
                                            })
                                          }
                                        />
                                      );
                                      if (!allowSort) {
                                        return (
                                          <div
                                            key={sl.id}
                                            className={`${gridSpan} min-h-0`}
                                          >
                                            <CanvasLegacyDraggable
                                              id={sl.id}
                                              disabled={busy}
                                            >
                                              {coreChip}
                                            </CanvasLegacyDraggable>
                                          </div>
                                        );
                                      }
                                      return (
                                        <CanvasSlotDraggable
                                          key={sl.id}
                                          id={sl.id}
                                          disabled={busy}
                                          gridSpanClass={gridSpan}
                                        >
                                          {() => coreChip}
                                        </CanvasSlotDraggable>
                                      );
                                    }
                                    if (sl.slot_kind === "divider") {
                                      const divCfg = normalizeDividerConfig(
                                        sl.divider_config
                                      );
                                      if (!allowSort) {
                                        return (
                                          <div
                                            key={sl.id}
                                            className="col-span-12 min-w-0"
                                          >
                                            <CanvasLegacyDraggable
                                              id={sl.id}
                                              disabled={busy}
                                            >
                                              <DividerDesignerChip
                                                slot={sl}
                                                busy={busy}
                                                previewConfig={divCfg}
                                                disableDrag
                                                onEdit={() =>
                                                  setDividerModalSlotId(
                                                    sl.id
                                                  )
                                                }
                                                onRemove={() =>
                                                  void removeLayoutSlot(sl, {
                                                    skipConfirm: true,
                                                  })
                                                }
                                              />
                                            </CanvasLegacyDraggable>
                                          </div>
                                        );
                                      }
                                      return (
                                        <CanvasSlotDraggable
                                          key={sl.id}
                                          id={sl.id}
                                          disabled={busy}
                                          gridSpanClass="col-span-12 min-w-0"
                                          dragHandle="children"
                                        >
                                          {(listeners) => (
                                            <DividerDesignerChip
                                              slot={sl}
                                              busy={busy}
                                              previewConfig={divCfg}
                                              dragListeners={listeners}
                                              onEdit={() =>
                                                setDividerModalSlotId(sl.id)
                                              }
                                              onRemove={() =>
                                                void removeLayoutSlot(sl, {
                                                  skipConfirm: true,
                                                })
                                              }
                                            />
                                          )}
                                        </CanvasSlotDraggable>
                                      );
                                    }
                                    const f = sl.definition_id
                                      ? fieldById.get(sl.definition_id)
                                      : undefined;
                                    if (!f) return null;
                                    if (!allowSort) {
                                      return (
                                        <div
                                          key={sl.id}
                                          className={`${gridSpan} min-h-0`}
                                        >
                                          <CanvasLegacyDraggable
                                            id={sl.id}
                                            disabled={busy}
                                          >
                                            <CanvasCustomFieldChip
                                              field={f}
                                              slot={sl}
                                              busy={busy}
                                              onEdit={() =>
                                                setEditingFieldId(f.id)
                                              }
                                              onRemoveFromLayout={() =>
                                                void removeLayoutSlot(sl, {
                                                  skipConfirm: true,
                                                })
                                              }
                                              onCycleSpan={() =>
                                                void cycleSlotSpan(sl)
                                              }
                                            />
                                          </CanvasLegacyDraggable>
                                        </div>
                                      );
                                    }
                                    return (
                                      <CanvasSlotDraggable
                                        key={sl.id}
                                        id={sl.id}
                                        disabled={busy}
                                        gridSpanClass={gridSpan}
                                      >
                                        {() => (
                                          <CanvasCustomFieldChip
                                            field={f}
                                            slot={sl}
                                            busy={busy}
                                            onEdit={() =>
                                              setEditingFieldId(f.id)
                                            }
                                            onRemoveFromLayout={() =>
                                              void removeLayoutSlot(sl, {
                                                skipConfirm: true,
                                              })
                                            }
                                            onCycleSpan={() =>
                                              void cycleSlotSpan(sl)
                                            }
                                          />
                                        )}
                                      </CanvasSlotDraggable>
                                    );
                                  })}
                              </RowDropZone>
                            </SortableSectionRow>
                          );
                        })}
                      </div>
                    </SortableContext>

                    <div className="flex flex-wrap items-end gap-2 border-t border-slate-200/50 pt-2 dark:border-slate-800">
                      <input
                        value={draft.label}
                        onChange={(e) => {
                          const label = e.target.value;
                          setNewFieldDraft((p) => {
                            const prev = p[sec.id] ?? emptyNewFieldDraft();
                            const next = { ...prev, label };
                            if (!prev.slugManual) {
                              const basis = suggestSlugFromLabel(label);
                              next.slug = basis
                                ? ensureUniqueCustomFieldSlug(
                                    basis,
                                    existingSlugSet
                                  )
                                : "";
                            }
                            return { ...p, [sec.id]: next };
                          });
                        }}
                        className="h-9 min-w-[8rem] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                      />
                      <select
                        value={draft.field_type}
                        onChange={(e) =>
                          setNewFieldDraft((p) => ({
                            ...p,
                            [sec.id]: {
                              ...(p[sec.id] ?? emptyNewFieldDraft()),
                              field_type: normalizeCrmFieldType(
                                e.target.value
                              ),
                            },
                          }))
                        }
                        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                      >
                        {CRM_FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {fieldTypeHebrew(t)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void addFieldToSection(sec.id)}
                        className={`${minimalistPrimaryClass} h-9 shrink-0 px-3 disabled:opacity-50`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        dir="ltr"
                        value={draft.slug}
                        onChange={(e) =>
                          setNewFieldDraft((p) => ({
                            ...p,
                            [sec.id]: {
                              ...(p[sec.id] ?? emptyNewFieldDraft()),
                              slug: e.target.value,
                              slugManual: true,
                            },
                          }))
                        }
                        className="h-9 w-full min-w-[6rem] rounded-md border border-slate-200 bg-slate-100/80 px-2 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 sm:w-36"
                      />
                    </div>
                  </LayoutSection>
                );
              })}
              </div>

              {unassigned.length > 0 ? (
                <section className="space-y-2 border-t border-slate-200/60 pt-4 dark:border-slate-800">
                  <div className="flex flex-wrap gap-1">
                    {unassigned.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          const sid = sortedSections[0]?.id ?? "";
                          setAssignFieldId(f.id);
                          setAssignSectionId(sid);
                          if (sid) {
                            const nums = getRowNumbersToDisplay(sid);
                            const pend = pendingRowBySection[sid];
                            if (pend != null && nums.includes(pend)) {
                              setAssignRowChoice(String(pend));
                            } else if (nums.length > 0) {
                              setAssignRowChoice(
                                String(nums[nums.length - 1])
                              );
                            } else {
                              setAssignRowChoice("__new__");
                            }
                          }
                        }}
                        className="max-w-[11rem] cursor-pointer border-0 bg-transparent p-0 text-start shadow-none ring-0"
                      >
                        <BuilderChipShell>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                            {f.label?.trim() ? f.label : "שדה"}
                          </span>
                        </BuilderChipShell>
                      </button>
                    ))}
                  </div>

                  {assignFieldId ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                      <select
                        value={assignSectionId}
                        onChange={(e) => {
                          const sid = e.target.value;
                          setAssignSectionId(sid);
                          if (!sid) return;
                          const nums = getRowNumbersToDisplay(sid);
                          const pend = pendingRowBySection[sid];
                          if (pend != null && nums.includes(pend)) {
                            setAssignRowChoice(String(pend));
                          } else if (nums.length > 0) {
                            setAssignRowChoice(
                              String(nums[nums.length - 1] ?? nums[0])
                            );
                          } else {
                            setAssignRowChoice("__new__");
                          }
                        }}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="">—</option>
                        {sortedSections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      <select
                        value={assignRowChoice}
                        onChange={(e) =>
                          setAssignRowChoice(e.target.value)
                        }
                        disabled={!assignSectionId}
                        className="h-8 min-w-[4rem] rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {assignSectionId
                          ? getRowNumbersToDisplay(assignSectionId).map(
                              (rn) => (
                                <option key={rn} value={String(rn)}>
                                  {rn}
                                </option>
                              )
                            )
                          : null}
                        <option value="__new__">+</option>
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void confirmAssign()}
                        className={`${minimalistPrimaryClass} h-8 px-3 text-xs`}
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignFieldId(null);
                          setAssignRowChoice("__new__");
                        }}
                        className="h-8 rounded-md border border-slate-200 px-2 text-xs dark:border-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>

            {previewOpen ? (
              <aside className="lg:sticky lg:top-6">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  תצוגה
                </div>
                {renderPreview()}
              </aside>
            ) : null}
          </div>
        )}
      </div>

      {dividerModalSlotId ? (
        <DividerConfigModal
          slot={
            draftSlots.find((s) => s.id === dividerModalSlotId) ?? null
          }
          onClose={() => setDividerModalSlotId(null)}
          onApply={(cfg) => {
            patchDividerInDraft(dividerModalSlotId, cfg);
          }}
        />
      ) : null}
      {editingFieldId ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          dir="rtl"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="סגור"
            onClick={() => setEditingFieldId(null)}
          />
          <div
            className="relative z-10 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const ef = fieldById.get(editingFieldId);
              if (!ef) return null;
              const sl = draftSlots.find(
                (s) =>
                  s.definition_id === editingFieldId &&
                  s.slot_kind === "custom"
              );
              const dbSlotId =
                sl &&
                !sl.id.startsWith("legacy-") &&
                !sl.id.startsWith("local-")
                  ? sl.id
                  : null;
              return (
                <FieldCardEditor
                  field={ef}
                  busy={busy}
                  slotId={dbSlotId}
                  onRefresh={() => void loadAll()}
                  onToast={setToast}
                  onClose={() => setEditingFieldId(null)}
                />
              );
            })()}
          </div>
        </div>
      ) : null}
      {layoutDirty && !slotsTableMissing ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[45] flex justify-center px-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLayoutDraft()}
            className={`pointer-events-auto ${minimalistPrimaryClass} rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg`}
          >
            שמור שינויים
          </button>
        </div>
      ) : null}
      <DragOverlay dropAnimation={null} style={{ cursor: "grabbing" }}>
        <LayoutDragOverlayContent
          activeId={activeDragId}
          draftSlots={draftSlots}
          fieldById={fieldById}
        />
      </DragOverlay>
    </div>
    </DndContext>
  );
}
