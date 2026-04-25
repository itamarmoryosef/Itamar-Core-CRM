"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Braces,
  Calculator,
  Calendar,
  ChevronRight,
  Download,
  GripVertical,
  Hash,
  List,
  Loader2,
  Plus,
  Rows3,
  Trash2,
  Type,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getLayoutSectionsTableName } from "@/lib/layoutSectionsTable";
import { sanitizeOriginalFilenameForDb } from "@/lib/storageKey";
import {
  crmAdminColumnSpanToGrid12,
  normalizeCrmFieldType,
} from "@/lib/crmFieldLayout";
import { PortalAgreementFormGrid } from "@/components/PortalAgreementFormGrid";
import { EmbedCodesModal } from "@/components/admin/EmbedCodesModal";
import {
  groupTemplateFieldsBySectionAndRow,
  type TemplateFieldRow,
} from "@/lib/agreementFormTemplateLayout";

type AgreementTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
};

type AgreementDocxTemplateRow = {
  id: string;
  name: string;
  original_filename: string | null;
  storage_path: string;
  created_at: string;
};

type CustomDefOption = {
  id: string;
  label: string;
  slug: string;
  field_type: string;
  options?: unknown;
  formula?: unknown;
};

type TemplateFieldDb = {
  id: string;
  template_id: string;
  definition_id: string;
  row_number: number;
  col_span: number;
  sort_order: number;
  custom_field_definitions: unknown;
};

/** מעטפת קנבס + סרגל DOCX עליון */
const canvasOuter =
  "overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/50 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40";

const canvasInner = "space-y-1 p-1";

const inputClass =
  "h-7 rounded border border-slate-200 bg-white px-2 text-[11px] leading-none text-neutral-900 placeholder:text-neutral-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100";

const circleBtn =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800";

const toolbarBtn =
  "inline-flex h-7 shrink-0 cursor-pointer items-center rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-neutral-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";

function agreementDocxPublicUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from("documents-templates")
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

function FieldTypeIcon({ fieldType }: { fieldType: string }) {
  const t = normalizeCrmFieldType(fieldType);
  const cls = "h-2.5 w-2.5 shrink-0 text-slate-500 dark:text-slate-400";
  switch (t) {
    case "number":
      return <Hash className={cls} aria-hidden />;
    case "date":
      return <Calendar className={cls} aria-hidden />;
    case "select":
      return <List className={cls} aria-hidden />;
    case "calculation":
      return <Calculator className={cls} aria-hidden />;
    default:
      return <Type className={cls} aria-hidden />;
  }
}

function toTemplateFieldRows(rows: TemplateFieldDb[]): TemplateFieldRow[] {
  const out: TemplateFieldRow[] = [];
  for (const r of rows) {
    const d = r.custom_field_definitions as
      | Record<string, unknown>
      | null
      | undefined;
    if (!d) continue;
    const slugRaw = d.slug != null ? String(d.slug).trim() : "";
    if (!slugRaw) continue;
    let secRaw = (d.crm_layout_sections ?? d.custom_field_sections) as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | null
      | undefined;
    if (Array.isArray(secRaw)) {
      secRaw = (secRaw[0] as Record<string, unknown> | undefined) ?? null;
    }
    const sectionId =
      d.section_id != null && String(d.section_id).trim() !== ""
        ? String(d.section_id)
        : null;
    const sectionTitle =
      secRaw?.title != null ? String(secRaw.title) : null;
    const sectionSortOrder =
      secRaw != null && typeof secRaw === "object"
        ? Number(secRaw.sort_order) || 0
        : sectionId
          ? 0
          : 1_000_000;
    out.push({
      id: r.id,
      row_number: r.row_number,
      col_span: r.col_span,
      sort_order: r.sort_order,
      definition_id: r.definition_id,
      definition: {
        label: String(d.label ?? slugRaw),
        slug: slugRaw,
        field_type: String(d.field_type ?? "text"),
        formula:
          d.formula != null && String(d.formula).trim() !== ""
            ? String(d.formula)
            : null,
        options: d.options,
        section_id: sectionId,
        section_title: sectionTitle,
        section_sort_order: sectionSortOrder,
        crm_row_number: Number(d.row_number) || 1,
        crm_column_span: Number(d.column_span) || 4,
        crm_sort_order: Number(d.sort_order) || 0,
      },
    });
  }
  return out;
}

