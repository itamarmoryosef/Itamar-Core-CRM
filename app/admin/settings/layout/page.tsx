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
  type FormEvent,
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
  Info,
  LayoutGrid,
  Loader2,
  Minus,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { CrmLayoutDividerView } from "@/components/CrmLayoutDivider";
import { LayoutSection } from "@/components/admin/LayoutSection";
import { invalidateAdminClientGlobalCatalog } from "@/lib/adminClientGlobalCatalog";
import { supabase } from "@/lib/supabase";
import {
  crmAdminColumnSpanToGrid12,
  crmFieldTypeHebrewLabel,
  normalizeCrmFieldType,
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
  clampLayoutColumnSpan,
  layoutSlotsDirty,
  mergeLegacyBaseWithInMemoryBuilderSlots,
  moveSlotInDraft,
  newLocalSlotId,
  persistCrmLayoutSlotsBulk,
  reorderSectionRowsInDraft,
  reorderWithinRow,
} from "@/lib/crmLayoutDraft";
import { fetchCrmLayoutSlotsResilient } from "@/lib/fetchCrmLayoutSlots";
import { getLayoutSectionsTableName } from "@/lib/layoutSectionsTable";
import { useAdminSession } from "@/lib/adminSessionContext";
import {
  customFieldWordPlaceholder,
  ensureUniqueCustomFieldSlug,
  normalizeCustomFieldSlugInput,
  suggestSlugFromLabel,
} from "@/lib/customFieldsTemplate";
import type { CrmFieldType } from "@/lib/crmFieldLayout";

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

const CANVAS_FIELD_FRAME =
  "relative overflow-hidden rounded-md border border-sky-200/90 bg-sky-100/95 shadow-sm dark:border-sky-800/50 dark:bg-sky-950/30";

const CANVAS_FIELD_ACCENT =
  "pointer-events-none absolute end-0 top-0 bottom-0 z-[1] w-[3px] bg-sky-500/95";

function CanvasFieldShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={CANVAS_FIELD_FRAME}>
      <span className={CANVAS_FIELD_ACCENT} aria-hidden />
      <div className={BUILDER_CHIP_INNER}>{children}</div>
    </div>
  );
}

const canvasShellClass =
  "min-h-[min(64vh,52rem)] space-y-5 rounded-2xl border border-slate-200/60 bg-slate-100/90 px-3 py-4 shadow-inner dark:border-slate-800/50 dark:bg-neutral-950/40 sm:px-4";

/** 12-col row: full-width “slot band” (Consultants-style grid on canvas). */
const canvasRowGridClass =
  "grid min-h-[2.75rem] grid-cols-12 gap-1.5 rounded-lg border border-slate-200/80 bg-white/95 p-2 shadow-sm dark:border-slate-600/50 dark:bg-slate-900/25";

const builderAddBarBtnClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-45";

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
  onOpenInspector?: () => void;
  dragListeners?: Record<string, unknown>;
  disableDrag?: boolean;
}) {
  const {
    slot,
    busy,
    previewConfig,
    onEdit,
    onRemove,
    onOpenInspector,
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
      <button
        type="button"
        onClick={() => onOpenInspector?.()}
        className="min-w-0 flex-1 text-start"
      >
        <CrmLayoutDividerView config={previewConfig} variant="designer" />
      </button>
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

function CanvasCustomFieldChipInner(props: {
  field: CustomFieldRow;
  slot: CrmLayoutSlotRow;
  busy: boolean;
  onSelectForInspector: () => void;
  onRemoveFromLayout: () => void;
  onCycleSpan: () => void;
}) {
  const { field, slot, busy, onSelectForInspector, onRemoveFromLayout, onCycleSpan } =
    props;
  return (
    <CanvasFieldShell>
      <div className="min-w-0 flex-1 text-start text-xs">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectForInspector();
          }}
          className="block w-full truncate text-start font-medium text-sky-950 dark:text-sky-100"
        >
          {field.label?.trim() ? field.label : "שדה"}
        </button>
        <Link
          href="/admin/settings/fields"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-[9px] font-medium text-sky-700/90 underline-offset-1 hover:underline"
        >
          עריכת שדה…
        </Link>
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
    </CanvasFieldShell>
  );
}

const CanvasCustomFieldChip = memo(CanvasCustomFieldChipInner);

