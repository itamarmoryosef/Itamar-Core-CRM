"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, LayoutGrid, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { invalidateAdminClientGlobalCatalog } from "@/lib/adminClientGlobalCatalog";
import {
  customFieldWordPlaceholder,
  ensureUniqueCustomFieldSlug,
  normalizeCustomFieldSlugInput,
  suggestSlugFromLabel,
} from "@/lib/customFieldsTemplate";
import {
  CRM_FIELD_TYPES,
  crmFieldTypeHebrewLabel,
  parseCrmSelectOptions,
} from "@/lib/crmFieldLayout";
import type { CrmFieldType } from "@/lib/crmFieldLayout";
import { isPostgrestMissingRelation } from "@/lib/postgrestSchema";
import { resolveAdminOrganizationId, setSuperActiveOrganizationId } from "@/lib/orgContextClient";
import type { AdminMeResponse } from "@/app/api/admin/me/route";
import { CustomFieldsDocumentImportPanel } from "@/components/admin/CustomFieldsDocumentImportPanel";

type CustomFieldSection = {
  id: string;
  title: string;
  sort_order: number;
  created_at?: string;
  organization_id?: string | null;
};

type CustomFieldDef = {
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
  created_at?: string;
  organization_id?: string | null;
};

const baseInputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 text-start dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";
const labelClass = "text-start text-sm font-medium text-slate-700 dark:text-slate-200";
const cardClass =
  "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50";

type Toast = { type: "success" | "error"; message: string } | null;

function sortDefs(a: CustomFieldDef, b: CustomFieldDef) {
  if (a.row_number !== b.row_number) return a.row_number - b.row_number;
  return a.sort_order - b.sort_order;
}

