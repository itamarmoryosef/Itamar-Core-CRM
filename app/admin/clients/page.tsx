"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Filter,
  FolderOpen,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { insertClientWithShortId } from "@/lib/clientInsertWithShortId";
import {
  CLIENT_CRM_STATUSES_FALLBACK,
  CLIENT_CRM_STATUS_DEFAULT,
  parseCustomClientCrmStatuses,
} from "@/lib/clientCrmStatus";
import { isDefaultPreselectedSignatureTemplate } from "@/lib/defaultSignatureTemplatePreselect";
import {
  copyGlobalTemplateToClientDocumentsUpload,
  isGlobalTemplateForPortalSignature,
  type GlobalTemplateRow,
} from "@/lib/copyGlobalTemplateToClientUpload";
import { LEAD_SOURCE_OPTIONS } from "@/lib/leadSource";
import { displayClientNameFromRow } from "@/lib/customFieldsTemplate";
import { resolveClientStatusIdForUpdate } from "@/lib/resolveClientStatusIdForUpdate";
import {
  ResponsiveDataTable,
  type ResponsiveColumnDef,
} from "@/components/ui/ResponsiveDataTable";
import { SectionCard } from "@/components/ui/SectionCard";

type DocumentTypeRow = {
  id: string;
  name: string;
};

type LeadProviderOption = {
  id: string;
  name: string;
};

type ClientStatusOption = {
  id: string;
  label: string;
  color_hex: string | null;
  sort_order?: number | null;
  is_system?: boolean | null;
};

type ClientListRow = {
  id: string;
  full_name: string;
  custom_fields_data?: unknown;
  id_number: string;
  phone: string | null;
  status: string | null;
  status_id: string | null;
  created_at?: string | null;
  closed_by?: string | null;
};

type PipelineTabFilter = "all" | string;

const STATUS_TAB_EMOJI: Record<string, string> = {
  all: "📋",
  "ממתין למסמכים": "🟡",
  "מסמכים הושלמו": "🟢",
  "הוגש - ממתין לתשובה": "🔵",
  "הסתיים - טופל בהצלחה": "✅",
  "הסתיים - ללא מכירה": "⛔",
  "הסתיים - לא קיבל רישיון": "⛔", // legacy
};

function clientMatchesLiveSearch(c: ClientListRow, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const name = displayClientNameFromRow(c).toLowerCase();
  if (name.includes(q)) return true;
  const idRaw = c.id_number ?? "";
  if (idRaw.toLowerCase().includes(q)) return true;
  const phoneRaw = c.phone ?? "";
  if (phoneRaw.toLowerCase().includes(q)) return true;
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length > 0) {
    const idDigits = idRaw.replace(/\D/g, "");
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    if (idDigits.includes(qDigits) || phoneDigits.includes(qDigits)) {
      return true;
    }
  }
  return false;
}