const CoreFieldCanvasChip = memo(function CoreFieldCanvasChipInner(props: {
  coreKey: CrmCoreFieldKey;
  busy: boolean;
  columnSpan: number;
  onSelectForInspector: () => void;
  onCycleSpan: () => void;
  onRemove: () => void;
}) {
  const { coreKey, busy, columnSpan, onSelectForInspector, onCycleSpan, onRemove } =
    props;
  return (
    <CanvasFieldShell>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectForInspector();
        }}
        className="min-w-0 flex-1 truncate text-start text-xs font-medium text-sky-950 dark:text-sky-100"
      >
        {labelForCoreKey(coreKey)}
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
    </CanvasFieldShell>
  );
});

const overlayLiftClass =
  "cursor-grabbing shadow-xl ring-2 ring-sky-400/55 dark:ring-sky-500/45";

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
        <CanvasFieldShell>
          <GripVertical className="h-3 w-3 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-sky-950 dark:text-sky-100">
            {labelForCoreKey(coreKey)}
          </div>
        </CanvasFieldShell>
      </div>
    );
  }
  if (activeId.startsWith("pal-def:")) {
    const defId = activeId.slice("pal-def:".length);
    const f = fieldById.get(defId);
    if (!f) return null;
    return (
      <div className={overlayLiftClass}>
        <CanvasFieldShell>
          <GripVertical className="h-3 w-3 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-sky-950 dark:text-sky-100">
            {f.label?.trim() ? f.label : "שדה"}
          </div>
        </CanvasFieldShell>
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
        <CanvasFieldShell>
          <GripVertical className="h-3 w-3 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-sky-950 dark:text-sky-100">
            {labelForCoreKey(ck)}
          </div>
        </CanvasFieldShell>
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
      <CanvasFieldShell>
        <GripVertical className="h-3 w-3 shrink-0 text-sky-600" />
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-sky-950 dark:text-sky-100">
          {f.label?.trim() ? f.label : "שדה"}
        </div>
      </CanvasFieldShell>
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
          ? "bg-sky-50/95 ring-2 ring-sky-300/60 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.12)] dark:bg-sky-950/30 dark:ring-sky-500/45"
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
      <div className="flex min-h-9 min-w-[6.75rem] max-w-[11rem] items-center gap-1.5 rounded-lg border border-sky-800/20 bg-sky-600 px-2.5 py-1.5 text-start text-xs font-medium text-white shadow-sm hover:bg-sky-700">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/85" />
        <span className="min-w-0 flex-1 truncate">{labelForCoreKey(coreKey)}</span>
      </div>
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
      <div className="flex min-h-9 min-w-[6.75rem] max-w-[11rem] items-center gap-1.5 rounded-lg border border-sky-800/20 bg-sky-600 px-2.5 py-1.5 text-start text-xs font-medium text-white shadow-sm hover:bg-sky-700">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/85" />
        <span className="min-w-0 flex-1 truncate">
          {field.label?.trim() ? field.label : "שדה"}
        </span>
      </div>
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

const quickAddGreenBtnClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-700/30 bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45";

const QUICK_ADDABLE_TYPES: CrmFieldType[] = [
  "text",
  "number",
  "date",
  "select",
  "calculation",
];

export default function AdminCrmLayoutBuilderPage() {
  const adminSess = useAdminSession();
  const activeOrgId = adminSess?.activeOrganization?.id?.trim() ?? null;

  const [sections, setSections] = useState<SectionRow[]>([]);
  const [fields, setFields] = useState<CustomFieldRow[]>([]);
  const [draftSlots, setDraftSlots] = useState<CrmLayoutSlotRow[]>([]);
  const [committedSlots, setCommittedSlots] = useState<CrmLayoutSlotRow[]>([]);
  const [slotsTableMissing, setSlotsTableMissing] = useState(false);
  /** `crm_layout_slots` table unavailable (or relation error) — no save / no draft persist. */
  const [slotTableFetchFailed, setSlotTableFetchFailed] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [quickAddType, setQuickAddType] = useState<CrmFieldType | null>(null);
  const [quickAddLabel, setQuickAddLabel] = useState("");
  const [quickAddOptions, setQuickAddOptions] = useState("");
  const [quickAddFormula, setQuickAddFormula] = useState("");
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const committedSlotsRef = useRef(committedSlots);
  const draftSlotsRef = useRef(draftSlots);
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

  /** `crm_layout_sections` client RLS often blocks INSERT; server uses service role. */
  const mutateCrmLayoutSection = useCallback(
    async (
      action: "create" | "rename" | "delete",
      payload: { id?: string; title?: string; sort_order?: number }
    ) => {
      if (action === "create" && payload.title != null) {
        const res = await fetch("/api/admin/crm-layout-sections", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: payload.title,
            sort_order: payload.sort_order ?? 0,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          return { error: j.error ?? "שמירה נכשלה" } as const;
        }
        return { error: null } as const;
      }
      if (action === "rename" && payload.id && payload.title != null) {
        const res = await fetch("/api/admin/crm-layout-sections", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: payload.id, title: payload.title }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          return { error: j.error ?? "שמירה נכשלה" } as const;
        }
        return { error: null } as const;
      }
      if (action === "delete" && payload.id) {
        const res = await fetch(
          `/api/admin/crm-layout-sections?id=${encodeURIComponent(
            payload.id
          )}`,
          { method: "DELETE", credentials: "include" }
        );
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          return { error: j.error ?? "מחיקה נכשלה" } as const;
        }
        return { error: null } as const;
      }
      return { error: "בקשה לא חוקית" } as const;
    },
    []
  );

  useEffect(() => {
    committedSlotsRef.current = committedSlots;
  }, [committedSlots]);
  useEffect(() => {
    draftSlotsRef.current = draftSlots;
  }, [draftSlots]);

  const loadAll = useCallback(async (opts?: { forceResetDraft?: boolean }) => {
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
    let defQ = supabase
      .from("custom_field_definitions")
      .select(
        "id, label, slug, field_type, section_id, row_number, column_span, sort_order, options, formula"
      )
      .order("row_number", { ascending: true })
      .order("sort_order", { ascending: true });
    if (activeOrgId) {
      defQ = defQ.eq("organization_id", activeOrgId);
    }
    const { data: fRows, error: fErr } = await defQ;
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
    setSlotTableFetchFailed(!!slotErr);
    setSlotsTableMissing(!!slotErr || layoutSchemaIncomplete);

    const preserveLayoutDraft =
      !opts?.forceResetDraft &&
      layoutSlotsDirty(
        committedSlotsRef.current,
        draftSlotsRef.current
      );

    if (slotErr) {
      if (preserveLayoutDraft) {
        setLoading(false);
        return;
      }
      const leg = normalizeCrmLayoutSlots(legacySlotsFromDefinitions(defs));
      const merged = mergeLegacyBaseWithInMemoryBuilderSlots(
        leg,
        draftSlotsRef.current
      );
      setDraftSlots(cloneLayoutSlots(merged));
      setCommittedSlots(cloneLayoutSlots(merged));
    } else {
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
          void loadAll({ forceResetDraft: true });
          return;
        }
        seedSlotsAttemptedRef.current = false;
        slots = legacySlotsFromDefinitions(defs);
      }
      if (preserveLayoutDraft) {
        setLoading(false);
        return;
      }
      const next = normalizeCrmLayoutSlots(
        slots.length > 0 ? slots : legacySlotsFromDefinitions(defs)
      );
      const cloned = cloneLayoutSlots(next);
      setDraftSlots(cloned);
      setCommittedSlots(cloneLayoutSlots(next));
    }

    setLoading(false);
  }, [activeOrgId]);

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
    () => layoutSlotsDirty(committedSlots, draftSlots),
    [committedSlots, draftSlots]
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

  const openQuickAdd = (t: CrmFieldType) => {
    setQuickAddType(t);
    setQuickAddLabel(
      t === "calculation"
        ? "חישוב"
        : `שדה — ${crmFieldTypeHebrewLabel(t)}`
    );
    setQuickAddOptions("");
    setQuickAddFormula("");
  };

  const handleQuickAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickAddType) return;
    if (!activeOrgId) {
      setToast({
        type: "error",
        message: "חסר ארגון. בחרו ארגון בראש המסוף.",
      });
      return;
    }
    if (slotTableFetchFailed) {
      setToast({
        type: "error",
        message: "הריצו ב-Supabase את add_crm_layout_slots.sql",
      });
      return;
    }
    if (sortedSections.length === 0) {
      setToast({
        type: "error",
        message: "הוסיפו מודול (אזור) — «מודול חדש» מעל הרשת.",
      });
      return;
    }
    const label = quickAddLabel.trim();
    if (!label) {
      setToast({ type: "error", message: "נא שם לשדה" });
      return;
    }
    if (quickAddType === "select" && !quickAddOptions.trim()) {
      setToast({ type: "error", message: "לרשימה — הזינו אפשרות בכל שורה" });
      return;
    }
    const secId = toolbarTargetSectionId ?? sortedSections[0]!.id;
    const display = getRowNumbersToDisplay(secId);
    const rowNum =
      pendingRowBySection[secId] ?? display[display.length - 1] ?? 1;
    if (!canPlaceSpanInRow(draftSlots, secId, rowNum, 4, null)) {
      setToast({
        type: "error",
        message: "השורה מלאה (עד 12 עמודות). הוסיפו שורה או צמצמו רכיבים.",
      });
      return;
    }
    const inRow = draftSlots.filter(
      (s) => s.section_id === secId && s.row_number === rowNum
    );
    const sort_order =
      inRow.length === 0
        ? 0
        : Math.max(...inRow.map((s) => s.sort_order)) + 1;
    const basis = normalizeCustomFieldSlugInput(
      suggestSlugFromLabel(label) || "field"
    );
    const slug = ensureUniqueCustomFieldSlug(
      basis && basis.length >= 2 ? basis : "field",
      allSlugsLower
    );
    const optionsLines = quickAddOptions
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const optionsPayload = quickAddType === "select" ? optionsLines : [];
    setQuickAddSaving(true);
    const field_type: CrmFieldType = quickAddType;
    const baseRow = {
      label,
      slug,
      field_type,
      section_id: secId,
      row_number: rowNum,
      column_span: 4,
      sort_order,
      options: optionsPayload,
      organization_id: activeOrgId,
    } as const;
    const insertPayload: Record<string, unknown> =
      field_type === "calculation" && quickAddFormula.trim()
        ? { ...baseRow, formula: quickAddFormula.trim() }
        : { ...baseRow, formula: null };
    let { data: newRow, error: insErr } = await supabase
      .from("custom_field_definitions")
      .insert(insertPayload)
      .select("*")
      .single();
    let usedCalculationFallback = false;
    if (insErr && field_type === "calculation") {
      const { data: d2, error: e2 } = await supabase
        .from("custom_field_definitions")
        .insert({
          ...baseRow,
          field_type: "text" as const,
          formula: null,
        })
        .select("*")
        .single();
      if (!e2) {
        newRow = d2;
        insErr = null;
        usedCalculationFallback = true;
      } else {
        newRow = null;
      }
    }
    if (insErr) {
      setQuickAddSaving(false);
      setToast({ type: "error", message: insErr.message });
      return;
    }
    if (!newRow) {
      setQuickAddSaving(false);
      return;
    }
    const asDef = newRow as CustomFieldRow;
    setFields((prev) => [...prev, asDef]);
    const newSlot: CrmLayoutSlotRow = {
      id: newLocalSlotId(),
      section_id: secId,
      row_number: rowNum,
      column_span: 4,
      sort_order,
      slot_kind: "custom",
      core_key: null,
      definition_id: asDef.id,
    };
    setDraftSlots((d) => [...d, newSlot]);
    setSelectedSlotId(newSlot.id);
    setToolbarTargetSectionId(secId);
    setQuickAddType(null);
    setQuickAddSaving(false);
    setToast({
      type: "success",
      message: usedCalculationFallback
        ? "נשמר כשדה טקסט (המסד בלי 'calculation'). " +
          `קוד שתילה: ${customFieldWordPlaceholder(slug)}`
        : `השדה הוגדר ונמוקם ברשת. קוד שתילה: ${customFieldWordPlaceholder(slug)} (מסמכים/מיזוג)`,
    });
    invalidateAdminClientGlobalCatalog();
  };

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
    let e: { message: string } | null = null;
    if (sectionsTable === "crm_layout_sections") {
      const r = await mutateCrmLayoutSection("create", {
        title,
        sort_order: next,
      });
      e = r.error ? { message: r.error } : null;
    } else {
      const { error: insErr } = await supabase
        .from(sectionsTable)
        .insert({ title, sort_order: next });
      e = insErr;
    }
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
    let e: { message: string } | null = null;
    if (sectionsTable === "crm_layout_sections") {
      const r = await mutateCrmLayoutSection("rename", { id, title: t });
      e = r.error ? { message: r.error } : null;
    } else {
      const { error: upErr } = await supabase
        .from(sectionsTable)
        .update({ title: t })
        .eq("id", id);
      e = upErr;
    }
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
    let e: { message: string } | null = null;
    if (sectionsTable === "crm_layout_sections") {
      const r = await mutateCrmLayoutSection("delete", { id: sectionId });
      e = r.error ? { message: r.error } : null;
    } else {
      const { error: delErr } = await supabase
        .from(sectionsTable)
        .delete()
        .eq("id", sectionId);
      e = delErr;
    }
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
    if (slotTableFetchFailed) {
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
    if (slotTableFetchFailed) {
      setBusy(true);
      const { error: e } = await supabase
        .from("custom_field_definitions")
        .update({
          section_id: assignSectionId,
          row_number: rowNum,
          sort_order: sr.sort_order,
          column_span: sr.column_span,
        })
        .eq("id", assignFieldId);
      setBusy(false);
      if (e) {
        setToast({ type: "error", message: e.message });
        return;
      }
    }
    setAssignFieldId(null);
    setAssignSectionId("");
    setAssignRowChoice("__new__");
  };

  const fieldById = useMemo(() => {
    const m = new Map<string, CustomFieldRow>();
    for (const f of fields) m.set(f.id, f);
    return m;
  }, [fields]);

  const allSlugsLower = useMemo(
    () => new Set(fields.map((f) => f.slug.toLowerCase())),
    [fields]
  );

  const selectedLayoutSlot = useMemo(
    () =>
      selectedSlotId
        ? draftSlots.find((s) => s.id === selectedSlotId) ?? null
        : null,
    [selectedSlotId, draftSlots]
  );

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
    if (slotTableFetchFailed || !layoutDirty) return;
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
    await loadAll({ forceResetDraft: true });
  }, [
    slotTableFetchFailed,
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

  const setSlotColumnSpan = useCallback(
    async (slot: CrmLayoutSlotRow, rawSpan: number) => {
      if (slot.id.startsWith("legacy-")) return;
      if (slot.slot_kind === "divider") return;
      const next = clampLayoutColumnSpan(rawSpan);
      setDraftSlots((d) =>
        d.map((s) => (s.id === slot.id ? { ...s, column_span: next } : s))
      );
      if (slot.definition_id) {
        setFields((prev) =>
          prev.map((f) =>
            f.id === slot.definition_id
              ? { ...f, column_span: next }
              : f
          )
        );
      }
      if (slotTableFetchFailed && slot.definition_id) {
        setBusy(true);
        const { error: e } = await supabase
          .from("custom_field_definitions")
          .update({ column_span: next })
          .eq("id", slot.definition_id);
        setBusy(false);
        if (e) setToast({ type: "error", message: e.message });
      }
    },
    [slotTableFetchFailed]
  );

  const cycleSlotSpan = async (slot: CrmLayoutSlotRow) => {
    if (slot.id.startsWith("legacy-") || slot.slot_kind === "divider")
      return;
    const c = slot.column_span;
    const n = c >= 4 ? 1 : c + 1;
    await setSlotColumnSpan(slot, n);
  };

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
    if (!opts?.skipConfirm && !window.confirm("להסיר מהלוח?")) return;
    if (selectedSlotId === slot.id) setSelectedSlotId(null);
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
      if (slotTableFetchFailed) {
        setBusy(true);
        const { error: e } = await supabase
          .from("custom_field_definitions")
          .update({
            section_id: null,
            row_number: 1,
            sort_order: 0,
            column_span: 4,
          })
          .eq("id", slot.definition_id);
        setBusy(false);
        if (e) setToast({ type: "error", message: e.message });
      }
    }
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
                              <CanvasFieldShell>
                                <div className="min-w-0 flex-1 truncate text-xs font-medium text-sky-950 dark:text-sky-100">
                                  {labelForCoreKey(sl.core_key)}
                                </div>
                              </CanvasFieldShell>
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
                            <CanvasFieldShell>
                              <div className="min-w-0 flex-1 truncate text-xs font-medium text-sky-950 dark:text-sky-100">
                                {f.label?.trim() ? f.label : "שדה"}
                              </div>
                            </CanvasFieldShell>
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
      <div className="min-h-0 flex flex-col" dir="rtl">
        <div className="min-w-0 flex-1 space-y-4">
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
              שדות ופריסת כרטיס
            </h1>
            <p className="mt-1 text-start text-[11px] text-slate-500">
              הוספת שדה: כפתורי <strong className="text-slate-600 dark:text-slate-300">+</strong> הירוקים
              — שם, קוד שתילה אוטומטי, מיקום שורה. ייבוא ממסמך /טבלה מרוכזת:{" "}
              <Link
                href="/admin/settings/fields"
                className="font-medium text-brand hover:underline"
              >
                רשימה וייבוא
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {layoutDirty && !slotTableFetchFailed ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveLayoutDraft()}
                className={`${minimalistPrimaryClass} h-9 shrink-0 font-semibold disabled:opacity-50`}
              >
                שמור שינויים
              </button>
            ) : null}
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
          <>
          <div
            className={
              previewOpen
                ? "grid gap-4 lg:grid-cols-2 lg:items-start"
                : "grid grid-cols-1 gap-4 lg:grid-cols-[1fr_16rem] lg:items-start"
            }
          >
            <div className="min-w-0">
            <div className={canvasShellClass}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="layout-new-section-title"
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
                          key={`t-${sec.id}`}
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
                                          onSelectForInspector={() => {
                                            setSelectedSlotId(sl.id);
                                            setToolbarTargetSectionId(
                                              sec.id
                                            );
                                          }}
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
                                                onOpenInspector={() => {
                                                  setSelectedSlotId(sl.id);
                                                  setToolbarTargetSectionId(
                                                    sec.id
                                                  );
                                                }}
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
                                              onOpenInspector={() => {
                                                setSelectedSlotId(sl.id);
                                                setToolbarTargetSectionId(
                                                  sec.id
                                                );
                                              }}
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
                                              onSelectForInspector={() => {
                                                setSelectedSlotId(sl.id);
                                                setToolbarTargetSectionId(
                                                  sec.id
                                                );
                                              }}
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
                                            onSelectForInspector={() => {
                                              setSelectedSlotId(sl.id);
                                              setToolbarTargetSectionId(
                                                sec.id
                                              );
                                            }}
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
                  </LayoutSection>
                );
              })}
              </div>
            </div>
            </div>

            {!previewOpen ? (
              <aside className="lg:sticky lg:top-4 h-fit w-full min-w-0 self-start rounded-2xl border border-slate-200/90 bg-white p-3 text-start shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
                <div className="mb-2 flex items-center gap-1.5 border-b border-slate-100 pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                  מאפייני רכיב
                </div>
                {selectedLayoutSlot ? (
                  <div className="space-y-3 text-start text-xs">
                    {selectedLayoutSlot.slot_kind === "core" &&
                    selectedLayoutSlot.core_key ? (
                      <>
                        <p className="text-[10px] font-medium text-slate-500">
                          {labelForCoreKey(selectedLayoutSlot.core_key)}
                        </p>
                        <p className="text-[10px] text-slate-600 dark:text-slate-400">
                          שדה מובנה. גלילת רוחב: עמודות 1–12 ברשת הכרטיס.
                        </p>
                      </>
                    ) : null}
                    {selectedLayoutSlot.slot_kind === "divider" ? (
                      <>
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          מפריד
                        </p>
                        <p className="text-[10px] text-slate-600">
                          {normalizeDividerConfig(
                            selectedLayoutSlot.divider_config
                          ).title || "ללא כותרת"}
                        </p>
                        <button
                          type="button"
                          className={`${minimalistPrimaryClass} w-full justify-center text-[10px]`}
                          onClick={() =>
                            setDividerModalSlotId(selectedLayoutSlot.id)
                          }
                        >
                          עריכת עיצוב
                        </button>
                      </>
                    ) : null}
                    {selectedLayoutSlot.slot_kind === "custom" &&
                    selectedLayoutSlot.definition_id
                      ? (() => {
                          const fd = fieldById.get(
                            selectedLayoutSlot.definition_id!
                          );
                          if (!fd) return null;
                          return (
                            <>
                              <p className="text-[10px] font-medium text-slate-500">
                                {crmFieldTypeHebrewLabel(
                                  normalizeCrmFieldType(fd.field_type)
                                )}
                              </p>
                              <p className="font-semibold text-slate-900 dark:text-slate-50">
                                {fd.label?.trim() || "שדה"}
                              </p>
                            </>
                          );
                        })()
                      : null}
                    {selectedLayoutSlot.slot_kind === "core" ||
                    selectedLayoutSlot.slot_kind === "custom" ? (
                      <label className="grid gap-1 text-[10px] font-medium text-slate-600">
                        רוחב בעמודות
                        <select
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-mono tabular-nums dark:border-slate-600 dark:bg-slate-950"
                          value={selectedLayoutSlot.column_span}
                          onChange={(e) => {
                            const n = Math.min(
                              12,
                              Math.max(1, +e.target.value)
                            );
                            void setSlotColumnSpan(selectedLayoutSlot, n);
                          }}
                        >
                          {Array.from({ length: 12 }, (_, k) => k + 1).map(
                            (c) => (
                              <option key={c} value={c}>
                                {c} / 12
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    ) : null}
                    <div className="flex items-start gap-1.5 rounded-md border border-amber-200/80 bg-amber-50/90 p-2 text-[9px] leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>
                        <strong>הרשאות צפייה/עריכה</strong> לשדה לפי תפקידים
                        (כמו «יועצים») יבואו בגרסה הבאה, תוך חיבור ל־{/* */}
                        <Link
                          className="font-medium underline"
                          href="/admin/settings/fields"
                        >
                          שדות
                        </Link>{" "}
                        והכרטיס. עד אז הכול נשלט כאן בפריסה.
                      </span>
                    </div>
                    {selectedLayoutSlot.slot_kind === "core" ? (
                      <p className="text-[9px] text-slate-500">
                        הוסר/ה את השדה מהרשת כדי להסתירו מכרטיס לקוח.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-start text-[10px] text-slate-500">
                    לחצו על <strong>שדה, מותאם או מפריד</strong> ברשת כדי לערוך
                    רוחב, עיצוב והגדרות.
                  </p>
                )}
              </aside>
            ) : null}

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

          <div
            className="mt-1 shrink-0 rounded-2xl border border-slate-200/80 bg-slate-50/95 px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/50"
            aria-label="ספריית רכיבים ופעולות"
          >
            <div className="mb-3 rounded-xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/90 to-white px-2.5 py-2.5 dark:border-emerald-800/50 dark:from-emerald-950/25 dark:to-slate-950/50">
              <p className="text-start text-[10px] font-bold leading-snug text-emerald-900 dark:text-emerald-100">
                הוספת שדה (כמו «יועצים») — הזינו שם, המזהה ל־וורד/מסמכים
                <code className="ms-0.5 rounded bg-emerald-200/50 px-1 text-[9px] dark:bg-emerald-900/50">
                  {"{custom_*}"}
                </code>{" "}
                נבנה אוטומטית, והשדה נמצא בשורה הפעילה
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_ADDABLE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={quickAddGreenBtnClass}
                    disabled={loading || busy || !activeOrgId}
                    onClick={() => openQuickAdd(t)}
                    title={crmFieldTypeHebrewLabel(t)}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {crmFieldTypeHebrewLabel(t)}
                  </button>
                ))}
                <button
                  type="button"
                  className={quickAddGreenBtnClass}
                  disabled={
                    loading ||
                    busy ||
                    slotTableFetchFailed ||
                    sortedSections.length === 0
                  }
                  onClick={() => addDividerToToolbarTarget()}
                  title="הוספת קו/כותרת — באותה שורה"
                >
                  <Minus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  מפריד
                </button>
              </div>
              {!activeOrgId ? (
                <p className="mt-1.5 text-start text-[9px] text-amber-800 dark:text-amber-200">
                  נדרש ארגון פעיל (בחירה בראש המסוף).
                </p>
              ) : null}
            </div>
            <p className="text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              ספריית שדות — גררו לרשת
            </p>
            <div className="mt-2 flex max-h-[9.5rem] flex-wrap content-start gap-2 overflow-y-auto">
              {CRM_CORE_FIELD_KEYS.map((key) => (
                <DraggablePaletteCoreChip
                  key={key}
                  coreKey={key}
                  disabled={busy}
                />
              ))}
              {unassigned.map((f) => (
                <DraggablePaletteDefChip
                  key={f.id}
                  field={f}
                  disabled={busy}
                />
              ))}
            </div>
            {unassigned.length > 0 ? (
              <section className="mt-3 space-y-2 border-t border-slate-200/60 pt-3 dark:border-slate-800">
                <p className="text-start text-[10px] text-slate-500">
                  שיוך מהיר (בלי גרירה)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unassigned.map((f) => (
                    <button
                      key={`pick-${f.id}`}
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
                      className="max-w-[12rem] cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-start text-xs text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <span className="line-clamp-1 font-medium">
                        {f.label?.trim() ? f.label : "שדה"}
                      </span>
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
                      onChange={(e) => setAssignRowChoice(e.target.value)}
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
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-700">
              <button
                type="button"
                className={builderAddBarBtnClass}
                onClick={() => {
                  const el = document.getElementById(
                    "layout-new-section-title"
                  );
                  el?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                  window.setTimeout(() => {
                    el?.focus();
                  }, 250);
                }}
                disabled={loading || busy}
              >
                <Plus className="h-4 w-4" />
                מודול חדש
              </button>
            </div>
            <p className="mt-2 text-start text-[10px] leading-relaxed text-slate-500">
              אחרי «שמור שינויים» הפריסה מוטמעת בכרטיסי הלקוחות ובפורטל; אין צורך
              בקוד הטמעה ידני.
            </p>
          </div>
          </>
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

      {quickAddType ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          dir="rtl"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="סגור"
            onClick={() => !quickAddSaving && setQuickAddType(null)}
          />
          <form
            onSubmit={handleQuickAddSubmit}
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-2xl dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                {crmFieldTypeHebrewLabel(quickAddType)}
              </h2>
              <button
                type="button"
                onClick={() => !quickAddSaving && setQuickAddType(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="grid gap-0.5 text-start">
              <span className="text-[10px] font-semibold text-slate-600">
                שם שדה (יוצר מזהה אוטומטית)
              </span>
              <input
                value={quickAddLabel}
                onChange={(e) => setQuickAddLabel(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                autoFocus
                required
              />
            </label>
            {quickAddType === "select" ? (
              <label className="mt-2 grid gap-0.5 text-start">
                <span className="text-[10px] font-semibold text-slate-600">
                  אפשרויות (שורה לכל בחירה)
                </span>
                <textarea
                  value={quickAddOptions}
                  onChange={(e) => setQuickAddOptions(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                />
              </label>
            ) : null}
            {quickAddType === "calculation" ? (
              <label className="mt-2 grid gap-0.5 text-start">
                <span className="text-[10px] font-semibold text-slate-600">
                  נוסחה
                </span>
                <input
                  value={quickAddFormula}
                  onChange={(e) => setQuickAddFormula(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs ltr text-start dark:border-slate-600 dark:bg-slate-950"
                  dir="ltr"
                />
              </label>
            ) : null}
            {quickAddLabel.trim() && suggestSlugFromLabel(quickAddLabel) ? (
              <p className="mt-2 text-[10px] text-slate-500">
                <span className="font-medium text-slate-600">קוד בכרטיס/מסמכים: </span>
                <code className="rounded bg-slate-100 px-1 font-mono text-[9px] dark:bg-slate-800">
                  {customFieldWordPlaceholder(
                    ensureUniqueCustomFieldSlug(
                      normalizeCustomFieldSlugInput(
                        suggestSlugFromLabel(quickAddLabel) || "field"
                      ) || "field",
                      allSlugsLower
                    )
                  )}
                </code>{" "}
                <button
                  type="button"
                  onClick={async () => {
                    const basis = ensureUniqueCustomFieldSlug(
                      normalizeCustomFieldSlugInput(
                        suggestSlugFromLabel(quickAddLabel) || "field"
                      ) || "field",
                      allSlugsLower
                    );
                    const t = customFieldWordPlaceholder(basis);
                    try {
                      await navigator.clipboard.writeText(t);
                    } catch {
                      window.prompt("העתקה:", t);
                    }
                  }}
                  className="ms-0.5 inline align-middle text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  <Copy className="me-0.5 inline h-3 w-3" aria-hidden />
                  העתק
                </button>{" "}
                (ייספר סופי אחרי שמירה)
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setQuickAddType(null)}
                disabled={quickAddSaving}
                className={`${minimalistBtnClass} flex-1 justify-center`}
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={quickAddSaving}
                className={`${minimalistPrimaryClass} flex-1 justify-center`}
              >
                {quickAddSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                הוסף לרשת
              </button>
            </div>
          </form>
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