export default function CustomFieldsSettingsPage() {
  const [sections, setSections] = useState<CustomFieldSection[]>([]);
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const [sectionFormOpen, setSectionFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<CustomFieldSection | null>(
    null
  );
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionSort, setSectionSort] = useState("0");
  const [sectionSaving, setSectionSaving] = useState(false);

  const [fieldModal, setFieldModal] = useState<"new" | CustomFieldDef | null>(null);
  const [fLabel, setFLabel] = useState("");
  const [fSlug, setFSlug] = useState("");
  const [fType, setFType] = useState<CrmFieldType>("text");
  const [fSectionId, setFSectionId] = useState<string | "">("");
  const [fRow, setFRow] = useState("1");
  const [fSpan, setFSpan] = useState("4");
  const [fSort, setFSort] = useState("0");
  const [fOptions, setFOptions] = useState(""); // newline-separated for select
  const [fFormula, setFFormula] = useState("");
  const [fieldSaving, setFieldSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSecId, setDeletingSecId] = useState<string | null>(null);

  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [meLoadDone, setMeLoadDone] = useState(false);
  const [allOrgs, setAllOrgs] = useState<{ id: string; name: string; slug: string }[] | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [claimOrgBusy, setClaimOrgBusy] = useState(false);

  const claimDefaultOrganization = useCallback(async () => {
    setClaimOrgBusy(true);
    try {
      const res = await fetch("/api/admin/claim-organization", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as {
        organizationId?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setToast({
          type: "error",
          message: j.error ?? "שיוך נכשל",
        });
        return;
      }
      if (j.organizationId) {
        setActiveOrgId(j.organizationId);
        const mer = await fetch("/api/admin/me", { credentials: "include" });
        if (mer.ok) {
          setMe((await mer.json()) as AdminMeResponse);
        }
        setLoadError(null);
        setToast({ type: "success", message: "שוייכתם לארגון בהצלחה." });
      }
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setClaimOrgBusy(false);
    }
  }, []);

  useEffect(() => {
    let c = false;
    void (async () => {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as AdminMeResponse;
      if (c) return;
      setMe(data);
      if (data.platformSuper) {
        const ores = await fetch("/api/super/organizations", { credentials: "include" });
        if (ores.ok) {
          const oj = (await ores.json()) as {
            organizations: { id: string; name: string; slug: string }[];
          };
          if (!c) {
            setAllOrgs(oj.organizations);
            setActiveOrgId(
              resolveAdminOrganizationId(
                { platformSuper: true, organizationId: data.organizationId },
                oj.organizations
              ) ?? data.organizationId
            );
          }
        } else {
          setAllOrgs([]);
          setActiveOrgId(data.organizationId);
        }
      } else {
        setAllOrgs(null);
        setActiveOrgId(data.organizationId);
      }
      if (!c) setMeLoadDone(true);
    })();
    return () => {
      c = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      if (!meLoadDone) {
        setLoading(false);
        return;
      }
      if (!activeOrgId) {
        setLoadError("לא נמצא ארגון. (Super) בחרו בארגונים, או הקצו organization_id לפרופיל ב-Supabase.");
        setSections([]);
        setDefs([]);
        return;
      }
      const [secRes, defRes] = await Promise.all([
        supabase
          .from("custom_field_sections")
          .select("id, title, sort_order, created_at, organization_id")
          .eq("organization_id", activeOrgId)
          .order("sort_order", { ascending: true })
          .order("title", { ascending: true }),
        supabase
          .from("custom_field_definitions")
          .select("*")
          .eq("organization_id", activeOrgId),
      ]);

      if (secRes.error) throw secRes.error;
      if (defRes.error) throw defRes.error;
      setSections((secRes.data ?? []) as CustomFieldSection[]);
      setDefs((defRes.data ?? []) as CustomFieldDef[]);
    } catch (e) {
      const err = e as { message?: string; code?: string; details?: string };
      if (isPostgrestMissingRelation(err)) {
        setLoadError("טבלאות השדות (custom_field_*) אינן זמינות במסד. הריצו את קוד ה-Schema מ־PASTE ב-Supabase.");
      } else {
        setLoadError(err.message ?? "שגיאת טעינה");
      }
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, meLoadDone]);

  useEffect(() => {
    void load();
  }, [load]);

  const defsBySection = useMemo(() => {
    const m = new Map<string | "none", CustomFieldDef[]>();
    m.set("none", []);
    for (const s of sections) m.set(s.id, []);
    for (const d of defs) {
      const k = d.section_id ?? "none";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    for (const [, arr] of m) arr.sort(sortDefs);
    return m;
  }, [defs, sections]);

  const allSlugs = useMemo(
    () => new Set(defs.map((d) => d.slug.toLowerCase())),
    [defs]
  );

  const openNewSection = () => {
    setEditingSection(null);
    setSectionTitle("");
    setSectionSort(String(sections.length ? Math.max(...sections.map((s) => s.sort_order)) + 1 : 0));
    setSectionFormOpen(true);
  };

  const openEditSection = (s: CustomFieldSection) => {
    setEditingSection(s);
    setSectionTitle(s.title);
    setSectionSort(String(s.sort_order));
    setSectionFormOpen(true);
  };

  const closeSectionForm = () => {
    setSectionFormOpen(false);
    setEditingSection(null);
  };

  const saveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = sectionTitle.trim();
    if (!title) {
      setToast({ type: "error", message: "נא להזין שם לקבוצה." });
      return;
    }
    const so = Number.parseInt(sectionSort, 10);
    const sort_order = Number.isFinite(so) ? so : 0;
    setSectionSaving(true);
    if (editingSection) {
      const { error } = await supabase
        .from("custom_field_sections")
        .update({ title, sort_order })
        .eq("id", editingSection.id);
      setSectionSaving(false);
      if (error) {
        setToast({ type: "error", message: error.message });
        return;
      }
    } else {
      if (!activeOrgId) {
        setSectionSaving(false);
        setToast({ type: "error", message: "בחרו ארגון." });
        return;
      }
      const { error } = await supabase
        .from("custom_field_sections")
        .insert({ title, sort_order, organization_id: activeOrgId });
      setSectionSaving(false);
      if (error) {
        setToast({ type: "error", message: error.message });
        return;
      }
    }
    setToast({ type: "success", message: "הקבוצה נשמרה." });
    closeSectionForm();
    invalidateAdminClientGlobalCatalog();
    void load();
  };

  const deleteSection = async (s: CustomFieldSection) => {
    if (!window.confirm(`למחוק את הקבוצה "${s.title}"? שדות שייכים יישארו ללא קבוצה.`)) return;
    setDeletingSecId(s.id);
    const { error } = await supabase.from("custom_field_sections").delete().eq("id", s.id);
    setDeletingSecId(null);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    setToast({ type: "success", message: "הקבוצה נמחקה." });
    invalidateAdminClientGlobalCatalog();
    void load();
  };

  const openNewField = (defaultSectionId?: string) => {
    setFieldModal("new");
    setFLabel("");
    setFSlug("");
    setFType("text");
    setFSectionId(defaultSectionId ?? "");
    setFRow("1");
    setFSpan("4");
    setFSort("0");
    setFOptions("");
    setFFormula("");
  };

  const openEditField = (d: CustomFieldDef) => {
    setFieldModal(d);
    setFLabel(d.label);
    setFSlug(d.slug);
    setFType((CRM_FIELD_TYPES.includes(d.field_type as CrmFieldType) ? d.field_type : "text") as CrmFieldType);
    setFSectionId(d.section_id ?? "");
    setFRow(String(d.row_number));
    setFSpan(String(d.column_span));
    setFSort(String(d.sort_order));
    setFOptions(
      d.field_type === "select" ? parseCrmSelectOptions(d.options).join("\n") : ""
    );
    setFFormula(d.formula?.trim() ?? "");
  };

  const closeFieldModal = () => setFieldModal(null);

  const onBlurSuggestSlug = () => {
    if (fieldModal !== "new" || fSlug.trim()) return;
    const s = suggestSlugFromLabel(fLabel);
    if (s) {
      const reserved = new Set(allSlugs);
      setFSlug(ensureUniqueCustomFieldSlug(s, reserved));
    }
  };

  const saveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldModal) return;
    const label = fLabel.trim();
    let slug = normalizeCustomFieldSlugInput(fSlug);
    if (!label) {
      setToast({ type: "error", message: "נא מילוי תווית לשדה." });
      return;
    }
    if (!slug || slug.length < 2) {
      setToast({ type: "error", message: "מזהה (slug) לא חוקי — אותיות קטנות, מספרים ו־_ בלבד." });
      return;
    }
    if (fieldModal === "new") {
      const setSlugs = new Set(allSlugs);
      if (setSlugs.has(slug)) {
        slug = ensureUniqueCustomFieldSlug(slug, setSlugs);
        setFSlug(slug);
      }
    } else {
      if (fieldModal.slug !== slug) {
        const setSlugs = new Set(
          allSlugs.size ? [...allSlugs].filter((x) => x !== fieldModal.slug.toLowerCase()) : []
        );
        if (setSlugs.has(slug)) {
          slug = ensureUniqueCustomFieldSlug(slug, setSlugs);
          setFSlug(slug);
        }
      }
    }

    const row_number = Math.min(200, Math.max(1, Math.round(Number(fRow) || 1)));
    const column_span = Math.min(4, Math.max(1, Math.round(Number(fSpan) || 4)));
    const sort_order = Math.max(0, Math.round(Number(fSort) || 0));
    const optionsLines = fOptions
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const field_type: CrmFieldType = fType;
    const optionsPayload =
      field_type === "select" ? optionsLines : [];

    if (!activeOrgId) {
      setToast({ type: "error", message: "חסר ארגון (organization)." });
      return;
    }
    setFieldSaving(true);
    const baseRow = {
      label,
      slug,
      field_type,
      section_id: fSectionId && fSectionId.length > 0 ? fSectionId : null,
      row_number,
      column_span,
      sort_order,
      options: optionsPayload,
      organization_id: activeOrgId,
    } as const;

    const payload: Record<string, unknown> =
      field_type === "calculation" && fFormula.trim()
        ? { ...baseRow, formula: fFormula.trim() }
        : { ...baseRow, formula: null };

    if (fieldModal === "new") {
      let { error: insErr } = await supabase.from("custom_field_definitions").insert(payload);
      if (insErr && field_type === "calculation") {
        const { error: e2 } = await supabase.from("custom_field_definitions").insert({
          ...baseRow,
          field_type: "text" as const,
          formula: null,
        });
        if (!e2) {
          setFieldSaving(false);
          setToast({
            type: "success",
            message:
              "נשמר כ־'text' (המסד עדיין לא תומך ב־'calculation'). להריץ PASTE_03 / add_custom_field_calculation ב-Supabase.",
          });
          closeFieldModal();
          invalidateAdminClientGlobalCatalog();
          void load();
          return;
        }
        insErr = e2;
      }
      if (insErr) {
        setFieldSaving(false);
        setToast({ type: "error", message: insErr.message });
        return;
      }
    } else {
      const { id } = fieldModal;
      const { organization_id: _orgScope, ...updateFields } = payload;
      void _orgScope;
      const { error } = await supabase
        .from("custom_field_definitions")
        .update(updateFields)
        .eq("id", id);
      if (error) {
        setFieldSaving(false);
        setToast({ type: "error", message: error.message });
        return;
      }
    }
    setFieldSaving(false);
    setToast({ type: "success", message: "השדה נשמר." });
    closeFieldModal();
    invalidateAdminClientGlobalCatalog();
    void load();
  };

  const deleteField = async (d: CustomFieldDef) => {
    if (
      !window.confirm(
        `למחוק את "${d.label}"? ייתכן ששמירת תבנית חתימה או פריסה תלווה ב-id זה.`
      )
    )
      return;
    setDeletingId(d.id);
    const { error } = await supabase.from("custom_field_definitions").delete().eq("id", d.id);
    setDeletingId(null);
    if (error) {
      setToast({
        type: "error",
        message: error.message.includes("foreign key")
          ? "אי אפשר למחוק: השדה מקושר לתבנית/פריסה. הסירו אותו מהלוח/תבנית ראשית."
          : error.message,
      });
      return;
    }
    if (fieldModal && fieldModal !== "new" && fieldModal.id === d.id) closeFieldModal();
    setToast({ type: "success", message: "השדה נמחק." });
    invalidateAdminClientGlobalCatalog();
    void load();
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const brandEyebrow = useMemo(() => {
    if (me?.platformSuper && activeOrgId && (allOrgs?.length ?? 0) > 0) {
      const row = allOrgs?.find((o) => o.id === activeOrgId);
      if (row?.name?.trim()) return row.name.trim();
    }
    const bn = me?.organization?.brand_name?.trim();
    if (bn) return bn;
    return "CRM";
  }, [me, activeOrgId, allOrgs]);

  return (
    <div className="space-y-6 text-slate-900" dir="rtl">
      {toast ? (
        <div
          role="status"
          className={`fixed start-4 top-4 z-50 max-w-md rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand">
            {brandEyebrow}
          </p>
          <h1 className="text-start text-2xl font-bold tracking-tight">שדות מותאמים אישית</h1>
          <p className="mt-1 max-w-2xl text-start text-sm text-slate-600 dark:text-slate-300">
            הגדירו קבוצות (סקשנים) ושדות דינמיים. ה־slug נשמר ב־JSON של הלקוח (
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-800">custom_fields_data</code>
            ) ובמסמכי Word — קוד שתילה{" "}
            <code className="rounded bg-slate-200/80 px-1 [direction:ltr] text-left dark:bg-slate-800">
              {`{{custom_…}}`}
            </code>{" "}
            (ממוזג אוטומטית לתבנית docx). בלקוח ניתן לצמצם שדות דרך{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-800">assigned_field_definition_ids</code>{" "}
            בפרופיל הלקוח.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            חזרה להגדרות
          </Link>
          <Link
            href="/admin/settings/layout"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-soft bg-brand-soft px-3 py-2 text-sm font-medium text-neutral-900 hover:opacity-95"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            פריסת לוח
          </Link>
        </div>
      </div>

      {me?.platformSuper && (allOrgs?.length ?? 0) > 0 ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-start text-sm dark:border-amber-800 dark:bg-amber-950/30"
        >
          <label className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-amber-950 dark:text-amber-100">ארגון (Super)</span>
            <select
              className="min-w-[12rem] rounded border border-amber-300 bg-white px-2 py-1 text-sm dark:border-amber-700 dark:bg-slate-900"
              value={activeOrgId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setActiveOrgId(v || null);
                setSuperActiveOrganizationId(v || null);
              }}
            >
              {(allOrgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.slug})
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : me && !me.platformSuper && me.organization ? (
        <p className="text-start text-sm text-slate-600 dark:text-slate-300">
          ארגון: <span className="font-semibold">{me.organization.name}</span> ({me.organization.slug})
        </p>
      ) : null}

      {meLoadDone && me && !me.platformSuper && !activeOrgId ? (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-start text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <p className="font-medium">הפרופיל עדיין לא משויך לארגון (organization).</p>
          <p className="mt-1 text-slate-700 dark:text-slate-300">
            אם במסד הוגדר ארגון <strong>אחד בלבד</strong>, אפשר לשייך אוטומטית. אם יש כמה ארגונים —
            Super צריך לשייך אתכם.
          </p>
          <button
            type="button"
            disabled={claimOrgBusy}
            onClick={() => void claimDefaultOrganization()}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {claimOrgBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            שיוך לארגון הברירה (רק כשהמערכת בודדת)
          </button>
        </div>
      ) : null}

      {meLoadDone && me?.platformSuper && (allOrgs?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-start text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
          <p>
            אין עדיין ארגונים במסד.{" "}
            <Link
              className="font-medium underline"
              href="/admin/organizations"
            >
              צרו ארגון במסך Super
            </Link>
            , ואז בחרו אותו למעלה.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : loadError ? (
        <p className="text-start text-red-600" role="alert">
          {loadError}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openNewSection}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white shadow hover:opacity-90"
            >
              <Plus className="h-4 w-4" aria-hidden />
              קבוצה חדשה
            </button>
            <button
              type="button"
              onClick={() => openNewField()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              שדה חדש
            </button>
          </div>

          <CustomFieldsDocumentImportPanel
            defs={defs.map((d) => ({ label: d.label, slug: d.slug }))}
          />

          {sections.length === 0 && defsBySection.get("none")?.length === 0 ? (
            <div className={cardClass + " text-slate-600 dark:text-slate-300"}>
              אין עדיין קבוצות או שדות. הוסיפו קבוצה, ואז שדה — או שדה ללא קבוצה.
            </div>
          ) : null}

          {sections.map((s) => (
            <div key={s.id} className={cardClass}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-start text-base font-bold text-slate-900 dark:text-slate-50">
                  {s.title}
                </h2>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openNewField(s.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    שדה
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditSection(s)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSection(s)}
                    disabled={deletingSecId === s.id}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {deletingSecId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    מחק
                  </button>
                </div>
              </div>
              <FieldTable
                rows={defsBySection.get(s.id) ?? []}
                onEdit={openEditField}
                onDelete={(d) => void deleteField(d)}
                deletingId={deletingId}
              />
            </div>
          ))}

          {(defsBySection.get("none")?.length ?? 0) > 0 ? (
            <div className={cardClass}>
              <h2 className="mb-3 text-start text-base font-bold">ללא קבוצה</h2>
              <FieldTable
                rows={defsBySection.get("none") ?? []}
                onEdit={openEditField}
                onDelete={(d) => void deleteField(d)}
                deletingId={deletingId}
              />
            </div>
          ) : null}
        </>
      )}

      {sectionFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
            role="dialog"
            aria-labelledby="sec-dialog-h"
          >
            <h3 id="sec-dialog-h" className="text-start text-lg font-bold">
              {editingSection ? "עריכת קבוצה" : "קבוצה חדשה"}
            </h3>
            <form onSubmit={(e) => void saveSection(e)} className="mt-4 space-y-3">
              <label className="grid gap-1">
                <span className={labelClass}>כותרת</span>
                <input
                  className={baseInputClass}
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  required
                />
              </label>
              <label className="grid gap-1">
                <span className={labelClass}>מיון (מספר)</span>
                <input
                  type="number"
                  className={baseInputClass + " text-start [direction:ltr]"}
                  value={sectionSort}
                  onChange={(e) => setSectionSort(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeSectionForm}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={sectionSaving}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {sectionSaving ? "שומר…" : "שמירה"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {fieldModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
            role="dialog"
            aria-labelledby="field-dialog-h"
          >
            <h3 id="field-dialog-h" className="text-start text-lg font-bold">
              {fieldModal === "new" ? "שדה חדש" : "עריכת שדה"}
            </h3>
            <form onSubmit={(e) => void saveField(e)} className="mt-4 space-y-3">
              <label className="grid gap-1">
                <span className={labelClass}>תווית</span>
                <input
                  className={baseInputClass}
                  value={fLabel}
                  onChange={(e) => setFLabel(e.target.value)}
                  onBlur={onBlurSuggestSlug}
                  required
                />
              </label>
              <label className="grid gap-1">
                <span className={labelClass}>מזהה (slug) — JSON / Word</span>
                <input
                  className={baseInputClass + " [direction:ltr] text-left"}
                  dir="ltr"
                  value={fSlug}
                  onChange={(e) => setFSlug(e.target.value)}
                  onBlur={() => setFSlug((s) => normalizeCustomFieldSlugInput(s) || s)}
                  required
                />
              </label>
              {fSlug ? (
                <p className="text-xs text-slate-500 [direction:ltr] text-left">
                  Word:{" "}
                  <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                    {customFieldWordPlaceholder(fSlug)}
                  </code>{" "}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `custom_${normalizeCustomFieldSlugInput(fSlug)}`
                        );
                        setToast({ type: "success", message: "הועתק ל-clipboard" });
                      } catch {
                        /* no-op */
                      }
                    }}
                    className="ms-1 text-brand"
                  >
                    <Copy className="inline h-3 w-3" /> העתק מפתח
                  </button>
                </p>
              ) : null}
              <label className="grid gap-1">
                <span className={labelClass}>סוג</span>
                <select
                  className={baseInputClass}
                  value={fType}
                  onChange={(e) => setFType(e.target.value as CrmFieldType)}
                >
                  {CRM_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {crmFieldTypeHebrewLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className={labelClass}>קבוצה (אופציונלי)</span>
                <select
                  className={baseInputClass}
                  value={fSectionId}
                  onChange={(e) => setFSectionId(e.target.value)}
                >
                  <option value="">ללא</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="grid gap-1">
                  <span className={labelClass}>שורה</span>
                  <input
                    type="number"
                    min={1}
                    className={baseInputClass + " [direction:ltr]"}
                    value={fRow}
                    onChange={(e) => setFRow(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={labelClass}>רוחב 1–4</span>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    className={baseInputClass + " [direction:ltr]"}
                    value={fSpan}
                    onChange={(e) => setFSpan(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={labelClass}>מיון</span>
                  <input
                    type="number"
                    className={baseInputClass + " [direction:ltr]"}
                    value={fSort}
                    onChange={(e) => setFSort(e.target.value)}
                  />
                </label>
              </div>
              {fType === "select" ? (
                <label className="grid gap-1">
                  <span className={labelClass}>אפשרויות (שורה לכל אחת)</span>
                  <textarea
                    rows={4}
                    className={baseInputClass + " font-mono text-sm"}
                    value={fOptions}
                    onChange={(e) => setFOptions(e.target.value)}
                    placeholder={"א\nב\nג"}
                  />
                </label>
              ) : null}
              {fType === "calculation" ? (
                <label className="grid gap-1">
                  <span className={labelClass}>נוסחה (למשל לפי slugs)</span>
                  <textarea
                    rows={3}
                    className={baseInputClass + " font-mono text-sm [direction:ltr] text-left"}
                    dir="ltr"
                    value={fFormula}
                    onChange={(e) => setFFormula(e.target.value)}
                    placeholder="לדוגמה: {{price}} * 1.18"
                  />
                </label>
              ) : null}
              <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                {fieldModal !== "new" ? (
                  <button
                    type="button"
                    onClick={() => void deleteField(fieldModal as CustomFieldDef)}
                    className="text-sm text-red-600"
                  >
                    מחיקה…
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeFieldModal}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={fieldSaving}
                    className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {fieldSaving ? "שומר…" : "שמור"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldTable({
  rows,
  onEdit,
  onDelete,
  deletingId,
}: {
  rows: CustomFieldDef[];
  onEdit: (d: CustomFieldDef) => void;
  onDelete: (d: CustomFieldDef) => void;
  deletingId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">אין שדות בקבוצה זו. לחצו &quot;שדה&quot;.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-start text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <th className="p-2">תווית</th>
            <th className="p-2 [direction:ltr] text-left">slug</th>
            <th className="p-2">סוג</th>
            <th className="p-2 w-20">רוחב</th>
            <th className="p-2 w-24">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.id}
              className="border-t border-slate-100 dark:border-slate-800"
            >
              <td className="p-2 font-medium text-slate-900 dark:text-slate-100">{d.label}</td>
              <td className="p-2 [direction:ltr] text-left font-mono text-xs text-slate-600 dark:text-slate-400">
                {d.slug}
              </td>
              <td className="p-2">{crmFieldTypeHebrewLabel(d.field_type)}</td>
              <td className="p-2 text-center tabular-nums text-slate-500">{d.column_span}</td>
              <td className="p-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(d)}
                    className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="עריכה"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(d)}
                    disabled={deletingId === d.id}
                    className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    aria-label="מחיקה"
                  >
                    {deletingId === d.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