export default function AdminClientsPage() {
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientBusy, setClientBusy] = useState(false);

  const [documentTypes, setDocumentTypes] = useState<DocumentTypeRow[]>([]);
  const [dtLoading, setDtLoading] = useState(false);
  const [dtError, setDtError] = useState<string | null>(null);

  const [signatureTemplates, setSignatureTemplates] = useState<
    GlobalTemplateRow[]
  >([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedSignatureTemplateIds, setSelectedSignatureTemplateIds] =
    useState<Set<string>>(() => new Set());
  const signatureDefaultsAppliedRef = useRef(false);

  const [leadProviders, setLeadProviders] = useState<LeadProviderOption[]>([]);
  const [leadProvidersLoading, setLeadProvidersLoading] = useState(false);
  const [leadProvidersError, setLeadProvidersError] = useState<string | null>(
    null
  );
  const [closerProfileOptions, setCloserProfileOptions] = useState<
    { id: string; full_name: string | null }[]
  >([]);

  const [clientStatuses, setClientStatuses] = useState<ClientStatusOption[]>(
    []
  );

  const [clients, setClients] = useState<ClientListRow[]>([]);
  const [crmStatuses, setCrmStatuses] = useState<string[]>(
    CLIENT_CRM_STATUSES_FALLBACK
  );
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [pipelineTab, setPipelineTab] = useState<PipelineTabFilter>("all");
  const normalizeToKnownStatus = useCallback(
    (value: string | null | undefined) => {
      const s = value?.trim();
      if (s && crmStatuses.includes(s)) return s;
      return CLIENT_CRM_STATUS_DEFAULT;
    },
    [crmStatuses]
  );

  const crmPipelineTabs = useMemo(
    () => [
      { id: "all" as const, label: "כל הלקוחות" },
      ...crmStatuses.map((s) => ({ id: s, label: s })),
    ],
    [crmStatuses]
  );

  const loadCrmStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      const data = (await res.json()) as { client_crm_statuses?: string[] };
      if (!res.ok) return;
      setCrmStatuses(
        parseCustomClientCrmStatuses((data.client_crm_statuses ?? []).join("\n"))
      );
    } catch {
      /* keep fallback */
    }
  }, []);

  const [whatsappSendingId, setWhatsappSendingId] = useState<string | null>(
    null
  );
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [closerListFilter, setCloserListFilter] = useState("");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filterDrawerEntered, setFilterDrawerEntered] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!filterDrawerOpen) {
      setFilterDrawerEntered(false);
      return;
    }
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setFilterDrawerEntered(true);
      });
    });
    return () => {
      cancelled = true;
      setFilterDrawerEntered(false);
    };
  }, [filterDrawerOpen]);

  useEffect(() => {
    if (!filterDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterDrawerOpen]);

  useEffect(() => {
    document.body.style.overflow = filterDrawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filterDrawerOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setCloserProfileOptions([]);
        return;
      }
      setCloserProfileOptions(
        (data ?? []) as { id: string; full_name: string | null }[]
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadClientStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from("client_statuses")
      .select("id, label, color_hex, sort_order, is_system")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    if (error) {
      setClientStatuses([]);
      return;
    }
    setClientStatuses((data ?? []) as ClientStatusOption[]);
  }, []);

  useEffect(() => {
    void loadClientStatuses();
  }, [loadClientStatuses]);

  const pipelineTabs = useMemo((): {
    id: PipelineTabFilter;
    label: string;
    color_hex: string | null;
  }[] => {
    const rest = [...clientStatuses].map((s) => ({
      id: s.id as PipelineTabFilter,
      label: s.label,
      color_hex: s.color_hex,
    }));
    return [
      { id: "all", label: "כל הלקוחות", color_hex: null },
      ...rest,
    ];
  }, [clientStatuses]);

  useEffect(() => {
    if (pipelineTab === "all") return;
    if (!clientStatuses.some((s) => s.id === pipelineTab)) {
      setPipelineTab("all");
    }
  }, [pipelineTab, clientStatuses]);

  const loadDocumentTypes = useCallback(async () => {
    setDtLoading(true);
    setDtError(null);
    const { data, error } = await supabase
      .from("document_types")
      .select("id, name")
      .order("created_at", { ascending: true });

    setDtLoading(false);
    if (error) {
      setDtError(error.message);
      setDocumentTypes([]);
      return;
    }
    setDocumentTypes((data ?? []) as DocumentTypeRow[]);
  }, []);

  const loadSignatureTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, original_filename, storage_path")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    setTemplatesLoading(false);
    if (error) {
      setTemplatesError(error.message);
      setSignatureTemplates([]);
      return;
    }
    const rows = (data ?? []) as GlobalTemplateRow[];
    setSignatureTemplates(rows.filter((r) => r.storage_path?.trim()));
  }, []);

  const loadLeadProviders = useCallback(async () => {
    setLeadProvidersLoading(true);
    setLeadProvidersError(null);
    const { data, error } = await supabase
      .from("lead_providers")
      .select("id, name")
      .order("name", { ascending: true });
    setLeadProvidersLoading(false);
    if (error) {
      setLeadProviders([]);
      setLeadProvidersError(error.message);
      return;
    }
    setLeadProviders((data ?? []) as LeadProviderOption[]);
  }, []);

  useEffect(() => {
    if (!addClientOpen) {
      signatureDefaultsAppliedRef.current = false;
      return;
    }
    void loadDocumentTypes();
    void loadSignatureTemplates();
    void loadLeadProviders();
  }, [addClientOpen, loadDocumentTypes, loadLeadProviders, loadSignatureTemplates]);

  const portalSignatureTemplates = useMemo(
    () => signatureTemplates.filter((t) => isGlobalTemplateForPortalSignature(t)),
    [signatureTemplates]
  );

  useEffect(() => {
    if (!addClientOpen) {
      signatureDefaultsAppliedRef.current = false;
      return;
    }
    if (templatesLoading) return;
    if (signatureDefaultsAppliedRef.current) return;
    signatureDefaultsAppliedRef.current = true;
    setSelectedSignatureTemplateIds(
      new Set(
        portalSignatureTemplates
          .filter((t) => isDefaultPreselectedSignatureTemplate(t.name))
          .map((t) => t.id)
      )
    );
  }, [addClientOpen, portalSignatureTemplates, templatesLoading]);

  const loadClients = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const { data: clientRows, error: cErr } = await supabase
      .from("clients")
      .select(
        "id, full_name, custom_fields_data, id_number, phone, status, status_id, created_at, closed_by"
      )
      .order("created_at", { ascending: false });

    if (cErr) {
      setListError(cErr.message);
      setClients([]);
      setListLoading(false);
      return;
    }

    setClients((clientRows ?? []) as ClientListRow[]);
    setListLoading(false);
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    void loadCrmStatuses();
  }, [loadCrmStatuses]);

  useEffect(() => {
    if (pipelineTab === "all") return;
    if (!crmStatuses.includes(pipelineTab)) {
      setPipelineTab("all");
    }
  }, [crmStatuses, pipelineTab]);

  const crmPipelineCounts = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const s of crmStatuses) {
      byStatus.set(s, 0);
    }
    for (const c of clients) {
      const k = normalizeToKnownStatus(c.status);
      byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
    }
    return { total: clients.length, byStatus };
  }, [clients, crmStatuses, normalizeToKnownStatus]);

  const pipelineSortedClients = useMemo(() => {
    const list =
      pipelineTab === "all"
        ? clients
        : clients.filter((c) => normalizeToKnownStatus(c.status) === pipelineTab);
    // Newest first (matches Supabase order); keeps order stable after optimistic updates
    return [...list].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });
  }, [clients, pipelineTab, normalizeToKnownStatus]);

  const closerListFilterTrim = closerListFilter.trim();

  const clientsAfterCloserFilter = useMemo(() => {
    if (!closerListFilterTrim) return pipelineSortedClients;
    if (closerListFilterTrim === "__none__") {
      return pipelineSortedClients.filter((c) => !c.closed_by?.trim());
    }
    return pipelineSortedClients.filter(
      (c) => c.closed_by?.trim() === closerListFilterTrim
    );
  }, [pipelineSortedClients, closerListFilterTrim]);

  const closerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of closerProfileOptions) {
      m.set(p.id, p.full_name?.trim() || "—");
    }
    return m;
  }, [closerProfileOptions]);

  const displayClients = useMemo(
    () =>
      clientsAfterCloserFilter.filter((c) =>
        clientMatchesLiveSearch(c, clientSearchQuery)
      ),
    [clientsAfterCloserFilter, clientSearchQuery]
  );

  const toggleSignatureTemplate = (id: string) => {
    setSelectedSignatureTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCrmStatusChange = useCallback(
    async (clientId: string, newStatusId: string) => {
      const prevRow = clients.find((c) => c.id === clientId);
      const previousStatus = prevRow?.status ?? null;
      const previousStatusId = prevRow?.status_id ?? null;
      const trimmedInput = newStatusId.trim();
      let resolvedId: string;
      if (!trimmedInput) {
        const def = clientStatuses.find(
          (s) => s.label === CLIENT_CRM_STATUS_DEFAULT
        );
        if (!def) {
          setToast({
            type: "error",
            message:
              "לא נמצא סטטוס ברירת מחדל. רעננו את הדף או בדקו את טבלת הסטטוסים.",
          });
          return;
        }
        resolvedId = def.id;
      } else {
        const mapped = resolveClientStatusIdForUpdate(
          trimmedInput,
          clientStatuses
        );
        if (!mapped) {
          setToast({
            type: "error",
            message:
              "סטטוס לא מזוהה. רעננו את הדף (Ctrl+F5) — ייתכן שמוצגת גרסה ישנה.",
          });
          return;
        }
        resolvedId = mapped;
      }
      const nextLabel =
        clientStatuses.find(
          (s) => s.id.toLowerCase() === resolvedId.toLowerCase()
        )?.label ?? null;
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? {
                ...c,
                status_id: resolvedId,
                status: nextLabel ?? c.status,
              }
            : c
        )
      );
      setStatusUpdatingId(clientId);
      const { error } = await supabase
        .from("clients")
        .update({ status_id: resolvedId })
        .eq("id", clientId);
      setStatusUpdatingId(null);
      if (error) {
        setClients((prev) =>
          prev.map((c) =>
            c.id === clientId
              ? { ...c, status: previousStatus, status_id: previousStatusId }
              : c
          )
        );
        setToast({
          type: "error",
          message: `עדכון סטטוס נכשל: ${error.message}`,
        });
        return;
      }
      setToast({ type: "success", message: "סטטוס הלקוח עודכן." });
      const labelForReview =
        typeof nextLabel === "string" && nextLabel.trim()
          ? nextLabel.trim()
          : "";
      console.info("[review-wa] client fetch", {
        clientId,
        crmStatusId: resolvedId,
        crmStatusLabel: labelForReview || undefined,
      });
      void fetch("/api/whatsapp/send-license-granted-review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          crmStatusId: resolvedId,
          ...(labelForReview ? { crmStatusLabel: labelForReview } : {}),
        }),
        keepalive: true,
      }).catch(() => {});
    },
    [clients, clientStatuses]
  );

  const handleAddClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);

    const full_name = String(fd.get("full_name") ?? "").trim();
    const id_number = String(fd.get("id_number") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const lead_source_raw = String(fd.get("lead_source") ?? "").trim();
    const lead_provider_name = String(
      fd.get("lead_provider_name") ?? ""
    ).trim();
    const closed_by = String(fd.get("closed_by") ?? "").trim() || null;
    const fee_upfront = String(fd.get("fee_upfront") ?? "").trim();
    const fee_success = String(fd.get("fee_success") ?? "").trim();
    const required_docs = fd.getAll("required_docs").map(String);

    const sigIds = Array.from(selectedSignatureTemplateIds);
    const hasSignatureDocs = sigIds.length > 0;

    if (!full_name || !id_number) {
      setToast({
        type: "error",
        message: "יש למלא שם מלא ומספר תעודת זהות.",
      });
      setClientBusy(false);
      return;
    }

    const defaultStatus = clientStatuses.find(
      (s) => s.label === CLIENT_CRM_STATUS_DEFAULT
    );
    if (!defaultStatus) {
      setClientBusy(false);
      setToast({
        type: "error",
        message:
          "לא נטענו סטטוסי CRM. הריצו ב-Supabase את add_client_statuses.sql ורעננו.",
      });
      return;
    }

    const clientPayload: Record<string, unknown> = {
      full_name,
      id_number,
      phone: phone || null,
      lead_source: lead_source_raw || null,
      lead_provider_name: lead_provider_name || null,
      closed_by,
      fee_upfront: fee_upfront || null,
      fee_success: fee_success || null,
      required_docs,
      status_id: defaultStatus.id,
      upload_request_active: false,
      agreement_request_active: hasSignatureDocs,
      agreement_custom_pdf_path: null,
      agreement_custom_pdf_filename: null,
    };
    if (hasSignatureDocs) {
      clientPayload.agreement_source = "from_document";
    }

    const { data: inserted, error } = await insertClientWithShortId(
      supabase,
      clientPayload
    );

    if (error) {
      setClientBusy(false);
      setToast({ type: "error", message: `שגיאה בשמירה: ${error.message}` });
      return;
    }

    const newClientId = inserted?.id;
    if (!newClientId) {
      setClientBusy(false);
      setToast({ type: "error", message: "הלקוח נשמר ללא מזהה — פנו למנהל המערכת." });
      return;
    }

    for (const name of required_docs) {
      const { error: docErr } = await supabase.from("documents").insert({
        client_id: newClientId,
        doc_type: name,
        status: "pending",
        needs_signature: false,
      });
      if (docErr) {
        setClientBusy(false);
        setToast({
          type: "error",
          message: `הלקוח נוצר; יצירת שורת מסמך עבור "${name}" נכשלה: ${docErr.message}`,
        });
        form.reset();
        setAddClientOpen(false);
        void loadClients();
        return;
      }
    }

    for (const tid of sigIds) {
      const template = portalSignatureTemplates.find((t) => t.id === tid);
      if (!template) continue;
      const copied = await copyGlobalTemplateToClientDocumentsUpload(
        supabase,
        newClientId,
        template
      );
      if ("error" in copied) {
        setClientBusy(false);
        setToast({
          type: "error",
          message: `הלקוח נוצר; העתקת התבנית "${template.name}" נכשלה: ${copied.error}`,
        });
        form.reset();
        setAddClientOpen(false);
        void loadClients();
        return;
      }
      const { error: insSigErr } = await supabase.from("documents").insert({
        client_id: newClientId,
        doc_type: template.name,
        status: "uploaded",
        file_url: copied.publicUrl,
        storage_path: copied.storagePath,
        original_filename: copied.originalFilename,
        needs_signature: true,
      });
      if (insSigErr) {
        setClientBusy(false);
        setToast({
          type: "error",
          message: `הלקוח נוצר; שמירת מסמך חתימה "${template.name}" נכשלה: ${insSigErr.message}`,
        });
        form.reset();
        setAddClientOpen(false);
        void loadClients();
        return;
      }
    }

    setClientBusy(false);
    form.reset();
    setAddClientOpen(false);
    setSelectedSignatureTemplateIds(new Set());
    const nReq = required_docs.length;
    const nSig = sigIds.length;
    setToast({
      type: "success",
      message: `הלקוח נוצר. ${nReq ? `${nReq} מסמכי תיק (ממתינים להעלאה). ` : ""}${nSig ? `${nSig} מסמכי חתימה מוכנים בפורטל.` : ""} ניתן לשלוח WhatsApp מהרשימה.`,
    });
    void loadClients();
  };

  const sendWelcomeWhatsApp = async (clientId: string) => {
    setWhatsappSendingId(clientId);
    try {
      const res = await fetch("/api/whatsapp/send-welcome", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      let data: { error?: string } = {};
      try {
        data = (await res.json()) as { error?: string };
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error ?? "שליחת WhatsApp נכשלה",
        });
        return;
      }
      setToast({ type: "success", message: "הודעת פתיחה נשלחה ב־WhatsApp." });
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setWhatsappSendingId(null);
    }
  };

  const handleDeleteClient = async (clientId: string, fullName: string) => {
    const ok = window.confirm(
      `למחוק את הלקוח "${fullName}"? פעולה זו בלתי הפיכה.`
    );
    if (!ok) return;

    setDeletingClientId(clientId);
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    setDeletingClientId(null);
    if (error) {
      setToast({ type: "error", message: `מחיקה נכשלה: ${error.message}` });
      return;
    }
    setToast({ type: "success", message: "הלקוח נמחק." });
    void loadClients();
  };

  const formCanSubmit =
    !clientBusy &&
    !dtLoading &&
    !templatesLoading &&
    !templatesError &&
    clientStatuses.length > 0;

  const crmFilterActiveCount = pipelineTab === "all" ? 0 : 1;
  const closerFilterActiveCount = closerListFilterTrim ? 1 : 0;
  const listFilterBadgeCount = crmFilterActiveCount + closerFilterActiveCount;

  const clientListColumns = useMemo(
    (): ResponsiveColumnDef<ClientListRow>[] => [
      {
        id: "name",
        header: "שם",
        cell: (c) => displayClientNameFromRow(c),
        tdClassName:
          "px-2 py-px text-xs font-medium leading-tight text-slate-900 dark:text-slate-100",
      },
      {
        id: "id_number",
        header: "תעודת זהות",
        cell: (c) => (
          <span dir="ltr">{c.id_number}</span>
        ),
        tdClassName: "px-2 py-px text-xs leading-tight text-slate-700 dark:text-slate-300",
      },
      {
        id: "phone",
        header: "טלפון",
        cell: (c) => (
          <span dir="ltr">{c.phone?.trim() || "—"}</span>
        ),
        tdClassName: "px-2 py-px text-xs leading-tight text-slate-700 dark:text-slate-300",
      },
      {
        id: "closer",
        header: "סוגר עסקה",
        cell: (c) => {
          const id = c.closed_by?.trim();
          if (!id) return "לא שויך";
          return closerNameById.get(id) ?? "—";
        },
        tdClassName:
          "max-w-[160px] truncate px-2 py-px text-xs leading-tight text-slate-700 dark:text-slate-300",
      },
      {
        id: "created",
        header: "נוסף",
        cell: (c) =>
          c.created_at
            ? new Date(c.created_at).toLocaleDateString("he-IL")
            : "—",
        tdClassName: "px-2 py-px text-xs leading-tight text-slate-600 dark:text-slate-400",
      },
      {
        id: "status",
        header: "סטטוס",
        cell: (c) => {
          const fromRow = clientStatuses.find((s) => s.id === c.status_id);
          const label =
            fromRow?.label?.trim() ||
            c.status?.trim() ||
            "ללא סטטוס";
          const badge = {
            backgroundColor: "rgba(148,163,184,0.2)",
            color: "#334155",
          };
          return (
            <>
              <span
                className="mb-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight shadow-sm ring-1 ring-white/80 dark:ring-neutral-900"
                style={{
                  backgroundColor: badge.backgroundColor,
                  color: badge.color,
                }}
              >
                {label}
              </span>
              <select
                aria-label="סטטוס CRM"
                value={c.status_id ?? ""}
                disabled={
                  statusUpdatingId === c.id || clientStatuses.length === 0
                }
                onChange={(e) =>
                  void handleCrmStatusChange(c.id, e.target.value)
                }
                className="max-w-[min(100%,220px)] h-7 min-h-7 w-full cursor-pointer rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-900 disabled:opacity-50 md:max-w-[220px] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">ללא סטטוס</option>
                {clientStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {statusUpdatingId === c.id ? (
                <span className="mt-1 block text-xs text-neutral-500">
                  שומר…
                </span>
              ) : null}
            </>
          );
        },
        tdClassName: "px-2 py-px align-top",
      },
    ],
    [statusUpdatingId, closerNameById, clientStatuses, handleCrmStatusChange]
  );

  return (
    <div className="relative w-full space-y-4">
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

      <div className="w-full space-y-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-neutral-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-start text-sm text-neutral-500 dark:text-neutral-400">
              ניהול לקוחות
            </p>
            <h1 className="text-start text-xl font-bold text-neutral-900 dark:text-neutral-50">
              לקוחות
            </h1>
            <p className="text-start text-xs text-neutral-500 dark:text-neutral-400">
              ממוין מהחדש לישן. לאחר יצירת לקוח עם מסמכי חתימה — כפתור WhatsApp
              מוכן עם קישור לפורטל.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddClientOpen(true)}
            className="inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            צור לקוח חדש
          </button>
        </header>

        {addClientOpen ? (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-4"
            role="presentation"
          >
            <button
              type="button"
              aria-label="סגור"
              className="absolute inset-0 bg-black/50"
              onClick={() => !clientBusy && setAddClientOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-client-dialog-title"
              className="relative z-50 box-border max-h-[92dvh] w-full max-w-none overflow-y-auto border-x-0 border-b-0 border-t border-neutral-200 bg-white p-4 pb-6 shadow-xl max-md:min-h-[70dvh] max-md:rounded-none max-md:px-4 sm:max-h-[90vh] sm:border sm:max-w-lg sm:rounded-2xl sm:p-6 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2
                  id="add-client-dialog-title"
                  className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
                >
                  יצירת לקוח חדש
                </h2>
                <button
                  type="button"
                  disabled={clientBusy}
                  onClick={() => setAddClientOpen(false)}
                  className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                  aria-label="סגור חלון"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form
                onSubmit={(ev) => void handleAddClient(ev)}
                className="flex flex-col gap-4 sm:grid sm:grid-cols-2"
              >
                <label className="grid gap-1 text-start text-sm sm:col-span-2">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    שם מלא
                  </span>
                  <input
                    name="full_name"
                    required
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <label className="grid gap-1 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    מספר תעודת זהות
                  </span>
                  <input
                    name="id_number"
                    required
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <label className="grid gap-1 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    טלפון
                  </span>
                  <input
                    name="phone"
                    type="tel"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                  <label className="grid gap-1 text-start text-sm">
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      מקור הליד
                    </span>
                    <select
                      name="lead_source"
                      defaultValue=""
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    >
                      <option value="">לא נבחר</option>
                      {LEAD_SOURCE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-start text-sm">
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      ספק ליד
                    </span>
                    <select
                      name="lead_provider_name"
                      defaultValue=""
                      disabled={leadProvidersLoading}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    >
                      <option value="">לא נבחר</option>
                      {leadProviders.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {leadProvidersError ? (
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        לא נטענו ספקים ({leadProvidersError}). הגדירו ב־הגדרות או הריצו
                        add_lead_providers.sql
                      </span>
                    ) : null}
                  </label>
                </div>
                <label className="grid gap-1 text-start text-sm sm:col-span-2">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    סוגר עסקה
                  </span>
                  <select
                    name="closed_by"
                    defaultValue=""
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  >
                    <option value="">לא שויך</option>
                    {closerProfileOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name?.trim() || p.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    סכום לפתיחת תיק (מקדמה)
                  </span>
                  <input
                    name="fee_upfront"
                    type="text"
                    placeholder="למשל: 3,000 ₪"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <label className="grid gap-1 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    סכום לאחר סגירה מוצלחת (שכר הצלחה)
                  </span>
                  <input
                    name="fee_success"
                    type="text"
                    placeholder="למשל: 7,000 ₪"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>

                <fieldset className="sm:col-span-2">
                  <legend className="mb-2 text-start text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    מסמכים לחתימה
                  </legend>
                  <p className="mb-2 text-start text-xs text-neutral-600 dark:text-neutral-400">
                    תבניות גלובליות מ־
                    <Link
                      href="/admin/settings"
                      className="mx-0.5 font-medium underline"
                      onClick={() => setAddClientOpen(false)}
                    >
                      הגדרות
                    </Link>
                    . ניתן לסמן כמה תבניות PDF או Word ‎(.docx) במקביל — לכל אחת
                    תיווצר שורה עם קובץ מוכן ו־
                    <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                      needs_signature: true
                    </code>
                    . שמות המכילים &quot;הסכם שכר טרחה&quot; או &quot;ייפוי כוח&quot;
                    מסומנים כברירת מחדל.
                  </p>
                  {templatesLoading ? (
                    <div className="flex items-center gap-2 py-3 text-neutral-600 dark:text-neutral-400">
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      טוען תבניות…
                    </div>
                  ) : templatesError ? (
                    <p className="text-sm text-red-600">{templatesError}</p>
                  ) : portalSignatureTemplates.length === 0 ? (
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      אין תבניות PDF או ‎.docx לחתימה. העלו תבניות ב־הגדרות →
                      תבניות הסכם ‎(.docx) או קבצי PDF מתאימים.
                    </p>
                  ) : (
                    <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-1">
                      {portalSignatureTemplates.map((t) => (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 text-start text-sm dark:border-indigo-900 dark:bg-indigo-950/30"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSignatureTemplateIds.has(t.id)}
                            onChange={() => toggleSignatureTemplate(t.id)}
                            className="mt-1"
                          />
                          <span className="text-neutral-800 dark:text-neutral-200">
                            <span className="font-medium">{t.name}</span>
                            {t.original_filename?.trim() ? (
                              <span className="mt-0.5 block text-xs text-neutral-500">
                                {t.original_filename}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>

                <fieldset className="sm:col-span-2">
                  <legend className="mb-2 text-start text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    מסמכים נדרשים מהלקוח (תיק)
                  </legend>
                  <p className="mb-3 text-start text-xs text-neutral-600 dark:text-neutral-400">
                    סימון יוצר שורות placeholder לפי סוג — הלקוח ימלא בפורטל.
                  </p>
                  {dtLoading ? (
                    <div className="flex items-center gap-2 py-4 text-neutral-600 dark:text-neutral-400">
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      טוען רשימת מסמכים…
                    </div>
                  ) : dtError ? (
                    <p className="text-sm text-red-600">
                      לא ניתן לטעון סוגי מסמכים. הגדירו ב־
                      <Link
                        href="/admin/settings"
                        className="font-medium underline"
                        onClick={() => setAddClientOpen(false)}
                      >
                        הגדרות מערכת
                      </Link>
                      .
                    </p>
                  ) : documentTypes.length === 0 ? (
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      אין סוגי מסמכים — הוסיפו בהגדרות.
                    </p>
                  ) : (
                    <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
                      {documentTypes.map((dt) => (
                        <label
                          key={dt.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50/80 p-3 text-start text-sm dark:border-neutral-700 dark:bg-neutral-900/30"
                        >
                          <input
                            type="checkbox"
                            name="required_docs"
                            value={dt.name}
                            className="mt-1"
                          />
                          <span className="text-neutral-800 dark:text-neutral-200">
                            {dt.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>

                <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    disabled={clientBusy}
                    onClick={() => setAddClientOpen(false)}
                    className="h-9 min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800 sm:px-4"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={!formCanSubmit}
                    className="h-9 min-h-9 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {clientBusy ? "יוצר…" : "צור לקוח"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        <SectionCard
          id="clients-table-h"
          title="רשימת לקוחות"
          bodyClassName="space-y-3"
        >
          {!listLoading && !listError ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
                  aria-hidden
                />
                <input
                  type="search"
                  value={clientSearchQuery}
                  onChange={(e) => setClientSearchQuery(e.target.value)}
                  placeholder="חיפוש לפי שם, תעודת זהות או טלפון…"
                  aria-label="חיפוש לקוחות ברשימה"
                  autoComplete="off"
                  disabled={clients.length === 0}
                  className="h-9 min-h-9 w-full rounded-lg border border-slate-200 bg-white py-0 ps-10 pe-11 text-sm text-neutral-900 shadow-sm outline-none ring-indigo-500/0 transition placeholder:text-neutral-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-indigo-500"
                />
                {clientSearchQuery.trim() ? (
                  <button
                    type="button"
                    onClick={() => setClientSearchQuery("")}
                    className="absolute end-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    aria-label="ניקוי חיפוש"
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                ) : null}
              </div>
              <label className="grid min-w-0 shrink-0 gap-1 text-start text-xs text-neutral-600 dark:text-neutral-400 sm:max-w-[200px]">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  סוגר עסקה
                </span>
                <select
                  value={closerListFilter}
                  onChange={(e) => setCloserListFilter(e.target.value)}
                  aria-label="סינון לפי סוגר עסקה"
                  className="h-9 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-indigo-500"
                >
                  <option value="">הכל</option>
                  <option value="__none__">לא שויך</option>
                  {closerProfileOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name?.trim() || p.id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setFilterDrawerOpen(true)}
                aria-expanded={filterDrawerOpen}
                aria-haspopup="dialog"
                className="inline-flex h-9 min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-800 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/80 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
              >
                <Filter className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
                {listFilterBadgeCount > 0
                  ? `סינון (${listFilterBadgeCount})`
                  : "סינון לפי סטטוס"}
              </button>
            </div>
          ) : null}
          {listLoading ? (
            <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              טוען…
            </div>
          ) : listError ? (
            <div className="space-y-2">
              <p className="text-start text-sm text-red-600">{listError}</p>
              <p className="text-start text-xs text-neutral-600 dark:text-neutral-400">
                אם השגיאה מתייחסת ל־
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                  created_at
                </code>
                , הריצו ב־Supabase את הקובץ{" "}
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                  add_clients_created_at.sql
                </code>
                .
              </p>
            </div>
          ) : clients.length === 0 ? (
            <p className="text-start text-sm text-neutral-600 dark:text-neutral-400">
              אין לקוחות במערכת.
            </p>
          ) : pipelineSortedClients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 px-6 py-10 text-center dark:border-neutral-600 dark:bg-neutral-900/30">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                אין לקוחות בסטטוס זה
              </p>
            </div>
          ) : clientsAfterCloserFilter.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 px-6 py-10 text-center dark:border-neutral-600 dark:bg-neutral-900/30">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                אין לקוחות התואמים לסוגר העסקה שנבחר
              </p>
            </div>
          ) : displayClients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 px-6 py-10 text-center dark:border-neutral-600 dark:bg-neutral-900/30">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                לא נמצאו לקוחות התואמים לחיפוש או לסינון
              </p>
            </div>
          ) : (
            <ResponsiveDataTable
              columns={clientListColumns}
              data={displayClients}
              rowKey={(c) => c.id}
              minTableWidth="1040px"
              desktopScrollHint="גלילה אופקית — עמודות נוספות במסכים צרים"
              emptyMessage="אין לקוחות"
              actionsHeader="פעולות"
              actionsThClassName="px-2 py-1.5 text-start text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400"
              actionsTdClassName="px-2 py-1 align-top"
              actions={(c) => {
                const hasPhone = Boolean(c.phone?.trim());
                return (
                  <div className="flex w-full flex-col gap-1 md:flex-row md:flex-wrap md:items-center">
                    <Link
                      href={`/admin/clients/${c.id}`}
                      className="inline-flex h-7 min-h-7 w-full items-center justify-center gap-1 rounded border border-slate-200 bg-white text-[11px] font-semibold text-neutral-800 hover:bg-neutral-50 md:w-auto md:px-2 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <FolderOpen
                        className="h-4 w-4 shrink-0 md:h-3.5 md:w-3.5"
                        aria-hidden
                      />
                      צפייה בתיק
                    </Link>
                    <button
                      type="button"
                      disabled={!hasPhone || whatsappSendingId === c.id}
                      onClick={() => void sendWelcomeWhatsApp(c.id)}
                      title={
                        hasPhone
                          ? "שלח הודעת פתיחה ב־WhatsApp (קישור לפורטל)"
                          : "אין מספר טלפון"
                      }
                      className="inline-flex h-7 min-h-7 w-full items-center justify-center gap-1 rounded border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-2 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950/80"
                    >
                      {whatsappSendingId === c.id ? (
                        <Loader2
                          className="h-4 w-4 shrink-0 animate-spin md:h-3.5 md:w-3.5"
                          aria-hidden
                        />
                      ) : (
                        <MessageCircle
                          className="h-4 w-4 shrink-0 md:h-3.5 md:w-3.5"
                          aria-hidden
                        />
                      )}
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      disabled={deletingClientId === c.id}
                      onClick={() =>
                        void handleDeleteClient(
                          c.id,
                          displayClientNameFromRow(c)
                        )
                      }
                      className="inline-flex h-7 min-h-7 w-full items-center justify-center gap-1 rounded border border-red-200 bg-red-50 text-[11px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 md:h-7 md:w-7 md:gap-0 md:p-0 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                      aria-label={`מחק לקוח ${displayClientNameFromRow(c)}`}
                    >
                      {deletingClientId === c.id ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="md:sr-only">מחק</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              }}
            />
          )}
        </SectionCard>
      </div>

      {filterDrawerOpen ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="crm-filter-drawer-title">
          <button
            type="button"
            aria-label="סגור סינון"
            className="absolute inset-0 bg-neutral-950/45 backdrop-blur-[2px] dark:bg-black/55"
            onClick={() => setFilterDrawerOpen(false)}
          />
          <div
            className={`absolute inset-y-0 right-0 z-10 flex h-full w-full max-w-full flex-col border-l border-neutral-200 bg-white shadow-[0_0_40px_rgba(0,0,0,0.12)] dark:border-neutral-700 dark:bg-neutral-900 sm:max-w-md ${
              filterDrawerEntered
                ? "translate-x-0"
                : "translate-x-full"
            } transform transition-transform duration-300 ease-out`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
              <h2
                id="crm-filter-drawer-title"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-50"
              >
                סינון לפי סטטוס CRM
              </h2>
              <button
                type="button"
                onClick={() => setFilterDrawerOpen(false)}
                className="rounded-xl p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                aria-label="סגור"
              >
                <X className="h-5 w-5 shrink-0" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="mb-6 rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 text-start dark:border-neutral-700 dark:bg-neutral-900/40">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    סוגר עסקה
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    הצגת לקוחות לפי סוכן שסגר את העסקה
                  </span>
                  <select
                    value={closerListFilter}
                    onChange={(e) => setCloserListFilter(e.target.value)}
                    className="h-9 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  >
                    <option value="">הכל</option>
                    <option value="__none__">לא שויך</option>
                    {closerProfileOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name?.trim() || p.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <nav className="flex flex-col gap-3" aria-label="סטטוסי CRM">
                {crmPipelineTabs.map((tab) => {
                  const count =
                    tab.id === "all"
                      ? crmPipelineCounts.total
                      : (crmPipelineCounts.byStatus.get(tab.id) ?? 0);
                  const selected = pipelineTab === tab.id;
                  const dotStyle = undefined;
                  return (
                    <button
                      key={tab.id === "all" ? "all" : tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => {
                        setPipelineTab(tab.id);
                        setFilterDrawerOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-start text-sm transition-colors ${
                        selected
                          ? "border-slate-800 bg-slate-100 shadow-sm dark:border-slate-500 dark:bg-slate-800/80"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-slate-600"
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          tab.id === "all"
                            ? selected
                              ? "bg-slate-800 dark:bg-slate-200"
                              : "bg-slate-300 dark:bg-slate-600"
                            : ""
                        }`}
                        style={tab.id === "all" ? undefined : dotStyle}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 font-medium leading-snug text-slate-900 dark:text-slate-100">
                        {tab.label}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          selected
                            ? "bg-slate-800 text-white dark:bg-slate-600"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