export default function AgreementTemplatesBuilderPage() {
  const [templates, setTemplates] = useState<AgreementTemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<CustomDefOption[]>([]);
  const [fieldRows, setFieldRows] = useState<TemplateFieldDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [embedCodesOpen, setEmbedCodesOpen] = useState(false);
  const [embedCopiedHint, setEmbedCopiedHint] = useState(false);

  const [agreementDocxList, setAgreementDocxList] = useState<
    AgreementDocxTemplateRow[]
  >([]);
  const [docxLoading, setDocxLoading] = useState(true);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [docxBusy, setDocxBusy] = useState(false);
  const [docxMsg, setDocxMsg] = useState<string | null>(null);

  const [addFieldDefId, setAddFieldDefId] = useState("");
  const [addFieldRow, setAddFieldRow] = useState(1);
  const [addFieldSpan, setAddFieldSpan] = useState(4);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!embedCopiedHint) return;
    const t = window.setTimeout(() => setEmbedCopiedHint(false), 1600);
    return () => window.clearTimeout(t);
  }, [embedCopiedHint]);

  const loadAgreementDocx = useCallback(async () => {
    setDocxLoading(true);
    setDocxError(null);
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, original_filename, storage_path, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setDocxLoading(false);
    if (error) {
      setAgreementDocxList([]);
      setDocxError(error.message);
      return;
    }
    const rows = (data ?? []) as AgreementDocxTemplateRow[];
    setAgreementDocxList(rows.filter((r) => r.storage_path?.trim()));
  }, []);

  useEffect(() => {
    void loadAgreementDocx();
  }, [loadAgreementDocx]);

  const handleDocxUpload = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".docx")) {
        setDocxMsg("יש להעלות קובץ ‎.docx בלבד.");
        return;
      }
      setDocxMsg(null);
      setDocxBusy(true);
      await supabase.from("templates").update({ is_active: false }).eq("is_active", true);
      const path = `active/${crypto.randomUUID()}.docx`;
      const { error: upErr } = await supabase.storage
        .from("documents-templates")
        .upload(path, file, {
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: false,
        });
      if (upErr) {
        setDocxMsg(
          `העלאה נכשלה: ${upErr.message}. ודאו שקיים באקט׳ documents-templates.`
        );
        setDocxBusy(false);
        return;
      }
      const safeOriginal = sanitizeOriginalFilenameForDb(file.name).replace(
        /\s+/g,
        "_"
      );
      const withExt =
        safeOriginal.toLowerCase().endsWith(".docx") && safeOriginal.length > 0
          ? safeOriginal
          : safeOriginal
            ? `${safeOriginal.replace(/\.docx$/i, "")}.docx`
            : "";
      const templateName = withExt || "תבנית הסכם פעילה.docx";
      const { error: insErr } = await supabase.from("templates").insert({
        name: templateName,
        storage_path: path,
        original_filename: templateName,
        is_active: true,
      });
      setDocxBusy(false);
      if (insErr) {
        setDocxMsg(`שמירת רשומה נכשלה: ${insErr.message}`);
        return;
      }
      setDocxMsg("הקובץ הועלה בהצלחה.");
      void loadAgreementDocx();
    },
    [loadAgreementDocx]
  );

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("signature_templates")
      .select("id, title, description, created_at")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      setLoadError(error.message);
      setTemplates([]);
      return;
    }
    const list = (data ?? []) as AgreementTemplateRow[];
    setTemplates(list);
    setSelectedId((prev) =>
      prev == null && list.length > 0 ? list[0]!.id : prev
    );
  }, []);

  const loadDefinitions = useCallback(async () => {
    const { data, error } = await supabase
      .from("custom_field_definitions")
      .select("id, label, slug, field_type, options, formula")
      .order("label", { ascending: true });
    if (error) {
      setDefinitions([]);
      return;
    }
    setDefinitions((data ?? []) as CustomDefOption[]);
  }, []);

  useEffect(() => {
    void loadTemplates();
    void loadDefinitions();
  }, [loadTemplates, loadDefinitions]);

  const loadFields = useCallback(async (templateId: string) => {
    setFieldsLoading(true);
    const secTable = await getLayoutSectionsTableName(supabase);
    const base =
      "id, template_id, definition_id, row_number, col_span, sort_order, custom_field_definitions (id, label, slug, field_type, options, formula, section_id, row_number, column_span, sort_order, ";
    const q =
      secTable === "crm_layout_sections"
        ? supabase
            .from("signature_template_fields")
            .select(`${base}crm_layout_sections ( title, sort_order ))`)
        : supabase
            .from("signature_template_fields")
            .select(`${base}custom_field_sections ( title, sort_order ))`);
    const { data, error } = await q
      .eq("template_id", templateId)
      .order("row_number", { ascending: true })
      .order("sort_order", { ascending: true });
    setFieldsLoading(false);
    if (error) {
      setFieldRows([]);
      setToast({ type: "error", message: error.message });
      return;
    }
    const raw = (data ?? []) as Record<string, unknown>[];
    const normalized: TemplateFieldDb[] = raw.map((r) => {
      let def: unknown = r.custom_field_definitions;
      if (Array.isArray(def)) {
        def = def[0] ?? null;
      }
      return {
        id: String(r.id),
        template_id: String(r.template_id),
        definition_id: String(r.definition_id),
        row_number: Number(r.row_number) || 1,
        col_span: Number(r.col_span) || 4,
        sort_order: Number(r.sort_order) || 0,
        custom_field_definitions: def ?? null,
      };
    });
    setFieldRows(normalized);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setFieldRows([]);
      return;
    }
    void loadFields(selectedId);
  }, [selectedId, loadFields]);

  const templateFieldRows = useMemo(
    () => toTemplateFieldRows(fieldRows),
    [fieldRows]
  );

  const sectionBlocks = useMemo(
    () => groupTemplateFieldsBySectionAndRow(templateFieldRows),
    [templateFieldRows]
  );

  const maxRow = useMemo(() => {
    if (fieldRows.length === 0) return 1;
    return Math.max(...fieldRows.map((r) => r.row_number), 1);
  }, [fieldRows]);

  const handleCreateTemplate = async () => {
    const title = newTitle.trim();
    if (!title) {
      setToast({ type: "error", message: "יש להזין כותרת." });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("signature_templates")
      .insert({
        title,
        description: newDesc.trim() || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    setNewTitle("");
    setNewDesc("");
    const id = (data as { id: string }).id;
    setSelectedId(id);
    await loadTemplates();
    setToast({ type: "success", message: "התבנית נוצרה." });
  };

  const handleAddField = async () => {
    if (!selectedId || !addFieldDefId) {
      setToast({ type: "error", message: "בחרו שדה מהרשימה." });
      return;
    }
    setBusy(true);
    const nextSort =
      fieldRows.filter((r) => r.row_number === addFieldRow).length;
    const { error } = await supabase.from("signature_template_fields").insert({
      template_id: selectedId,
      definition_id: addFieldDefId,
      row_number: addFieldRow,
      col_span: addFieldSpan,
      sort_order: nextSort,
    });
    setBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    await loadFields(selectedId);
    setToast({ type: "success", message: "השדה נוסף לשורה." });
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!selectedId) return;
    setBusy(true);
    const { error } = await supabase
      .from("signature_template_fields")
      .delete()
      .eq("id", fieldId);
    setBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    await loadFields(selectedId);
  };

  const handleUpdateSpan = async (fieldId: string, colSpan: number) => {
    if (!selectedId) return;
    setBusy(true);
    const { error } = await supabase
      .from("signature_template_fields")
      .update({ col_span: colSpan })
      .eq("id", fieldId);
    setBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    await loadFields(selectedId);
  };

  const handleAddRow = () => {
    setAddFieldRow(maxRow + 1);
    setToast({
      type: "success",
      message: `שורה ${maxRow + 1} — בחרו שדה והוסיפו.`,
    });
  };

  const previewValues: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of templateFieldRows) {
      m[r.definition.slug] = "";
    }
    return m;
  }, [templateFieldRows]);

  const activeDocx = agreementDocxList[0];
  const currentDocxFilename =
    activeDocx?.original_filename?.trim() ||
    activeDocx?.name?.trim() ||
    null;

  return (
    <div className="relative mx-auto max-w-7xl space-y-3 pb-10 sm:px-0">
      <button
        type="button"
        onClick={() => setEmbedCodesOpen(true)}
        className="fixed end-4 top-20 z-[45] inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 md:top-16"
        title="קודים להטמעה"
      >
        <Braces className="h-3.5 w-3.5 opacity-70" aria-hidden />
        <span className="hidden sm:inline">קודים</span>
      </button>

      {toast ? (
        <div
          role="status"
          className={`fixed start-4 top-4 z-50 max-w-sm rounded-xl px-3 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <nav className="text-start text-[11px] text-neutral-500 dark:text-neutral-400">
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 hover:underline dark:text-slate-300"
        >
          <ChevronRight className="h-3 w-3 rotate-180" aria-hidden />
          חזרה להגדרות
        </Link>
      </nav>

      <header className="border-b border-slate-200/80 pb-1 dark:border-neutral-800">
        <div className="flex items-center gap-1">
          <Rows3
            className="h-3 w-3 shrink-0 text-slate-500 dark:text-neutral-400"
            aria-hidden
          />
          <h1 className="text-start text-xs font-semibold text-neutral-900 dark:text-neutral-50">
            בונה תבניות חתימה
          </h1>
        </div>
        <p className="mt-0.5 text-start text-[11px] text-neutral-600 dark:text-neutral-400">
          קנבס קומפקטי לפי סעיפי CRM. רשת ויזואלית 4×3 (12 עמודות).
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : loadError ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          {loadError}
          <span className="mt-2 block text-sm text-neutral-600 dark:text-neutral-400">
            הריצו ב-Supabase את{" "}
            <code className="rounded-lg bg-slate-100 px-1 dark:bg-neutral-800">
              add_signature_templates.sql
            </code>
            .
          </span>
        </p>
      ) : (
        <div className={canvasOuter}>
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-4 py-2 dark:border-neutral-700">
              <label
                htmlFor="agreement-docx-upload"
                className={`${toolbarBtn} cursor-pointer ${docxBusy ? "pointer-events-none opacity-50" : ""}`}
              >
                בחר קובץ
              </label>
              <input
                id="agreement-docx-upload"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                disabled={docxBusy}
                onChange={(e) => {
                  void handleDocxUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <span className="min-w-0 flex-1 text-[11px] leading-tight text-neutral-600 dark:text-neutral-400">
                {docxLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                    טוען…
                  </span>
                ) : docxError ? (
                  <span className="text-red-600">{docxError}</span>
                ) : currentDocxFilename ? (
                  <>
                    קובץ נוכחי:{" "}
                    <span
                      className="font-medium text-neutral-800 dark:text-neutral-200"
                      title={currentDocxFilename}
                    >
                      {currentDocxFilename}
                    </span>
                  </>
                ) : (
                  "לא נבחר מסמך"
                )}
              </span>
              {activeDocx && !docxLoading && !docxError ? (
                <a
                  href={agreementDocxPublicUrl(activeDocx.storage_path)}
                  download={
                    activeDocx.original_filename?.trim() ||
                    activeDocx.name ||
                    "template.docx"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800"
                  title="הורד תבנית"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                </a>
              ) : null}
              {docxMsg ? (
                <span className="max-w-full text-[11px] text-emerald-700 dark:text-emerald-300">
                  {docxMsg}
                </span>
              ) : null}
              <Link
                href="/admin/settings"
                className="ms-auto shrink-0 text-[11px] text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 dark:text-slate-400"
              >
                הגדרות מסמכים
              </Link>
            </div>

            <div className={canvasInner}>
            <div className="flex flex-wrap items-end gap-1 px-0.5 pt-0.5">
              <div className="min-w-[8rem] flex-1">
                <span className="mb-0.5 block text-[11px] text-neutral-500">תבנית</span>
                <select
                  value={selectedId ?? ""}
                  onChange={(e) =>
                    setSelectedId(e.target.value ? e.target.value : null)
                  }
                  className={`${inputClass} w-full`}
                >
                  {templates.length === 0 ? (
                    <option value="">— אין תבניות —</option>
                  ) : null}
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-end gap-1">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="תבנית חדשה"
                  className={`${inputClass} min-w-[6rem] flex-1`}
                />
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="תיאור"
                  className={`${inputClass} min-w-[5rem] flex-1`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreateTemplate()}
                  className="h-7 rounded border border-slate-800 bg-slate-900 px-2 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-900"
                >
                  צור
                </button>
              </div>
            </div>

            {selectedId ? (
              <>
                <div className="flex flex-wrap items-center gap-1 px-0.5">
                  <select
                    value={addFieldDefId}
                    onChange={(e) => setAddFieldDefId(e.target.value)}
                    className={`${inputClass} min-w-0 max-w-[14rem] flex-1`}
                  >
                    <option value="">שדה…</option>
                    {definitions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={addFieldRow}
                    onChange={(e) =>
                      setAddFieldRow(Math.max(1, Number(e.target.value) || 1))
                    }
                    className={`${inputClass} w-12 text-center`}
                    title="שורה"
                  />
                  <select
                    value={addFieldSpan}
                    onChange={(e) =>
                      setAddFieldSpan(Number(e.target.value) || 4)
                    }
                    className={`${inputClass} w-[4.5rem]`}
                    title="רוחב"
                  >
                    <option value={1}>¼</option>
                    <option value={2}>½</option>
                    <option value={3}>¾</option>
                    <option value={4}>מלא</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy || definitions.length === 0}
                    onClick={() => void handleAddField()}
                    className={circleBtn}
                    title="הוסף שדה"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleAddRow}
                    className={`${circleBtn} border-emerald-200 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200`}
                    title="שורה חדשה"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={busy || definitions.length === 0 || !addFieldDefId}
                    onClick={() => void handleAddField()}
                    className="text-[11px] text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400"
                  >
                    הוסף שדה
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleAddRow}
                    className="text-[11px] text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 dark:text-slate-400"
                  >
                    שורה חדשה
                  </button>
                </div>

                {fieldsLoading ? (
                  <p className="px-1 text-[11px] text-neutral-500">טוען שדות…</p>
                ) : sectionBlocks.length === 0 ? (
                  <p className="px-1 text-[11px] text-neutral-500">
                    אין שדות — הוסיפו מהרשימה למעלה.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {sectionBlocks.map((block) => (
                      <div key={block.sectionId ?? `sec-${block.title}`}>
                        <div className="border-b border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-100">
                          {block.title}
                        </div>
                        <div className="space-y-1 pt-0.5">
                          {block.rows.map((row, ri) => (
                            <div
                              key={ri}
                              className="grid grid-cols-12 gap-x-1 gap-y-1"
                            >
                              {row.map((tf) => (
                                <div
                                  key={tf.id}
                                  className={`min-w-0 ${crmAdminColumnSpanToGrid12(tf.col_span)}`}
                                >
                                  <div
                                    dir="rtl"
                                    className="flex h-6 items-center gap-0.5 rounded border border-slate-200/80 bg-white px-2 text-[11px] leading-none shadow-sm dark:border-neutral-600 dark:bg-neutral-900"
                                    title={`שורת תבנית ${tf.row_number} · רוחב ${tf.col_span}/4`}
                                  >
                                    <GripVertical
                                      className="h-2.5 w-2.5 shrink-0 cursor-grab text-slate-300 dark:text-slate-600"
                                      aria-hidden
                                    />
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void handleDeleteField(tf.id)
                                      }
                                      className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                      aria-label="הסר"
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                    <select
                                      value={tf.col_span}
                                      disabled={busy}
                                      onChange={(e) =>
                                        void handleUpdateSpan(
                                          tf.id,
                                          Number(e.target.value)
                                        )
                                      }
                                      className="h-5 max-w-[2.25rem] shrink-0 rounded border-0 bg-transparent py-0 text-[10px] text-neutral-800 focus:ring-0 dark:text-neutral-100"
                                      title="רוחב"
                                    >
                                      <option value={1}>¼</option>
                                      <option value={2}>½</option>
                                      <option value={3}>¾</option>
                                      <option value={4}>מלא</option>
                                    </select>
                                    <span
                                      className="min-w-0 flex-1 truncate text-[11px] text-neutral-800 dark:text-neutral-100"
                                      title={tf.definition.label}
                                    >
                                      {tf.definition.label}
                                    </span>
                                    <FieldTypeIcon
                                      fieldType={tf.definition.field_type}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <details className="rounded-lg bg-white/60 shadow-sm open:shadow-sm dark:bg-neutral-900/40">
                  <summary className="cursor-pointer list-none px-2 py-0.5 text-[11px] font-medium text-neutral-800 marker:content-none dark:text-neutral-100 [&::-webkit-details-marker]:hidden">
                    <span className="underline decoration-slate-300 underline-offset-2">
                      תצוגה מקדימה
                    </span>
                  </summary>
                  <div className="max-h-[min(40vh,14rem)] overflow-y-auto border-t border-slate-100 px-1 pb-1 pt-1 dark:border-neutral-800">
                    {templateFieldRows.length === 0 ? (
                      <p className="text-[11px] text-neutral-500">אין שדות.</p>
                    ) : (
                      <PortalAgreementFormGrid
                        fields={templateFieldRows}
                        values={previewValues}
                        onChange={() => {}}
                        preview
                        compact
                      />
                    )}
                  </div>
                </details>
              </>
            ) : (
              <p className="px-0.5 text-[11px] text-neutral-500">
                בחרו או צרו תבנית חתימה.
              </p>
            )}
            </div>
        </div>
      )}

      <EmbedCodesModal
        open={embedCodesOpen}
        onClose={() => setEmbedCodesOpen(false)}
        onCopied={() => setEmbedCopiedHint(true)}
      />
      {embedCopiedHint ? (
        <div
          role="status"
          className="fixed bottom-4 start-1/2 z-[110] -translate-x-1/2 rounded-full bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-md dark:bg-white dark:text-neutral-900 rtl:translate-x-1/2"
        >
          הועתק
        </div>
      ) : null}
    </div>
  );
}
