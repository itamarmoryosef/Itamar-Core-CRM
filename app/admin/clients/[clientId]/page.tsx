"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bell,
  Bot,
  Clock,
  Copy,
  CreditCard,
  Download,
  FileSignature,
  FileUp,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  ResponsiveDataTable,
  type ResponsiveColumnDef,
} from "@/components/ui/ResponsiveDataTable";
import { SectionCard } from "@/components/ui/SectionCard";
import { CrmLayoutDividerView } from "@/components/CrmLayoutDivider";
import { ClientCardOverviewSkeleton } from "@/components/admin/ClientCardOverviewSkeleton";
import { LayoutSection } from "@/components/admin/LayoutSection";
import {
  AgreementTemplateQuickAdd,
  ClientDocumentManager,
  documentRowEligibleForPortalSignature,
  type AgreementTemplateRow,
  type ClientDocumentManagerProps,
  type DocRow,
  type DocumentTypeRow,
} from "@/components/admin/ClientDocumentManager";
import {
  ensureAdminClientGlobalCatalog,
  getAdminClientGlobalCatalogSnapshot,
  type AdminClientGlobalCatalog,
} from "@/lib/adminClientGlobalCatalog";
import { supabase } from "@/lib/supabase";
import {
  fetchActiveClientStatusesForCrmPickers,
  sortClientStatusesByOrderAndLabel,
} from "@/lib/clientStatusesAdminQuery";
import {
  CLIENT_CRM_STATUS_DEFAULT,
  normalizeClientCrmStatus,
} from "@/lib/clientCrmStatus";
import { resolveClientStatusIdForUpdate } from "@/lib/resolveClientStatusIdForUpdate";
import { clientStatusBadgeStyle } from "@/lib/clientStatusStyle";
import {
  documentRowHasUpload,
  effectiveRequiredDocNames,
  labelForDocType,
} from "@/lib/requiredDocuments";
import { ADMIN_OFFICE_AGREEMENT_DOC_TYPE } from "@/lib/documentListVisibility";
import {
  timestampedStorageObjectName,
  uniqueDocumentsUploadFolderSegment,
} from "@/lib/storageKey";
import {
  generateClientShortId,
  isPostgresUniqueViolation,
  isValidShortIdParam,
} from "@/lib/clientShortId";
import {
  israeliPhoneDigitsForWaMe,
  portalPublicBaseUrl,
  whatsappPortalLinkFromShortId,
  whatsappPortalLinkFromShortIdWithMode,
} from "@/lib/appUrls";
import {
  DOCUMENTS_UPLOAD_BUCKET,
  DOCUMENTS_SIGNED_BUCKET,
  resolveDocumentsUploadStoragePath,
} from "@/lib/documentsUploadStorage";
import {
  listAllDocumentsUploadPathsForClient,
  removeDocumentsUploadPaths,
} from "@/lib/storageDocumentsUploadsAdmin";
import {
  normalizedAgreementTemplateIds,
  pendingSignatureDocuments,
  portalSignatureFullyComplete,
} from "@/lib/portalSignatureState";
import { LEAD_SOURCE_OPTIONS } from "@/lib/leadSource";
import {
  copyGlobalTemplateToClientDocumentsUpload,
  type GlobalTemplateRow,
  isGlobalTemplateForPortalSignature,
} from "@/lib/copyGlobalTemplateToClientUpload";
import {
  displayClientNameFromRow,
  parseClientCustomFieldsData,
} from "@/lib/customFieldsTemplate";
import type { TemplateFieldRow } from "@/lib/agreementFormTemplateLayout";
import {
  applyCalculationsToDraft,
  evaluateCrmFormula,
} from "@/lib/crmFormulaEval";
import {
  crmAdminColumnSpanToGrid12,
  normalizeCrmFieldType,
  parseCrmSelectOptions,
  stringifyValueForCustomData,
} from "@/lib/crmFieldLayout";
import {
  CRM_CORE_FIELD_KEYS_FOR_OVERVIEW,
  customFieldSlugMapsToCoreFullName,
  labelForCoreKey,
  legacySlotsFromDefinitions,
  normalizeCoreSlotKey,
  type CrmLayoutSlotRow,
} from "@/lib/crmClientCardLayout";
import { isPostgrestMissingRelation } from "@/lib/postgrestSchema";

/** Grow fast billing page (office link). Query params: fullName, phone, description. */
const GROW_FAST_BILLING_BASE =
  "https://pay.grow.link/7b59e59dbe86b29700f79571b0c86fe7-MzAxMjIwNA";

function buildGrowFastBillingUrl(client: {
  full_name: string;
  phone: string | null;
}): string {
  const description = `שכר טרחה - ${client.full_name}`;
  return `${GROW_FAST_BILLING_BASE}?fullName=${encodeURIComponent(client.full_name)}&phone=${encodeURIComponent(client.phone ?? "")}&description=${encodeURIComponent(description)}`;
}

type ClientDetail = {
  id: string;
  short_id?: string | null;
  full_name: string;
  id_number: string;
  phone: string | null;
  status: string | null;
  status_id?: string | null;
  has_signed: boolean | null;
  signed_at: string | null;
  required_docs: unknown;
  /** Legacy numeric; mirrored from סכום כולל on save when total_amount is set */
  fee_amount?: number | null;
  /** טקסט להסכם (תבנית Word): {fee_upfront} */
  fee_upfront?: string | null;
  /** טקסט להסכם (תבנית Word): {fee_success} */
  fee_success?: string | null;
  /** סכום כולל — עמודה ייעודית (הרץ add_client_total_amount_payment_status.sql אם חסר) */
  total_amount?: number | null;
  /** פירוט תשלום / יתרה — למנהל בלבד (לא ב-PDF החתימה) */
  payment_status?: string | null;
  /** הערות להסכם — מוצגות ב-PDF לפני החתימה בפורטל */
  agreement_notes?: string | null;
  agreement_request_active?: boolean | null;
  agreement_source?: string | null;
  agreement_custom_pdf_path?: string | null;
  agreement_custom_pdf_filename?: string | null;
  agreement_aux_signed_at?: string | null;
  upload_request_active?: boolean | null;
  lead_source?: string | null;
  lead_provider_name?: string | null;
  /** Team profile who closed the deal (sales attribution). */
  closed_by?: string | null;
  agreement_template_ids?: string[] | null;
  agreement_template_sign_index?: number | null;
  /** Form layout template for portal (agreement_templates, legacy — רשת בפורטל בלי בלוק PDF). */
  agreement_structure_template_id?: string | null;
  /** תבנית חתימה מובנית (signature_templates) — בלוק «פרטים מהטופס» ב-PDF. */
  signature_template_id?: string | null;
  /** Doc reminder cadence: auto = every 3 days; manual = only at next_custom_reminder */
  reminder_mode?: "auto" | "manual" | string | null;
  next_custom_reminder?: string | null;
  /** When false, cron skips all automated reminder sends for this client. */
  reminders_enabled?: boolean | null;
  /** Dynamic field values keyed by slug (Word {{custom_slug}}). */
  custom_fields_data?: unknown;
};

type ClientStatusOption = {
  id: string;
  label: string;
  color_hex: string;
  sort_order: number;
  is_system: boolean;
  /** Omitted in DBs without add_client_statuses_is_active.sql */
  is_active?: boolean | null;
};

type CustomFieldSectionRow = {
  id: string;
  title: string;
  sort_order: number;
};

type CustomFieldDefinitionRow = {
  id: string;
  label: string;
  slug: string;
  field_type: string;
  section_id?: string | null;
  row_number?: number;
  column_span?: number;
  options?: unknown;
  formula?: string | null;
  sort_order?: number;
};

function buildEditCustomFieldsMap(
  client: ClientDetail,
  defs: readonly CustomFieldDefinitionRow[],
  cfvByDefId: Record<string, string>
): Record<string, string> {
  const parsed = parseClientCustomFieldsData(client.custom_fields_data);
  const next: Record<string, string> = {};
  for (const def of defs) {
    const defId = String(def.id);
    const fromTable = cfvByDefId[defId];
    const fromJson = parsed[def.slug] ?? "";
    next[def.slug] =
      fromTable !== undefined ? String(fromTable) : fromJson;
  }
  return next;
}

/** Read a scalar from the client row for dynamic core slots (snake_case + camelCase). */
function readClientScalarForLayout(
  client: ClientDetail,
  key: string
): string {
  const nk = normalizeCoreSlotKey(key) ?? key;
  const o = client as unknown as Record<string, unknown>;
  const candidates: string[] = [nk, key.trim()];
  if (nk.includes("_")) {
    const camel = nk.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
    if (camel !== nk) candidates.push(camel);
  }
  for (const cand of candidates) {
    if (!cand) continue;
    const v = o[cand];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
  }
  return "";
}

/** merged (JSON + defs + CFV) first when non-empty; else client row / scalar read (legacy-safe). */
function bridgedCoreFieldString(
  client: ClientDetail,
  merged: Record<string, string>,
  normalizedKey: string,
  rawCoreKey: string | null | undefined
): string {
  const raw = (rawCoreKey ?? "").trim();
  const keys = [normalizedKey, raw].filter(
    (x, i, a) => Boolean(x) && a.indexOf(x) === i
  ) as string[];
  for (const key of keys) {
    const mv = merged[key];
    if (mv !== undefined && String(mv).trim() !== "") return String(mv);
  }
  return readClientScalarForLayout(client, normalizedKey);
}

/**
 * CRM layout custom slots: `editCustomFieldsData` is seeded with "" per slug when JSON/CFV
 * is empty — `??` does not skip "", so we must fall through to merged then core `clients` columns.
 */
function crmFieldDisplayValueForLayout(
  client: ClientDetail,
  slug: string,
  editMap: Record<string, string>,
  mergedFromClient: Record<string, string>
): string {
  const editVal = editMap[slug];
  if (editVal !== undefined && String(editVal).trim() !== "") {
    return String(editVal);
  }
  const mergedVal = mergedFromClient[slug];
  if (mergedVal !== undefined && String(mergedVal).trim() !== "") {
    return String(mergedVal);
  }
  return readClientScalarForLayout(client, slug);
}

function customDefinitionsToTemplateRows(
  defs: CustomFieldDefinitionRow[]
): TemplateFieldRow[] {
  return defs.map((d) => ({
    id: d.id,
    row_number: d.row_number ?? 1,
    col_span: d.column_span ?? 4,
    sort_order: d.sort_order ?? 0,
    definition_id: d.id,
    definition: {
      label: d.label,
      slug: d.slug,
      field_type: d.field_type,
      options: d.options,
      formula: d.formula ?? null,
    },
  }));
}

/** High-contrast field module: white surface, sharp border, shadow, indigo accent bar. */
const CLIENT_FIELD_MODULE_CLASS =
  "relative overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-950";

const CLIENT_FIELD_MODULE_ACCENT =
  "pointer-events-none absolute right-0 top-0 bottom-0 z-[1] w-[3px] bg-indigo-500";

/** Descendant styles for inputs inside the module (borderless; frame provides edge). */
const CLIENT_FIELD_MODULE_INNER =
  "min-w-0 [&_input]:h-8 [&_input]:min-h-8 [&_input]:w-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-3 [&_input]:py-0 [&_input]:text-xs [&_input]:font-medium [&_input]:text-slate-800 [&_input]:shadow-none [&_input]:outline-none [&_input]:ring-0 [&_input]:placeholder:text-slate-400 [&_input]:focus:outline-none [&_input]:focus:ring-0 [&_select]:h-8 [&_select]:min-h-8 [&_select]:w-full [&_select]:cursor-pointer [&_select]:border-0 [&_select]:bg-transparent [&_select]:px-3 [&_select]:text-xs [&_select]:font-medium [&_select]:text-slate-800 [&_select]:shadow-none [&_select]:outline-none [&_select]:ring-0 [&_select]:focus:outline-none [&_select]:focus:ring-0 [&_textarea]:min-h-[2.75rem] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-xs [&_textarea]:font-medium [&_textarea]:text-slate-800 [&_textarea]:shadow-none [&_textarea]:outline-none [&_textarea]:ring-0 [&_textarea]:placeholder:text-slate-400 [&_textarea]:focus:outline-none [&_textarea]:focus:ring-0 dark:[&_input]:text-slate-100 dark:[&_select]:text-slate-100 dark:[&_textarea]:text-slate-100";

function ClientFieldModule({ children }: { children?: ReactNode | null }) {
  return (
    <div className={CLIENT_FIELD_MODULE_CLASS}>
      <span className={CLIENT_FIELD_MODULE_ACCENT} aria-hidden />
      <div className={CLIENT_FIELD_MODULE_INNER}>
        {children != null ? (
          children
        ) : (
          <input
            readOnly
            value=""
            tabIndex={-1}
            aria-label="שדה ריק"
            className="pointer-events-none opacity-50"
          />
        )}
      </div>
    </div>
  );
}

/** Plain controls for modals / rare use outside the module (still typographic match). */
const CLIENT_STRIP_CONTROL_CLASS =
  "h-8 min-h-8 w-full rounded-md border border-slate-300 bg-white px-3 py-0 text-xs font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const CLIENT_STRIP_TEXTAREA_CLASS =
  "min-h-[2.75rem] w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const CLIENT_FIELD_VALUE_CLASS =
  "px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100";

type ClientDetailFieldStripProps = {
  label?: string | null;
  /** When true, shows Word merge placeholder under the label (designer / advanced). */
  wordCode?: string | null;
  showWordCode?: boolean;
  children?: ReactNode | null;
};

function ClientDetailFieldStrip({
  label,
  wordCode,
  showWordCode = false,
  children,
}: ClientDetailFieldStripProps) {
  return (
    <div className="grid min-w-0 gap-1 text-start">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {label?.trim() ? label : "\u00A0"}
      </span>
      {showWordCode && wordCode ? (
        <code
          className="truncate font-mono text-[9px] leading-tight text-slate-400 dark:text-slate-500"
          dir="ltr"
          title={wordCode}
        >
          {wordCode}
        </code>
      ) : null}
      <ClientFieldModule>{children}</ClientFieldModule>
    </div>
  );
}

type ScheduledReminderUi = {
  id: string;
  client_id: string;
  scheduled_at: string;
  message: string;
  status: string;
  created_at: string;
  sent_at: string | null;
};

function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatClientNoteTimestamp(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PaymentRow = {
  id: string;
  amount: number | string;
  paid_on: string;
  method: string;
  description: string | null;
  created_at?: string | null;
};

type ClientNoteRow = {
  id: string;
  body: string;
  created_at: string;
};

function storagePathsFromDocRows(rows: DocRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of rows) {
    const p = resolveDocumentsUploadStoragePath(d.storage_path, d.file_url);
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** Next explicit `required_docs` after toggling one document type name (may be empty). */
function computeNextRequiredDocs(
  raw: unknown,
  docTypeName: string,
  wantChecked: boolean
): string[] {
  const current = new Set(effectiveRequiredDocNames(raw));
  if (wantChecked) {
    current.add(docTypeName);
  } else {
    current.delete(docTypeName);
  }
  return Array.from(current);
}

function isDocTypeCheckedForClient(
  clientRequiredRaw: unknown,
  docTypeName: string
): boolean {
  return effectiveRequiredDocNames(clientRequiredRaw).includes(docTypeName);
}

type ClientDetailMainTab =
  | "overview"
  | "agreements"
  | "requirements"
  | "payments"
  | "documents"
  | "notes"
  | "bot";
const CLIENT_DETAIL_TAB_STORAGE_KEY = "admin-client-detail-active-tab";

function isClientDetailMainTab(value: string): value is ClientDetailMainTab {
  return (
    value === "overview" ||
    value === "agreements" ||
    value === "requirements" ||
    value === "payments" ||
    value === "documents" ||
    value === "notes" ||
    value === "bot"
  );
}

function AdminClientDetailPageInner() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const clientId =
    typeof params?.clientId === "string" ? params.clientId : "";

  /** Tab switching is local state + `hidden` only — no URL params / no requests on switch. */
  const [activeTab, setActiveTab] = useState<ClientDetailMainTab>("overview");

  const realtimeReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /** Reset ?tab= when switching to another client (keeps deep links on first load). */
  const prevClientIdForTabResetRef = useRef<string | null>(null);
  /** Invalidate in-flight loadAll when navigating to another client. */
  const loadAllSeqRef = useRef(0);

  const [client, setClient] = useState<ClientDetail | null | undefined>(
    undefined
  );
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [clientStatuses, setClientStatuses] = useState<ClientStatusOption[]>(
    []
  );
  const [welcomeSending, setWelcomeSending] = useState(false);
  const [documentRequestSending, setDocumentRequestSending] = useState(false);
  const [docReminderSending, setDocReminderSending] = useState<string | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [agreementTemplates, setAgreementTemplates] = useState<
    AgreementTemplateRow[]
  >([]);
  const [signatureFormTemplates, setSignatureFormTemplates] = useState<
    { id: string; title: string }[]
  >([]);
  const [signatureTemplateBusy, setSignatureTemplateBusy] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [signatureRequestSending, setSignatureRequestSending] = useState(false);
  const [docAgreementPickerOpen, setDocAgreementPickerOpen] = useState(false);
  const [financeAgreementPickerOpen, setFinanceAgreementPickerOpen] =
    useState(false);
  const [agreementTemplateSearch, setAgreementTemplateSearch] = useState("");
  const [addingAgreementTemplateId, setAddingAgreementTemplateId] = useState<
    string | null
  >(null);
  const [customPdfBusy, setCustomPdfBusy] = useState(false);
  const [deleteAgreementBusy, setDeleteAgreementBusy] = useState(false);
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editIdNumber, setEditIdNumber] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLeadSource, setEditLeadSource] = useState("");
  const [editLeadProviderName, setEditLeadProviderName] = useState("");
  const [editClosedBy, setEditClosedBy] = useState("");
  const [closerProfileOptions, setCloserProfileOptions] = useState<
    { id: string; full_name: string | null }[]
  >([]);
  const [leadProviderOptions, setLeadProviderOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [leadProvidersLoadError, setLeadProvidersLoadError] = useState<
    string | null
  >(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [requiredDocsBusy, setRequiredDocsBusy] = useState(false);
  const [growBillingModalOpen, setGrowBillingModalOpen] = useState(false);
  const [freeMessageModalOpen, setFreeMessageModalOpen] = useState(false);
  const [freeMessageText, setFreeMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [growBillingAmount, setGrowBillingAmount] = useState("");
  const [growBillingDescription, setGrowBillingDescription] = useState("");
  const [signatureSetupMode, setSignatureSetupMode] = useState<
    "template" | "upload"
  >("template");
  const [togglingSigDocId, setTogglingSigDocId] = useState<string | null>(null);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [clientNotes, setClientNotes] = useState<ClientNoteRow[]>([]);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const [editTotalAmount, setEditTotalAmount] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState("");
  const [editFeeUpfront, setEditFeeUpfront] = useState("");
  const [editFeeSuccess, setEditFeeSuccess] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(
    null
  );
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentDate, setNewPaymentDate] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [newPaymentDescription, setNewPaymentDescription] = useState("");
  const [addPaymentBusy, setAddPaymentBusy] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(
    null
  );
  const [agreedFeeSaving, setAgreedFeeSaving] = useState(false);
  const [editAgreementNotes, setEditAgreementNotes] = useState("");
  const [agreementNotesSaving, setAgreementNotesSaving] = useState(false);
  const [customFieldSections, setCustomFieldSections] = useState<
    CustomFieldSectionRow[]
  >([]);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<
    CustomFieldDefinitionRow[]
  >([]);
  const [crmLayoutSlots, setCrmLayoutSlots] = useState<CrmLayoutSlotRow[]>(
    []
  );
  /** When false, overview shows skeleton cells until client row + CFV merge finishes for this client. */
  const [overviewFieldValuesReady, setOverviewFieldValuesReady] =
    useState(false);
  const [editCustomFieldsData, setEditCustomFieldsData] = useState<
    Record<string, string>
  >({});
  /** Optional `custom_field_values` table (per definition_id); merges into editor state. */
  const [customFieldValuesByDefinitionId, setCustomFieldValuesByDefinitionId] =
    useState<Record<string, string>>({});
  const [customFieldsSaving, setCustomFieldsSaving] = useState(false);

  const [scheduledReminders, setScheduledReminders] = useState<
    ScheduledReminderUi[]
  >([]);
  const [remindersLoadError, setRemindersLoadError] = useState<string | null>(
    null
  );
  const [reminderModeSelect, setReminderModeSelect] = useState<
    "auto" | "manual"
  >("auto");
  const [nextCustomReminderLocal, setNextCustomReminderLocal] = useState("");
  /** Checked = master switch off (`reminders_enabled` false). */
  const [autoRemindersOff, setAutoRemindersOff] = useState(false);
  const [reminderSettingsSaving, setReminderSettingsSaving] = useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [cancellingReminderId, setCancellingReminderId] = useState<string | null>(
    null
  );

  const loadReminders = useCallback(async () => {
    if (!clientId) return;
    setRemindersLoadError(null);
    const res = await fetch(
      `/api/admin/reminders?clientId=${encodeURIComponent(clientId)}`,
      { credentials: "include", cache: "no-store" }
    );
    let data: {
      reminders?: ScheduledReminderUi[];
      error?: string;
      hint?: string;
    } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const msg = data.hint
        ? `${data.error ?? "שגיאה"} — ${data.hint}`
        : (data.error ?? "טעינת תזכורות נכשלה");
      setRemindersLoadError(msg);
      setScheduledReminders([]);
      return;
    }
    setScheduledReminders(data.reminders ?? []);
  }, [clientId]);

  useEffect(() => {
    if (!client) return;
    const mode = client.reminder_mode === "manual" ? "manual" : "auto";
    setReminderModeSelect(mode);
    setNextCustomReminderLocal(
      isoToDatetimeLocalValue(client.next_custom_reminder ?? null)
    );
    setAutoRemindersOff(client.reminders_enabled === false);
  }, [
    client?.id,
    client?.reminder_mode,
    client?.next_custom_reminder,
    client?.reminders_enabled,
  ]);

  useEffect(() => {
    if (!client) return;
    const parsed = parseClientCustomFieldsData(client.custom_fields_data);
    const first =
      String(parsed.full_name ?? "").trim() ||
      client.full_name?.trim() ||
      "לקוח";
    setScheduleMessage(
      `שלום ${first}, רק מוודא שראית את ההודעה הקודמת שלנו...`
    );
  }, [client?.id, client?.full_name, client?.custom_fields_data]);

  useEffect(() => {
    if (!clientId || !client) return;
    void loadReminders();
  }, [clientId, client?.id, loadReminders]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!clientId) return;
    const prev = prevClientIdForTabResetRef.current;
    prevClientIdForTabResetRef.current = clientId;
    if (prev != null && prev !== clientId) {
      setActiveTab("overview");
      router.replace(`/admin/clients/${clientId}`, { scroll: false });
    }
  }, [clientId, router]);

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(
      `${CLIENT_DETAIL_TAB_STORAGE_KEY}:${clientId}`
    );
    if (saved && isClientDetailMainTab(saved)) {
      setActiveTab(saved);
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return;
    window.localStorage.setItem(
      `${CLIENT_DETAIL_TAB_STORAGE_KEY}:${clientId}`,
      activeTab
    );
  }, [clientId, activeTab]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("lead_providers")
        .select("id, name")
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setLeadProviderOptions([]);
        setLeadProvidersLoadError(error.message);
        return;
      }
      setLeadProvidersLoadError(null);
      setLeadProviderOptions((data ?? []) as { id: string; name: string }[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

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
    try {
      const res = await fetch(
        `/api/admin/client-statuses?t=${Date.now()}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );
      if (res.ok) {
        const raw = await res.text();
        let j: { statuses?: ClientStatusOption[]; error?: string };
        try {
          j = JSON.parse(raw) as { statuses?: ClientStatusOption[]; error?: string };
        } catch (e) {
          console.warn(
            "[Client Card] /api/admin/client-statuses JSON parse error:",
            e
          );
          return;
        }
        if (Array.isArray(j.statuses)) {
          setClientStatuses(sortClientStatusesByOrderAndLabel(j.statuses));
          return;
        }
      } else {
        if (process.env.NODE_ENV === "development") {
          const errText = await res.text().catch(() => "");
          console.warn(
            "[Client Card] /api/admin/client-statuses failed:",
            res.status,
            errText
          );
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[Client Card] client-statuses API fetch error:", e);
      }
    }
    const rows = await fetchActiveClientStatusesForCrmPickers(supabase);
    setClientStatuses(
      sortClientStatusesByOrderAndLabel(rows as ClientStatusOption[])
    );
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) void loadClientStatuses();
    };
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clientId, loadClientStatuses]);

  /** Forces a fresh <select> when the option list or client changes (empty → loaded). */
  const crmStatusSelectRenderKey = useMemo(
    () =>
      `${String(clientId ?? "")}:n=${clientStatuses.length}:ids=${[...clientStatuses]
        .map((s) => s.id)
        .sort()
        .join(",")}`,
    [clientId, clientStatuses]
  );

  const validStatusLabels = useMemo(
    () => new Set(clientStatuses.map((s) => s.label)),
    [clientStatuses]
  );

  const fallbackStatusLabel = useMemo(
    () =>
      clientStatuses.find((s) => s.label === CLIENT_CRM_STATUS_DEFAULT)
        ?.label ?? CLIENT_CRM_STATUS_DEFAULT,
    [clientStatuses]
  );

  const applyAdminClientGlobalCatalog = useCallback(
    (catalog: AdminClientGlobalCatalog) => {
      setDocumentTypes(catalog.documentTypes as DocumentTypeRow[]);
      setAgreementTemplates(
        catalog.agreementTemplates as AgreementTemplateRow[]
      );
      setSignatureFormTemplates(catalog.signatureFormTemplates);
      setCustomFieldSections(
        catalog.customFieldSections as CustomFieldSectionRow[]
      );
      setCustomFieldDefinitions(
        catalog.customFieldDefinitions as CustomFieldDefinitionRow[]
      );
      setCrmLayoutSlots(catalog.crmLayoutSlots);
    },
    []
  );

  useLayoutEffect(() => {
    if (!clientId) return;
    const snap = getAdminClientGlobalCatalogSnapshot();
    if (snap) applyAdminClientGlobalCatalog(snap);
  }, [clientId, applyAdminClientGlobalCatalog]);

  const loadAll = useCallback(async () => {
    if (!clientId) return;
    const seq = loadAllSeqRef.current;
    setLoadError(null);

    let catalog: AdminClientGlobalCatalog;
    let clientRes: {
      data: unknown;
      error: { message: string } | null;
    };
    try {
      const pair = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
        ensureAdminClientGlobalCatalog(supabase),
      ]);
      clientRes = pair[0];
      catalog = pair[1];
    } catch (e) {
      console.error("[admin client] loadAll (catalog/client):", e);
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      setClient(null);
      setOverviewFieldValuesReady(true);
      return;
    }

    if (seq !== loadAllSeqRef.current) return;

    applyAdminClientGlobalCatalog(catalog);

    const { data: cRow, error: cErr } = clientRes;

    if (seq !== loadAllSeqRef.current) return;

    if (cErr) {
      setLoadError(cErr.message);
      setClient(null);
      setOverviewFieldValuesReady(true);
      return;
    }
    if (!cRow) {
      setClient(null);
      setOverviewFieldValuesReady(true);
      return;
    }
    const rawRow = cRow as Record<string, unknown>;
    const merged = {
      ...(cRow as ClientDetail),
      full_name:
        rawRow.full_name != null
          ? String(rawRow.full_name)
          : rawRow.fullName != null
            ? String(rawRow.fullName)
            : "",
      id_number:
        rawRow.id_number != null
          ? String(rawRow.id_number)
          : rawRow.idNumber != null
            ? String(rawRow.idNumber)
            : "",
      phone:
        rawRow.phone == null || rawRow.phone === ""
          ? rawRow.Phone == null || rawRow.Phone === ""
            ? null
            : String(rawRow.Phone)
          : String(rawRow.phone),
    };
    const { data: dRows } = await supabase
      .from("documents")
      .select(
        "id, doc_type, file_url, original_filename, storage_path, name, status, needs_signature, signature_signed_at, signed_pdf_storage_path, created_at"
      )
      .eq("client_id", clientId);

    if (seq !== loadAllSeqRef.current) return;

    const docRows = (dRows ?? []) as DocRow[];

    if (seq !== loadAllSeqRef.current) return;

    const tplIdsForOrphan = normalizedAgreementTemplateIds(
      merged.agreement_template_ids
    );
    if (tplIdsForOrphan.length > 0) {
      const { data: tplCheck } = await supabase
        .from("templates")
        .select("id")
        .in("id", tplIdsForOrphan);
      const foundTpl = new Set(
        (tplCheck ?? []).map((r) => String((r as { id: string }).id))
      );
      const keptTplIds = tplIdsForOrphan.filter((id) => foundTpl.has(id));
      if (keptTplIds.length !== tplIdsForOrphan.length) {
        const idx = merged.agreement_template_sign_index ?? 0;
        const nextIdx =
          keptTplIds.length === 0
            ? 0
            : Math.min(idx, keptTplIds.length - 1);
        const { error: tplOrphanErr } = await supabase
          .from("clients")
          .update({
            agreement_template_ids:
              keptTplIds.length === 0 ? null : keptTplIds,
            agreement_template_sign_index: nextIdx,
          })
          .eq("id", clientId);
        if (!tplOrphanErr) {
          merged.agreement_template_ids =
            keptTplIds.length === 0 ? null : keptTplIds;
          merged.agreement_template_sign_index = nextIdx;
        }
      }
    }

    if (seq !== loadAllSeqRef.current) return;

    const complete = portalSignatureFullyComplete(docRows, merged);
    if (complete !== (merged.has_signed === true)) {
      const { error: syncErr } = await supabase
        .from("clients")
        .update({ has_signed: complete })
        .eq("id", clientId);
      if (!syncErr) {
        merged.has_signed = complete;
      }
    }

    if (seq !== loadAllSeqRef.current) return;

    setClient(merged);
    setDocs(docRows);
    /** Show שם / ת״ז / טלפון מיד — לא מחכים להערות/תשלומים/CFV (מניעת כרטיס ריק או סקלטון אינסופי). */
    setOverviewFieldValuesReady(true);

    if (seq === loadAllSeqRef.current) {
      try {
        const stRes = await fetch(
          `/api/admin/client-statuses?t=${Date.now()}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );
        if (stRes.ok) {
          const raw = await stRes.text();
          const stJson = (() => {
            try {
              return JSON.parse(raw) as { statuses?: ClientStatusOption[] };
            } catch (e) {
              console.warn(
                "[admin client] client_statuses JSON in loadAll:",
                e
              );
              return null;
            }
          })();
          if (
            stJson &&
            Array.isArray(stJson.statuses) &&
            seq === loadAllSeqRef.current
          ) {
            setClientStatuses(
              sortClientStatusesByOrderAndLabel(stJson.statuses)
            );
          }
        } else {
          const { data: stRows, error: stErr } = await supabase
            .from("client_statuses")
            .select("id, label, color_hex, sort_order, is_system")
            .order("sort_order", { ascending: true })
            .order("label", { ascending: true });
          if (seq === loadAllSeqRef.current) {
            if (stErr) {
              console.warn(
                "[admin client] client_statuses fallback (browser):",
                stErr.message
              );
            } else {
              setClientStatuses(
                sortClientStatusesByOrderAndLabel(
                  (stRows ?? []) as ClientStatusOption[]
                )
              );
            }
          }
        }
      } catch (e) {
        console.warn("[admin client] client_statuses fetch:", e);
        const { data: stRows } = await supabase
          .from("client_statuses")
          .select("id, label, color_hex, sort_order, is_system")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true });
        if (seq === loadAllSeqRef.current) {
          setClientStatuses(
            sortClientStatusesByOrderAndLabel(
              (stRows ?? []) as ClientStatusOption[]
            )
          );
        }
      }
    }

    /* Secondary loads — לא חוסמים את תצוגת הליבה */
    try {
      const [noteRes, payRes, cfvRes] = await Promise.all([
        supabase
          .from("client_notes")
          .select("id, body, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("id, amount, paid_on, method, description, created_at")
          .eq("client_id", clientId)
          .order("paid_on", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("custom_field_values")
          .select("definition_id, value_text")
          .eq("client_id", clientId),
      ]);

      if (seq !== loadAllSeqRef.current) return;

      if (noteRes.error) {
        console.warn(
          "[admin client] client_notes load:",
          noteRes.error.message
        );
        setClientNotes([]);
      } else {
        setClientNotes((noteRes.data ?? []) as ClientNoteRow[]);
      }

      if (payRes.error) {
        console.warn("[admin client] payments load:", payRes.error.message);
        setPayments([]);
      } else {
        setPayments((payRes.data ?? []) as PaymentRow[]);
      }

      let cfvByDefId: Record<string, string> = {};
      if (!cfvRes.error && cfvRes.data) {
        const m: Record<string, string> = {};
        for (const r of cfvRes.data) {
          const row = r as {
            definition_id: string;
            value_text?: string | null;
          };
          m[String(row.definition_id)] =
            row.value_text == null ? "" : String(row.value_text);
        }
        cfvByDefId = m;
        setCustomFieldValuesByDefinitionId(m);
      } else {
        if (
          cfvRes.error &&
          !isPostgrestMissingRelation(cfvRes.error)
        ) {
          console.warn(
            "[admin client] custom_field_values load:",
            cfvRes.error.message
          );
        }
        setCustomFieldValuesByDefinitionId({});
      }

      if (seq !== loadAllSeqRef.current) return;

      const defsForCustom =
        catalog.customFieldDefinitions as CustomFieldDefinitionRow[];
      setEditCustomFieldsData(
        buildEditCustomFieldsMap(merged, defsForCustom, cfvByDefId)
      );
    } catch (e) {
      console.error("[admin client] loadAll (notes/payments/cfv):", e);
      const defsForCustom =
        catalog.customFieldDefinitions as CustomFieldDefinitionRow[];
      setEditCustomFieldsData(
        buildEditCustomFieldsMap(merged, defsForCustom, {})
      );
    }
  }, [clientId, applyAdminClientGlobalCatalog]);

  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;

  const templateIdsKey =
    client?.agreement_template_ids?.join?.(",") ?? "";

  const portalSignatureAgreementTemplates = useMemo(
    () =>
      agreementTemplates.filter((t) =>
        isGlobalTemplateForPortalSignature({
          id: t.id,
          name: t.name,
          original_filename: t.original_filename,
          storage_path: t.storage_path ?? "",
        })
      ),
    [agreementTemplates]
  );

  const agreementTemplateNameSet = useMemo(
    () =>
      new Set(
        portalSignatureAgreementTemplates
          .map((t) => t.name.trim())
          .filter(Boolean)
      ),
    [portalSignatureAgreementTemplates]
  );

  useEffect(() => {
    if (!client) return;
    const raw = client.agreement_template_ids;
    const ids = Array.isArray(raw)
      ? raw.filter(
          (x): x is string => typeof x === "string" && x.trim() !== ""
        )
      : [];
    setSelectedTemplateIds(ids);
  }, [client?.id, templateIdsKey]);

  const orderedSelectedTemplateIds = useMemo(() => {
    return portalSignatureAgreementTemplates
      .map((t) => t.id)
      .filter((id) => selectedTemplateIds.includes(id));
  }, [portalSignatureAgreementTemplates, selectedTemplateIds]);

  /**
   * WhatsApp send-signature API requires `templates.id` values.
   * Prefer explicit selection, then match doc_type names to template names,
   * then IDs already on the client row, then a single fallback when docs await signature.
   */
  /** מסמכים מסומנים לחתימה — מאפשרים שליחת בקשה גם בלי תבנית גלובלית */
  const pendingSignatureDocsForWhatsApp = useMemo(
    () => pendingSignatureDocuments(docs),
    [docs]
  );

  const effectiveSignatureTemplateIdsForWhatsApp = useMemo(() => {
    if (orderedSelectedTemplateIds.length > 0) {
      return orderedSelectedTemplateIds;
    }
    const pending = docs.filter(
      (d) =>
        d.needs_signature === true &&
        !d.signature_signed_at?.trim() &&
        !d.signed_pdf_storage_path?.trim() &&
        documentRowHasUpload(d)
    );
    const pendingNames = new Set(
      pending.map((d) => (d.doc_type ?? "").trim()).filter(Boolean)
    );
    const fromDocTypeNames = portalSignatureAgreementTemplates
      .filter((t) => pendingNames.has(t.name.trim()))
      .map((t) => t.id);
    if (fromDocTypeNames.length > 0) {
      return fromDocTypeNames;
    }
    const fromClientRow = normalizedAgreementTemplateIds(
      client?.agreement_template_ids
    ).filter((id) =>
      portalSignatureAgreementTemplates.some((t) => t.id === id)
    );
    if (fromClientRow.length > 0) {
      return fromClientRow;
    }
    const anyPendingPortalSig = docs.some(
      (d) =>
        d.needs_signature === true &&
        !d.signature_signed_at?.trim() &&
        !d.signed_pdf_storage_path?.trim() &&
        documentRowHasUpload(d) &&
        documentRowEligibleForPortalSignature(d)
    );
    if (anyPendingPortalSig && portalSignatureAgreementTemplates.length > 0) {
      return [portalSignatureAgreementTemplates[0]!.id];
    }
    return [];
  }, [
    orderedSelectedTemplateIds,
    docs,
    portalSignatureAgreementTemplates,
    client?.agreement_template_ids,
  ]);

  const mergedCustomFieldsFromClient = useMemo(() => {
    if (!client) return {};
    const fromJson = parseClientCustomFieldsData(client.custom_fields_data);
    const fromDefs = buildEditCustomFieldsMap(
      client,
      customFieldDefinitions,
      customFieldValuesByDefinitionId
    );
    return { ...fromJson, ...fromDefs };
  }, [client, customFieldDefinitions, customFieldValuesByDefinitionId]);

  const clientDisplayName = useMemo(() => {
    if (client === undefined || client === null) return "";
    for (const def of customFieldDefinitions) {
      if (!customFieldSlugMapsToCoreFullName(def.slug)) continue;
      const v = String(mergedCustomFieldsFromClient[def.slug] ?? "").trim();
      if (v) return v;
    }
    return displayClientNameFromRow(client);
  }, [client, customFieldDefinitions, mergedCustomFieldsFromClient]);

  useLayoutEffect(() => {
    if (!client) return;
    const total =
      client.total_amount != null && !Number.isNaN(Number(client.total_amount))
        ? Number(client.total_amount)
        : client.fee_amount != null && !Number.isNaN(Number(client.fee_amount))
          ? Number(client.fee_amount)
          : null;
    setEditTotalAmount(total != null ? String(total) : "");
    setEditPaymentStatus(client.payment_status?.trim() ?? "");
    setEditFeeUpfront(client.fee_upfront?.trim() ?? "");
    setEditFeeSuccess(client.fee_success?.trim() ?? "");
    setEditAgreementNotes(
      bridgedCoreFieldString(
        client,
        mergedCustomFieldsFromClient,
        "agreement_notes",
        "agreement_notes"
      )
    );
  }, [
    client?.id,
    client?.total_amount,
    client?.fee_amount,
    client?.payment_status,
    client?.fee_upfront,
    client?.fee_success,
    client?.agreement_notes,
    mergedCustomFieldsFromClient,
  ]);

  useEffect(() => {
    if (!client) {
      setEditCustomFieldsData({});
      return;
    }
    const parsed = parseClientCustomFieldsData(client.custom_fields_data);
    const next: Record<string, string> = {};
    for (const def of customFieldDefinitions) {
      const defId = String(def.id);
      const fromTable = customFieldValuesByDefinitionId[defId];
      const fromJson = parsed[def.slug] ?? "";
      next[def.slug] =
        fromTable !== undefined ? String(fromTable) : fromJson;
    }
    setEditCustomFieldsData(next);
  }, [
    client?.id,
    client?.custom_fields_data,
    customFieldDefinitions,
    customFieldValuesByDefinitionId,
  ]);

  const sortedCustomFieldSections = useMemo(
    () =>
      [...customFieldSections].sort((a, b) => a.sort_order - b.sort_order),
    [customFieldSections]
  );

  const effectiveClientCardSlots = useMemo(() => {
    if (crmLayoutSlots.length > 0) return crmLayoutSlots;
    return legacySlotsFromDefinitions(customFieldDefinitions);
  }, [crmLayoutSlots, customFieldDefinitions]);

  const clientCardLayoutSectionsForOverview = useMemo(() => {
    const base = sortedCustomFieldSections;
    const seen = new Set(base.map((s) => s.id));
    const extra: CustomFieldSectionRow[] = [];
    for (const sl of effectiveClientCardSlots) {
      if (!seen.has(sl.section_id)) {
        seen.add(sl.section_id);
        extra.push({
          id: sl.section_id,
          title: "מודול פריסה",
          sort_order: 900_000 + extra.length,
        });
      }
    }
    return [...base, ...extra].sort((a, b) => a.sort_order - b.sort_order);
  }, [sortedCustomFieldSections, effectiveClientCardSlots]);

  /** פריסת מסך: שדות ליבה תמיד למעלה; רק מותאם/מפריד נשאר בקנבס למטה (בלי כפילות). */
  const overviewNonCoreSlots = useMemo(
    () =>
      effectiveClientCardSlots.filter(
        (s) => s.slot_kind === "custom" || s.slot_kind === "divider"
      ),
    [effectiveClientCardSlots]
  );

  const customFieldsBySection = useMemo(() => {
    const m = new Map<string | "null", CustomFieldDefinitionRow[]>();
    for (const s of sortedCustomFieldSections) m.set(s.id, []);
    m.set("null", []);
    for (const f of customFieldDefinitions) {
      const k = f.section_id ?? "null";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => {
        const ra = a.row_number ?? 0;
        const rb = b.row_number ?? 0;
        if (ra !== rb) return ra - rb;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
    }
    return m;
  }, [customFieldDefinitions, sortedCustomFieldSections]);

  const renderCrmCustomFieldControl = (def: CustomFieldDefinitionRow) => {
    const t = normalizeCrmFieldType(def.field_type);
    const slug = def.slug?.trim() ?? "";
    const val =
      client != null && slug !== ""
        ? crmFieldDisplayValueForLayout(
            client,
            slug,
            editCustomFieldsData,
            mergedCustomFieldsFromClient
          )
        : "";
    const setVal = (v: string) =>
      setEditCustomFieldsData((prev) => ({
        ...prev,
        [def.slug]: v,
      }));
    return (
      <div className="grid min-w-0 gap-1 text-start">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {def.label?.trim() ? def.label : "שדה"}
        </span>
        <ClientFieldModule>
          {t === "calculation" ? (
            <input
              type="text"
              value={(() => {
                try {
                  return evaluateCrmFormula(def.formula, editCustomFieldsData);
                } catch {
                  return "";
                }
              })()}
              readOnly
              tabIndex={-1}
              disabled={customFieldsSaving}
              className="cursor-default bg-slate-100/90 dark:bg-slate-800/50"
              dir="ltr"
              aria-readonly="true"
            />
          ) : t === "number" ? (
            <input
              type="text"
              inputMode="decimal"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              disabled={customFieldsSaving}
              className="disabled:opacity-60"
              dir="ltr"
            />
          ) : t === "date" ? (
            <input
              type="date"
              value={val.length >= 10 ? val.slice(0, 10) : val}
              onChange={(e) => setVal(e.target.value)}
              disabled={customFieldsSaving}
              className="disabled:opacity-60"
            />
          ) : t === "select" ? (
            <select
              value={val}
              onChange={(e) => setVal(e.target.value)}
              disabled={customFieldsSaving}
              className="cursor-pointer disabled:opacity-60"
            >
              <option value="">—</option>
              {parseCrmSelectOptions(def.options).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              disabled={customFieldsSaving}
              className="disabled:opacity-60"
            />
          )}
        </ClientFieldModule>
      </div>
    );
  };

  useEffect(() => {
    if (!clientId) return;
    loadAllSeqRef.current += 1;
    setClient(undefined);
    setLoadError(null);
    setDocs([]);
    setClientNotes([]);
    setPayments([]);
    setCustomFieldValuesByDefinitionId({});
    setOverviewFieldValuesReady(false);
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    void loadAllRef.current();
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    const ch = supabase
      .channel(`admin-client-docs-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          if (
            typeof document !== "undefined" &&
            document.visibilityState === "hidden"
          ) {
            return;
          }
          if (realtimeReloadTimerRef.current) {
            clearTimeout(realtimeReloadTimerRef.current);
          }
          realtimeReloadTimerRef.current = setTimeout(() => {
            realtimeReloadTimerRef.current = null;
            void loadAllRef.current();
          }, 1200);
        }
      )
      .subscribe();
    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
      void supabase.removeChannel(ch);
    };
  }, [clientId]);

  useEffect(() => {
    if (!client?.id || client.short_id?.trim()) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 16; i++) {
        const sid = generateClientShortId();
        const { error } = await supabase
          .from("clients")
          .update({ short_id: sid })
          .eq("id", client.id)
          .is("short_id", null);
        if (cancelled) return;
        if (!error) {
          setClient((c) => (c ? { ...c, short_id: sid } : c));
          return;
        }
        if (!isPostgresUniqueViolation(error)) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client?.id, client?.short_id]);

  const portalUrl = useMemo(() => {
    if (!clientId) return "";
    const sid = client?.short_id?.trim().toLowerCase() ?? "";
    const docsMode = client?.upload_request_active === true;
    let url: string;
    if (isValidShortIdParam(sid)) {
      try {
        url = docsMode
          ? whatsappPortalLinkFromShortIdWithMode(sid, "documents")
          : whatsappPortalLinkFromShortId(sid);
      } catch {
        const base = portalPublicBaseUrl().replace(/\/$/, "");
        url = `${base}/portal/${clientId}${docsMode ? "?mode=documents" : ""}`;
      }
    } else {
      const base = portalPublicBaseUrl().replace(/\/$/, "");
      url = `${base}/portal/${clientId}${docsMode ? "?mode=documents" : ""}`;
    }
    return url;
  }, [client?.short_id, client?.upload_request_active, clientId]);

  const copyPortalLink = () => {
    if (!portalUrl) return;
    void navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const executeStorageCleanup = async () => {
    if (!clientId) return;
    setCleanupBusy(true);
    try {
      const fromRows = storagePathsFromDocRows(docs);
      const fromBucket = await listAllDocumentsUploadPathsForClient(
        supabase,
        clientId
      );
      const allPaths = Array.from(new Set([...fromRows, ...fromBucket]));
      if (allPaths.length > 0) {
        const { error: rmErr } = await removeDocumentsUploadPaths(
          supabase,
          allPaths
        );
        if (rmErr) {
          setToast({
            type: "error",
            message: `מחיקה מהאחסון נכשלה: ${rmErr.message}`,
          });
          return;
        }
      }
      const { error: delErr } = await supabase
        .from("documents")
        .delete()
        .eq("client_id", clientId);
      if (delErr) {
        setToast({
          type: "error",
          message: `מחיקת רשומות מסמכים נכשלה: ${delErr.message}`,
        });
        return;
      }
      const { error: clearReqErr } = await supabase
        .from("clients")
        .update({ required_docs: null })
        .eq("id", clientId);
      if (clearReqErr) {
        setToast({
          type: "error",
          message: `מסמכים נמחקו אך ניקוי רשימת נדרשים נכשל: ${clearReqErr.message}`,
        });
        await loadAll();
        return;
      }
      setCleanupConfirmOpen(false);
      await loadAll();
      setToast({
        type: "success",
        message:
          allPaths.length > 0
            ? `נמחקו ${allPaths.length} קבצים מבאקט׳ documents-uploads ורשומות המסמכים הוסרו מהמערכת.`
            : "רשומות המסמכים הוסרו מהמערכת (לא נמצאו קבצים באחסון).",
      });
    } finally {
      setCleanupBusy(false);
    }
  };

  const handleCrmStatusChange = async (newStatusId: string) => {
    if (!client) return;
    const previous = client.status;
    const previousId = client.status_id ?? null;
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
      )?.label ?? previous;
    setClient({
      ...client,
      status_id: resolvedId,
      status: nextLabel ?? previous,
    });
    setStatusUpdating(true);
    const wasWaiting =
      (previous?.trim() === CLIENT_CRM_STATUS_DEFAULT) ||
      (clientStatuses.find(
        (s) => s.id.toLowerCase() === (client.status_id ?? "").toLowerCase()
      )?.label?.trim() === CLIENT_CRM_STATUS_DEFAULT);
    const isNowWaiting =
      (nextLabel?.trim() === CLIENT_CRM_STATUS_DEFAULT) ||
      (clientStatuses.find(
        (s) => s.id.toLowerCase() === resolvedId.toLowerCase()
      )?.label?.trim() === CLIENT_CRM_STATUS_DEFAULT);
    const leaveWaitingPipeline =
      wasWaiting && !isNowWaiting
        ? { upload_request_active: false, next_custom_reminder: null as null }
        : {};
    const { error } = await supabase
      .from("clients")
      .update({ status_id: resolvedId, ...leaveWaitingPipeline })
      .eq("id", client.id);
    setStatusUpdating(false);
    if (error) {
      setClient({ ...client, status: previous, status_id: previousId });
      setToast({
        type: "error",
        message: `עדכון סטטוס נכשל: ${error.message}`,
      });
      return;
    }
    setToast({ type: "success", message: "סטטוס הלקוח עודכן." });
    const labelForReview =
      typeof nextLabel === "string" && nextLabel.trim() ? nextLabel.trim() : "";
    console.info("[review-wa] client fetch", {
      clientId: client.id,
      crmStatusId: resolvedId,
      crmStatusLabel: labelForReview || undefined,
    });
    void fetch("/api/whatsapp/send-license-granted-review", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: client.id,
        crmStatusId: resolvedId,
        ...(labelForReview ? { crmStatusLabel: labelForReview } : {}),
      }),
      keepalive: true,
    }).catch(() => {});
  };

  const openDetailsEdit = () => {
    if (!client) return;
    setEditFullName(client.full_name);
    setEditIdNumber(client.id_number);
    setEditPhone(client.phone?.trim() ?? "");
    setEditLeadSource(client.lead_source?.trim() ?? "");
    setEditLeadProviderName(client.lead_provider_name?.trim() ?? "");
    setEditClosedBy(client.closed_by?.trim() ?? "");
    setDetailsEditing(true);
  };

  const saveClientDetails = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client) return;
    const full_name = editFullName.trim();
    const id_number = editIdNumber.trim();
    const phone = editPhone.trim();
    const lead_source = editLeadSource.trim() || null;
    const lead_provider_name = editLeadProviderName.trim() || null;
    const closed_by = editClosedBy.trim() || null;
    if (!full_name || !id_number) {
      setToast({
        type: "error",
        message: "יש למלא שם מלא ומספר תעודת זהות.",
      });
      return;
    }
    const parsedNames = parseClientCustomFieldsData(client.custom_fields_data);
    for (const def of customFieldDefinitions) {
      if (customFieldSlugMapsToCoreFullName(def.slug)) {
        parsedNames[def.slug] = full_name;
      }
    }
    const custom_fields_data = applyCalculationsToDraft(
      parsedNames,
      customDefinitionsToTemplateRows(customFieldDefinitions)
    );
    setDetailsSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        full_name,
        id_number,
        phone: phone || null,
        lead_source,
        lead_provider_name,
        closed_by,
        custom_fields_data,
      })
      .eq("id", client.id);
    setDetailsSaving(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    const nameCfvRows = customFieldDefinitions
      .filter((def) => customFieldSlugMapsToCoreFullName(def.slug))
      .map((def) => ({
        client_id: client.id,
        definition_id: def.id,
        value_text: full_name,
      }));
    if (nameCfvRows.length > 0) {
      const { error: cfvErr } = await supabase
        .from("custom_field_values")
        .upsert(nameCfvRows, { onConflict: "client_id,definition_id" });
      if (cfvErr && !isPostgrestMissingRelation(cfvErr)) {
        setToast({ type: "error", message: cfvErr.message });
        return;
      }
      if (!cfvErr) {
        setCustomFieldValuesByDefinitionId((prev) => {
          const next = { ...prev };
          for (const def of customFieldDefinitions) {
            if (customFieldSlugMapsToCoreFullName(def.slug)) {
              next[String(def.id)] = full_name;
            }
          }
          return next;
        });
      }
    }
    setClient({
      ...client,
      full_name,
      id_number,
      phone: phone || null,
      lead_source,
      lead_provider_name,
      closed_by,
      custom_fields_data,
    });
    setDetailsEditing(false);
    setToast({ type: "success", message: "פרטי הלקוח נשמרו." });
  };

  const saveAgreementNotes = async () => {
    if (!client) return;
    const agreement_notes = editAgreementNotes.trim() || null;
    setAgreementNotesSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({ agreement_notes })
      .eq("id", client.id);
    setAgreementNotesSaving(false);
    if (error) {
      if (error.message.includes("agreement_notes")) {
        setToast({
          type: "error",
          message: `${error.message} — הריצו ב-Supabase את הקובץ add_client_agreement_notes.sql`,
        });
      } else {
        setToast({ type: "error", message: error.message });
      }
      return;
    }
    setClient({ ...client, agreement_notes });
    setToast({ type: "success", message: "הערות להסכם נשמרו." });
  };

  const saveCustomFields = async () => {
    if (!client) return;
    const payload: Record<string, string> = {
      ...parseClientCustomFieldsData(client.custom_fields_data),
    };
    for (const def of customFieldDefinitions) {
      if (normalizeCrmFieldType(def.field_type) === "calculation") continue;
      const raw = editCustomFieldsData[def.slug] ?? "";
      payload[def.slug] = stringifyValueForCustomData(
        normalizeCrmFieldType(def.field_type),
        raw
      ).trim();
    }
    const merged = applyCalculationsToDraft(
      payload,
      customDefinitionsToTemplateRows(customFieldDefinitions)
    );

    let syncedFullName: string | null = null;
    for (const def of customFieldDefinitions) {
      if (!customFieldSlugMapsToCoreFullName(def.slug)) continue;
      if (normalizeCrmFieldType(def.field_type) === "calculation") continue;
      const t = String(merged[def.slug] ?? "").trim();
      if (t) {
        syncedFullName = t;
        break;
      }
    }

    const clientPatch: Record<string, unknown> = { custom_fields_data: merged };
    if (syncedFullName) {
      clientPatch.full_name = syncedFullName;
    }

    setCustomFieldsSaving(true);
    const { error } = await supabase
      .from("clients")
      .update(clientPatch)
      .eq("id", client.id);
    setCustomFieldsSaving(false);
    if (error) {
      if (error.message.includes("custom_fields_data")) {
        setToast({
          type: "error",
          message: `${error.message} — הריצו ב-Supabase את add_custom_fields.sql`,
        });
      } else {
        setToast({ type: "error", message: error.message });
      }
      return;
    }

    const cfvRows = customFieldDefinitions
      .filter((def) => normalizeCrmFieldType(def.field_type) !== "calculation")
      .map((def) => ({
        client_id: client.id,
        definition_id: def.id,
        value_text: String(merged[def.slug] ?? ""),
      }));
    if (cfvRows.length > 0) {
      const { error: cfvErr } = await supabase
        .from("custom_field_values")
        .upsert(cfvRows, { onConflict: "client_id,definition_id" });
      if (cfvErr && !isPostgrestMissingRelation(cfvErr)) {
        setToast({ type: "error", message: cfvErr.message });
        return;
      }
      if (!cfvErr) {
        const nextCfv: Record<string, string> = {
          ...customFieldValuesByDefinitionId,
        };
        for (const def of customFieldDefinitions) {
          if (normalizeCrmFieldType(def.field_type) === "calculation") continue;
          nextCfv[String(def.id)] = String(merged[def.slug] ?? "");
        }
        setCustomFieldValuesByDefinitionId(nextCfv);
      }
    }

    setClient({
      ...client,
      custom_fields_data: merged,
      ...(syncedFullName ? { full_name: syncedFullName } : {}),
    });
    setToast({ type: "success", message: "שדות מותאמים נשמרו." });
  };

  const submitClientNote = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!clientId || !newNoteBody.trim()) return;
    setNoteSubmitting(true);
    try {
      const { error } = await supabase.from("client_notes").insert({
        client_id: clientId,
        body: newNoteBody.trim(),
      });
      if (error) {
        setToast({ type: "error", message: error.message });
        return;
      }
      setNewNoteBody("");
      await loadAll();
      setToast({ type: "success", message: "ההערה נשמרה." });
    } finally {
      setNoteSubmitting(false);
    }
  };

  const savePaymentFields = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client) return;
    const rawTotal = editTotalAmount.trim().replace(/,/g, "").replace(/\s/g, "");
    let total_amount: number | null = null;
    let fee_amount: number | null = null;
    if (rawTotal !== "") {
      const n = Number(rawTotal);
      if (!Number.isFinite(n)) {
        setToast({
          type: "error",
          message: "סכום כולל חייב להיות מספר תקין.",
        });
        return;
      }
      total_amount = n;
      fee_amount = n;
    }
    const payment_status = editPaymentStatus.trim() || null;
    const fee_upfront = editFeeUpfront.trim() || null;
    const fee_success = editFeeSuccess.trim() || null;

    setPaymentSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        total_amount,
        payment_status,
        fee_upfront,
        fee_success,
        fee_amount,
      })
      .eq("id", client.id);
    setPaymentSaving(false);
    if (error) {
      if (
        error.message.includes("total_amount") ||
        error.message.includes("payment_status")
      ) {
        setToast({
          type: "error",
          message: `${error.message} — הריצו ב-Supabase את הקובץ add_client_total_amount_payment_status.sql`,
        });
      } else {
        setToast({ type: "error", message: error.message });
      }
      return;
    }
    setClient({
      ...client,
      total_amount,
      payment_status,
      fee_upfront,
      fee_success,
      fee_amount,
    });
    setToast({ type: "success", message: "נתוני תשלום נשמרו." });
  };

  const saveAgreedContractFee = async () => {
    if (!client) return;
    const rawTotal = editTotalAmount.trim().replace(/,/g, "").replace(/\s/g, "");
    let total_amount: number | null = null;
    let fee_amount: number | null = null;
    if (rawTotal !== "") {
      const n = Number(rawTotal);
      if (!Number.isFinite(n)) {
        setToast({
          type: "error",
          message: "סכום חייב להיות מספר תקין.",
        });
        return;
      }
      total_amount = n;
      fee_amount = n;
    }
    setAgreedFeeSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({ total_amount, fee_amount })
      .eq("id", client.id);
    setAgreedFeeSaving(false);
    if (error) {
      if (error.message.includes("total_amount")) {
        setToast({
          type: "error",
          message: `${error.message} — הריצו ב-Supabase את הקובץ add_client_total_amount_payment_status.sql`,
        });
      } else {
        setToast({ type: "error", message: error.message });
      }
      return;
    }
    setClient({ ...client, total_amount, fee_amount });
    setToast({ type: "success", message: "סך שכר הטרחה המוסכם נשמר." });
  };

  const closeAddPaymentModal = () => {
    if (addPaymentBusy) return;
    setAddPaymentOpen(false);
    setEditingPaymentId(null);
  };

  const openAddPaymentModal = () => {
    setEditingPaymentId(null);
    setNewPaymentAmount("");
    setNewPaymentDate(new Date().toISOString().slice(0, 10));
    setNewPaymentMethod("");
    setNewPaymentDescription("");
    setAddPaymentOpen(true);
  };

  const openEditPaymentModal = (p: PaymentRow) => {
    const amt = Number(p.amount);
    setEditingPaymentId(p.id);
    setNewPaymentAmount(
      Number.isFinite(amt) ? String(amt) : String(p.amount ?? "")
    );
    setNewPaymentDate(
      p.paid_on?.trim() || new Date().toISOString().slice(0, 10)
    );
    setNewPaymentMethod(p.method?.trim() ?? "");
    setNewPaymentDescription(p.description?.trim() ?? "");
    setAddPaymentOpen(true);
  };

  const deletePaymentRow = async (p: PaymentRow) => {
    if (!client) return;
    if (
      !window.confirm(
        "למחוק את רשומת התשלום? הפעולה אינה ניתנת לביטול."
      )
    ) {
      return;
    }
    setDeletingPaymentId(p.id);
    const { error } = await supabase
      .from("payments")
      .delete()
      .eq("id", p.id)
      .eq("client_id", client.id);
    setDeletingPaymentId(null);
    if (error) {
      if (
        error.message.includes("payments") ||
        error.code === "42P01"
      ) {
        setToast({
          type: "error",
          message: `${error.message} — הריצו ב-Supabase את הקובץ add_payments_table.sql`,
        });
      } else {
        setToast({ type: "error", message: error.message });
      }
      return;
    }
    if (editingPaymentId === p.id) {
      closeAddPaymentModal();
    }
    setToast({ type: "success", message: "התשלום נמחק." });
    await loadAll();
  };

  const submitNewPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client) return;
    const rawAmt = newPaymentAmount.trim().replace(/,/g, "").replace(/\s/g, "");
    const amount = Number(rawAmt);
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast({ type: "error", message: "יש להזין סכום חיובי." });
      return;
    }
    const paid_on = newPaymentDate.trim();
    if (!paid_on) {
      setToast({ type: "error", message: "יש לבחור תאריך תשלום." });
      return;
    }
    setAddPaymentBusy(true);
    const row = {
      amount,
      paid_on,
      method: newPaymentMethod.trim(),
      description: newPaymentDescription.trim() || null,
    };
    const paymentIdForUpdate = editingPaymentId;
    const { error } = paymentIdForUpdate
      ? await supabase
          .from("payments")
          .update(row)
          .eq("id", paymentIdForUpdate)
          .eq("client_id", client.id)
      : await supabase.from("payments").insert({
          client_id: client.id,
          ...row,
        });
    setAddPaymentBusy(false);
    if (error) {
      if (
        error.message.includes("payments") ||
        error.code === "42P01"
      ) {
        setToast({
          type: "error",
          message: `${error.message} — הריצו ב-Supabase את הקובץ add_payments_table.sql`,
        });
      } else {
        setToast({ type: "error", message: error.message });
      }
      return;
    }
    const wasEdit = Boolean(paymentIdForUpdate);
    closeAddPaymentModal();
    setToast({
      type: "success",
      message: wasEdit ? "התשלום עודכן." : "התשלום נרשם.",
    });
    await loadAll();
  };

  const openGrowBillingModal = () => {
    if (!client) return;
    setGrowBillingAmount("");
    setGrowBillingDescription(`שכר טרחה - ${client.full_name}`);
    setGrowBillingModalOpen(true);
  };

  const closeGrowBillingModal = () => {
    setGrowBillingModalOpen(false);
  };

  const handleContinueToGrow = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client) return;
    const amount = growBillingAmount.trim();
    const desc = growBillingDescription.trim();
    if (!amount) {
      setToast({ type: "error", message: "יש להזין סכום לחיוב." });
      return;
    }
    const payload = {
      n: client.full_name,
      p: client.phone ?? "",
      i: client.id_number,
      a: amount,
      d: desc || `שכר טרחה - ${client.full_name}`,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
    } catch {
      setToast({
        type: "error",
        message: "העתקה ללוח נכשלה. אשרו הרשאת לוח או נסו שוב.",
      });
      return;
    }
    window.open(GROW_FAST_BILLING_BASE, "_blank", "noopener,noreferrer");
    closeGrowBillingModal();
    setToast({
      type: "success",
      message: "הנתונים הועתקו ללוח — דף Grow נפתח בטאב חדש.",
    });
  };

  const handleRequiredDocToggle = async (
    docTypeName: string,
    nextChecked: boolean
  ) => {
    if (!client || requiredDocsBusy) return;
    const next = computeNextRequiredDocs(
      client.required_docs,
      docTypeName,
      nextChecked
    );
    const prev = client.required_docs;
    setClient({
      ...client,
      required_docs: next,
      ...(nextChecked ? { upload_request_active: true } : {}),
    });
    setRequiredDocsBusy(true);
    const { error } = await supabase
      .from("clients")
      .update({
        required_docs: next,
        ...(nextChecked ? { upload_request_active: true } : {}),
      })
      .eq("id", client.id);
    setRequiredDocsBusy(false);
    if (error) {
      setClient({ ...client, required_docs: prev });
      setToast({ type: "error", message: error.message });
    }
  };

  const sendDocumentRequestToClient = async () => {
    if (!clientId) return;
    setDocumentRequestSending(true);
    try {
      const res = await fetch("/api/whatsapp/send-document-request", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      let data: { error?: string; portalLink?: string } = {};
      try {
        data = (await res.json()) as { error?: string };
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error ?? "שליחת דרישת מסמכים נכשלה",
        });
        return;
      }
      setToast({
        type: "success",
        message:
          "נשלחה הודעת WhatsApp והופעל שלב העלאת מסמכים בפורטל הלקוח.",
      });
      await loadAll();
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setDocumentRequestSending(false);
    }
  };

  const sendWelcome = async () => {
    if (!clientId) return;
    setWelcomeSending(true);
    try {
      const res = await fetch("/api/whatsapp/send-welcome", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      let data: { error?: string; portalLink?: string } = {};
      try {
        data = (await res.json()) as { error?: string; portalLink?: string };
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
      setWelcomeSending(false);
    }
  };

  const openFreeMessageModal = () => {
    setFreeMessageText("");
    setFreeMessageModalOpen(true);
  };

  const appendFreeMessageTemplate = (line: string) => {
    setFreeMessageText((prev) => {
      const t = prev.trimEnd();
      return t ? `${t}\n${line}` : line;
    });
  };

  const handleFreeMessageFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void submitFreeMessageViaGreen();
  };

  const submitFreeMessageViaGreen = async () => {
    if (!clientId || !client) return;
    const text = freeMessageText.trim();
    if (!text) {
      setToast({ type: "error", message: "הזינו טקסט להודעה." });
      return;
    }
    if (!freeMessagePhoneOk) {
      setToast({
        type: "error",
        message: "מספר הטלפון לא בפורמט תקין לשליחה (נדרש מספר ישראלי).",
      });
      return;
    }
    setIsSending(true);
    try {
      const res = await fetch("/api/whatsapp/send-free-message", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, message: text }),
      });
      let data: { error?: string; sent?: boolean } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error ?? "שליחת ההודעה נכשלה",
        });
        return;
      }
      setFreeMessageModalOpen(false);
      setFreeMessageText("");
      await loadAll();
      setToast({
        type: "success",
        message:
          "ההודעה נשלחה ב־WhatsApp. זמן התזכורת האחרון עודכן ומצב התזכורות הוגדר לאוטומטי.",
      });
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setIsSending(false);
    }
  };

  /** תזכורת WhatsApp על מסמך חסר — חייב להישאר על send-doc-reminder, לא על send-signature-request */
  const sendDocReminder = async (missingDocName: string) => {
    if (!clientId) return;
    setDocReminderSending(missingDocName);
    try {
      const res = await fetch("/api/whatsapp/send-doc-reminder", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, missingDocName }),
      });
      let data: { error?: string; portalLink?: string } = {};
      try {
        data = (await res.json()) as { error?: string; portalLink?: string };
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error ?? "שליחת תזכורת נכשלה",
        });
        return;
      }
      setToast({
        type: "success",
        message: "תזכורת למסמך נשלחה ב־WhatsApp.",
      });
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setDocReminderSending(null);
    }
  };

  const saveReminderModeSettings = async () => {
    if (!clientId) return;
    setReminderSettingsSaving(true);
    try {
      let nextIso: string | null = null;
      if (reminderModeSelect === "manual") {
        if (!nextCustomReminderLocal.trim()) {
          setToast({
            type: "error",
            message: "בחרו תאריך ושעה למצב ידני.",
          });
          return;
        }
        const d = new Date(nextCustomReminderLocal);
        if (Number.isNaN(d.getTime())) {
          setToast({ type: "error", message: "תאריך לא תקין." });
          return;
        }
        nextIso = d.toISOString();
      }
      const res = await fetch("/api/admin/reminders", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "settings",
          clientId,
          reminderMode: reminderModeSelect,
          nextCustomReminder: reminderModeSelect === "manual" ? nextIso : null,
          remindersEnabled: !autoRemindersOff,
        }),
      });
      let data: { error?: string; hint?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.hint
            ? `${data.error ?? "שמירה נכשלה"} — ${data.hint}`
            : (data.error ?? "שמירה נכשלה"),
        });
        return;
      }
      setToast({ type: "success", message: "מצב התזכורות נשמר." });
      await loadAll();
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setReminderSettingsSaving(false);
    }
  };

  const scheduleManualWhatsAppReminder = async () => {
    if (!clientId) return;
    if (!scheduleAtLocal.trim()) {
      setToast({ type: "error", message: "בחרו תאריך ושעה לשליחה." });
      return;
    }
    if (!scheduleMessage.trim()) {
      setToast({ type: "error", message: "הזינו טקסט להודעה." });
      return;
    }
    const when = new Date(scheduleAtLocal);
    if (Number.isNaN(when.getTime())) {
      setToast({ type: "error", message: "תאריך לא תקין." });
      return;
    }
    if (when.getTime() < Date.now() - 60_000) {
      setToast({ type: "error", message: "בחרו זמן בעתיד." });
      return;
    }
    setScheduleSubmitting(true);
    try {
      const res = await fetch("/api/admin/reminders", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "schedule",
          clientId,
          scheduledAt: when.toISOString(),
          message: scheduleMessage.trim(),
        }),
      });
      let data: { error?: string; hint?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.hint
            ? `${data.error ?? "תזמון נכשל"} — ${data.hint}`
            : (data.error ?? "תזמון נכשל"),
        });
        return;
      }
      setToast({
        type: "success",
        message:
          "התזכורת נשמרה. השליחה תתבצע אוטומטית מהשרת (פרודקשן) סמוך למועד — עד כ־5 דקות אחריו.",
      });
      await loadReminders();
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const cancelScheduledReminder = async (reminderId: string) => {
    setCancellingReminderId(reminderId);
    try {
      const res = await fetch(
        `/api/admin/reminders?id=${encodeURIComponent(reminderId)}`,
        { method: "DELETE", credentials: "include", cache: "no-store" }
      );
      let data: { error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error ?? "ביטול התזכורת נכשל",
        });
        return;
      }
      setToast({ type: "success", message: "התזכורת בוטלה." });
      await loadReminders();
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setCancellingReminderId(null);
    }
  };

  const addAgreementFromTemplate = useCallback(
    async (tpl: AgreementTemplateRow) => {
      if (!client) return;
      setAddingAgreementTemplateId(tpl.id);
      try {
        const globalRow: GlobalTemplateRow = {
          id: tpl.id,
          name: tpl.name,
          original_filename: tpl.original_filename,
          storage_path: tpl.storage_path ?? "",
        };
        const copied = await copyGlobalTemplateToClientDocumentsUpload(
          supabase,
          client.id,
          globalRow
        );
        if ("error" in copied) {
          setToast({ type: "error", message: copied.error });
          return;
        }
        const { error: insErr } = await supabase.from("documents").insert({
          client_id: client.id,
          doc_type: tpl.name,
          status: "uploaded",
          file_url: copied.publicUrl,
          storage_path: copied.storagePath,
          original_filename: copied.originalFilename,
          needs_signature: true,
        });
        if (insErr) {
          setToast({ type: "error", message: insErr.message });
          return;
        }
        const existingIds = normalizedAgreementTemplateIds(
          client.agreement_template_ids
        );
        const nextIds = existingIds.includes(tpl.id)
          ? existingIds
          : [...existingIds, tpl.id];
        const { error: upCl } = await supabase
          .from("clients")
          .update({
            agreement_request_active: true,
            agreement_template_ids: nextIds.length > 0 ? nextIds : null,
          })
          .eq("id", client.id);
        if (upCl) {
          setToast({
            type: "error",
            message: `נוצר המסמך; עדכון תבניות הלקוח נכשל: ${upCl.message}`,
          });
          await loadAll();
          return;
        }
        setClient({
          ...client,
          agreement_request_active: true,
          agreement_template_ids: nextIds.length > 0 ? nextIds : null,
        });
        setDocAgreementPickerOpen(false);
        setFinanceAgreementPickerOpen(false);
        setAgreementTemplateSearch("");
        setToast({
          type: "success",
          message: `נוסף "${tpl.name}" לתיק — ממתין לחתימה בפורטל.`,
        });
        await loadAll();
      } finally {
        setAddingAgreementTemplateId(null);
      }
    },
    [client, loadAll]
  );

  const sendSignatureRequestWhatsApp = async (previewOnly = false) => {
    if (!clientId) return;
    if (
      effectiveSignatureTemplateIdsForWhatsApp.length === 0 &&
      pendingSignatureDocsForWhatsApp.length === 0
    ) {
      setToast({
        type: "error",
        message:
          "אין תבנית או מסמך לחתימה — הוסיפו הסכם מתבנית או סמנו מסמך לחתימה בטאב מסמכים.",
      });
      return;
    }
    setSignatureRequestSending(true);
    try {
      const res = await fetch("/api/whatsapp/send-signature-request", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          templateIds:
            effectiveSignatureTemplateIdsForWhatsApp.length > 0
              ? effectiveSignatureTemplateIdsForWhatsApp
              : [],
          previewOnly,
          previewPortalBaseUrl:
            previewOnly && typeof window !== "undefined"
              ? window.location.origin
              : undefined,
        }),
      });
      let data: { error?: string; portalLink?: string } = {};
      try {
        data = (await res.json()) as { error?: string; portalLink?: string };
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error ?? "שליחת בקשת חתימה נכשלה",
        });
        return;
      }
      setToast({
        type: "success",
        message:
          previewOnly
            ? "בוצעה בדיקת חתימה מקומית בהצלחה (ללא שליחת WhatsApp)."
            : "נשלחה הודעת WhatsApp עם קישור לפורטל; בקשת החתימה הופעלה.",
      });
      if (previewOnly && data.portalLink) {
        window.open(data.portalLink, "_blank", "noopener,noreferrer");
      }
      await loadAll();
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setSignatureRequestSending(false);
    }
  };

  const toggleNeedsSignatureForDoc = async (doc: DocRow) => {
    if (!client) return;
    if (!documentRowHasUpload(doc)) {
      setToast({
        type: "error",
        message: "יש להעלות קובץ לפני סימון לחתימה.",
      });
      return;
    }
    if (!documentRowEligibleForPortalSignature(doc)) {
      setToast({
        type: "error",
        message:
          "לחתימה בפורטל ניתן לסמן רק קובץ PDF או Word ‎(.docx) (לפי שם הקובץ או נתיב האחסון).",
      });
      return;
    }
    const next = !doc.needs_signature;
    setTogglingSigDocId(doc.id);
    try {
      const hasFile =
        Boolean(doc.file_url?.trim()) || Boolean(doc.storage_path?.trim());
      const status = hasFile ? "uploaded" : "pending";
      const payload: Record<string, unknown> = {
        needs_signature: next,
        status,
      };
      if (next) {
        payload.signature_signed_at = null;
        payload.signed_pdf_storage_path = null;
      } else {
        payload.signature_signed_at = doc.signature_signed_at ?? null;
        payload.signed_pdf_storage_path = doc.signed_pdf_storage_path ?? null;
      }

      const { error: upErr } = await supabase
        .from("documents")
        .update(payload)
        .eq("id", doc.id)
        .eq("client_id", client.id);
      if (upErr) {
        setToast({ type: "error", message: upErr.message });
        return;
      }

      if (next) {
        const { error: cErr } = await supabase
          .from("clients")
          .update({ agreement_request_active: true })
          .eq("id", client.id);
        if (cErr) {
          setToast({ type: "error", message: cErr.message });
          return;
        }
      }

      await loadAll();
      setToast({
        type: "success",
        message: next
          ? "המסמך סומן לחתימה בפורטל."
          : "הוסר סימון חתימה מהמסמך.",
      });
    } finally {
      setTogglingSigDocId(null);
    }
  };

  const handleCustomAgreementPdf = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !client) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setToast({ type: "error", message: "יש להעלות קובץ PDF בלבד." });
      return;
    }
    setCustomPdfBusy(true);
    const objectName = timestampedStorageObjectName(file.name);
    const path = `${client.id}/${uniqueDocumentsUploadFolderSegment()}/${objectName}`;
    const { error: upErr } = await supabase.storage
      .from(DOCUMENTS_UPLOAD_BUCKET)
      .upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) {
      setCustomPdfBusy(false);
      setToast({
        type: "error",
        message: `העלאה נכשלה: ${upErr.message}. ודאו שקיים באקט׳ documents-uploads.`,
      });
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(DOCUMENTS_UPLOAD_BUCKET).getPublicUrl(path);
    const { error: insErr } = await supabase.from("documents").insert({
      client_id: client.id,
      doc_type: ADMIN_OFFICE_AGREEMENT_DOC_TYPE,
      status: "uploaded",
      file_url: publicUrl,
      storage_path: path,
      original_filename: file.name,
      needs_signature: true,
    });
    if (insErr) {
      setCustomPdfBusy(false);
      setToast({ type: "error", message: insErr.message });
      return;
    }
    const { error: dbErr } = await supabase
      .from("clients")
      .update({
        agreement_request_active: true,
        agreement_source: "from_document",
        agreement_custom_pdf_path: null,
        agreement_custom_pdf_filename: null,
      })
      .eq("id", client.id);
    setCustomPdfBusy(false);
    if (dbErr) {
      setToast({ type: "error", message: dbErr.message });
      return;
    }
    setClient({
      ...client,
      agreement_request_active: true,
      agreement_source: "from_document",
      agreement_custom_pdf_path: null,
      agreement_custom_pdf_filename: null,
    });
    setToast({
      type: "success",
      message:
        "נוסף מסמך PDF חדש לתיק (מסומן לחתימה). מסמכים קודמים לא הוסרו.",
    });
    await loadAll();
  };

  const saveSignatureTemplate = async (templateId: string | null) => {
    if (!client) return;
    setSignatureTemplateBusy(true);
    const { error } = await supabase
      .from("clients")
      .update({ signature_template_id: templateId })
      .eq("id", client.id);
    setSignatureTemplateBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    setClient({ ...client, signature_template_id: templateId });
    setToast({ type: "success", message: "תבנית החתימה נשמרה." });
  };

  const handleDeleteAgreement = async () => {
    if (!client) return;
    if (
      !window.confirm(
        "למחוק את בקשת החתימה? יימחקו נתוני חתימה (אם היו), והלקוח לא יראה הסכם עד להפעלה מחדש."
      )
    ) {
      return;
    }
    setDeleteAgreementBusy(true);
    const oldPath = client.agreement_custom_pdf_path?.trim();
    if (oldPath) {
      await supabase.storage.from("client-agreements").remove([oldPath]);
    }
    const { error } = await supabase
      .from("clients")
      .update({
        agreement_request_active: false,
        agreement_source: null,
        agreement_custom_pdf_path: null,
        agreement_custom_pdf_filename: null,
        has_signed: false,
        signed_at: null,
        agreement_aux_signed_at: null,
        agreement_template_ids: [],
        agreement_template_sign_index: 0,
        agreement_structure_template_id: null,
        signature_template_id: null,
      })
      .eq("id", client.id);
    setDeleteAgreementBusy(false);
    if (error) {
      setToast({ type: "error", message: error.message });
      return;
    }
    setClient({
      ...client,
      agreement_request_active: false,
      agreement_source: null,
      agreement_custom_pdf_path: null,
      agreement_custom_pdf_filename: null,
      has_signed: false,
      signed_at: null,
      agreement_aux_signed_at: null,
      agreement_template_ids: [],
      agreement_template_sign_index: 0,
      agreement_structure_template_id: null,
      signature_template_id: null,
    });
    setToast({
      type: "success",
      message:
        "בקשת החתימה בוטלה בהגדרות הלקוח. רשומות המסמכים והקבצים בתיק לא נמחקו — השתמשו ב״מחיקה״ ליד כל קובץ.",
    });
  };

  const contractValueNum = useMemo(() => {
    if (!client) return null;
    if (
      client.total_amount != null &&
      !Number.isNaN(Number(client.total_amount))
    ) {
      return Number(client.total_amount);
    }
    if (client.fee_amount != null && !Number.isNaN(Number(client.fee_amount))) {
      return Number(client.fee_amount);
    }
    return null;
  }, [client]);

  const totalPaid = useMemo(() => {
    return payments.reduce((sum, p) => sum + Number(p.amount), 0);
  }, [payments]);

  const financeBalance = useMemo(() => {
    if (contractValueNum == null) return null;
    return contractValueNum - totalPaid;
  }, [contractValueNum, totalPaid]);

  const isFullyPaid = useMemo(() => {
    return (
      contractValueNum != null &&
      contractValueNum > 0 &&
      financeBalance !== null &&
      financeBalance <= 0
    );
  }, [contractValueNum, financeBalance]);

  const clientPaymentColumns = useMemo(
    (): ResponsiveColumnDef<PaymentRow>[] => [
      {
        id: "amount",
        header: "סכום",
        cell: (p) => (
          <span
            className="text-lg font-bold tabular-nums md:text-base md:font-medium"
            dir="ltr"
          >
            {Number(p.amount).toLocaleString("he-IL", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{" "}
            ₪
          </span>
        ),
        tdClassName:
          "px-3 py-2 font-medium tabular-nums text-neutral-900 dark:text-neutral-100",
      },
      {
        id: "paid_on",
        header: "תאריך",
        cell: (p) =>
          p.paid_on
            ? new Date(`${p.paid_on}T12:00:00`).toLocaleDateString("he-IL")
            : "—",
        tdClassName: "px-3 py-2 text-neutral-700 dark:text-neutral-300",
      },
      {
        id: "method",
        header: "אמצעי תשלום",
        cell: (p) => p.method?.trim() || "—",
        tdClassName: "px-3 py-2 text-neutral-700 dark:text-neutral-300",
      },
      {
        id: "description",
        header: "תיאור",
        cell: (p) => (
          <span
            className="break-words text-neutral-700 dark:text-neutral-300 md:block md:max-w-[220px] md:truncate md:text-neutral-600 dark:md:text-neutral-400"
            title={p.description ?? undefined}
          >
            {p.description?.trim() || "—"}
          </span>
        ),
        tdClassName:
          "max-w-[220px] truncate px-3 py-2 text-neutral-600 dark:text-neutral-400",
      },
    ],
    []
  );

  const saveClientScalarFields = useCallback(
    async (updates: {
      full_name?: string;
      id_number?: string;
      phone?: string | null;
    }) => {
      if (!client) return;
      const patch: {
        full_name?: string;
        id_number?: string;
        phone?: string | null;
      } = {};
      if (updates.full_name !== undefined) {
        const v = updates.full_name.trim();
        if (!v) {
          setToast({ type: "error", message: "שם מלא נדרש" });
          return;
        }
        patch.full_name = v;
      }
      if (updates.id_number !== undefined) {
        const v = updates.id_number.trim();
        if (!v) {
          setToast({ type: "error", message: "מספר תעודת זהות נדרש" });
          return;
        }
        patch.id_number = v;
      }
      if (updates.phone !== undefined) {
        const raw = updates.phone;
        patch.phone =
          raw == null ? null : raw.trim() === "" ? null : raw.trim();
      }
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase
        .from("clients")
        .update(patch)
        .eq("id", client.id);
      if (error) {
        setToast({ type: "error", message: error.message });
        return;
      }
      setClient((c) => (c ? { ...c, ...patch } : c));
    },
    [client]
  );

  const saveClientDynamicColumn = useCallback(
    async (columnKey: string, value: string) => {
      if (!client) return;
      const nk = normalizeCoreSlotKey(columnKey) ?? columnKey.trim();
      if (!nk) return;
      const { error } = await supabase
        .from("clients")
        .update({ [nk]: value })
        .eq("id", client.id);
      if (error) {
        setToast({ type: "error", message: error.message });
        return;
      }
      setClient((c) =>
        c ? ({ ...c, [nk]: value } as ClientDetail) : c
      );
    },
    [client]
  );

  if (!clientId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-start text-neutral-600 dark:text-neutral-400">
          מזהה לקוח חסר.
        </p>
      </div>
    );
  }

  if (client === undefined) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <Link
          href="/admin/clients"
          className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        >
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          חזרה לרשימה
        </Link>
        <p className="text-start text-sm text-neutral-600 dark:text-neutral-400">
          טוען תיק לקוח…
        </p>
        <ClientCardOverviewSkeleton
          sections={clientCardLayoutSectionsForOverview}
          slots={effectiveClientCardSlots}
        />
      </div>
    );
  }

  if (client === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6">
        <p className="text-start text-red-600 dark:text-red-400" role="alert">
          {loadError ?? "הלקוח לא נמצא."}
        </p>
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:underline dark:text-slate-300"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          חזרה לרשימה
        </Link>
      </div>
    );
  }

  const crmStatusRow = clientStatuses.find(
    (s) => String(s.id) === String(client.status_id ?? "")
  );
  const crmDisplayLabel =
    crmStatusRow?.label ??
    normalizeClientCrmStatus(client.status, {
      validLabels: validStatusLabels,
      fallbackLabel: fallbackStatusLabel,
    });
  const crmBadge = clientStatusBadgeStyle(crmStatusRow?.color_hex ?? "#64748b");

  const crmStatusPickerCore = (
    <div className="w-full min-w-0 max-w-full space-y-1.5 overflow-visible">
      <span
        className="inline-flex max-w-full rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={{
          backgroundColor: crmBadge.backgroundColor,
          color: crmBadge.color,
        }}
      >
        {crmDisplayLabel}
      </span>
      <select
        key={crmStatusSelectRenderKey}
        aria-label="סטטוס CRM"
        value={String(client.status_id ?? "")}
        disabled={statusUpdating || clientStatuses.length === 0}
        onChange={(e) => void handleCrmStatusChange(e.target.value)}
        className="h-auto min-h-9 w-full min-w-0 max-w-full cursor-pointer text-start disabled:opacity-60"
      >
        {clientStatuses.length === 0 ? (
          <option value="">—</option>
        ) : (
          clientStatuses.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.label}
            </option>
          ))
        )}
      </select>
      {statusUpdating ? (
        <span className="block text-[10px] text-slate-500">שומר…</span>
      ) : null}
    </div>
  );

  const hasPhone = Boolean(client.phone?.trim());
  const freeMessagePhoneOk = israeliPhoneDigitsForWaMe(client.phone) !== null;

  const agreementInactive = client.agreement_request_active === false;

  const hasAnyNeedsSigDoc = docs.some((d) => d.needs_signature === true);

  const agreementAssigned =
    client.agreement_request_active !== false &&
    (client.agreement_source === "template" ||
      client.agreement_source == null ||
      (client.agreement_source === "custom_pdf" &&
        Boolean(client.agreement_custom_pdf_path?.trim())) ||
      (client.agreement_source === "from_document" && hasAnyNeedsSigDoc));

  const agreementPendingSignature =
    agreementAssigned && client.has_signed !== true;

  const agreementKindDescription =
    client.agreement_source === "custom_pdf"
      ? `הסכם PDF ייעודי${client.agreement_custom_pdf_filename ? ` (${client.agreement_custom_pdf_filename})` : ""}`
      : client.agreement_source === "from_document"
        ? (() => {
            const n = docs.filter((d) => d.needs_signature).length;
            if (n === 0) {
              return "מסמכים מהתיק — סמנו PDF או ‎.docx לחתימה ברשימת המסמכים";
            }
            return `${n} מסמכים מהתיק (PDF או ‎.docx) מסומנים לחתימה בפורטל`;
          })()
        : "הסכם מתבנית גלובלית (PDF או ‎.docx)";

  const renderLayoutSlot = (sl: CrmLayoutSlotRow): ReactNode => {
    if (!sl || typeof sl !== "object") return null;
    if (sl.slot_kind === "divider") {
      return (
        <CrmLayoutDividerView
          config={sl.divider_config ?? null}
          variant="client"
        />
      );
    }
    if (!client) return null;
    if (sl.slot_kind === "core") {
      const k = normalizeCoreSlotKey(sl.core_key);
      if (!k) {
        return (
          <ClientDetailFieldStrip label="שדה ליבה">
            <div className={`${CLIENT_FIELD_VALUE_CLASS} text-slate-500`}>
              —
            </div>
          </ClientDetailFieldStrip>
        );
      }
      const lb = labelForCoreKey(k);
      const bridged = bridgedCoreFieldString(
        client,
        mergedCustomFieldsFromClient,
        k,
        sl.core_key
      );
      if (k === "full_name") {
        return (
          <ClientDetailFieldStrip label={lb}>
            <input
              value={bridged}
              onChange={(e) =>
                setClient((c) =>
                  c ? { ...c, full_name: e.target.value } : c
                )
              }
              onBlur={(e) =>
                void saveClientScalarFields({ full_name: e.target.value })
              }
              className="disabled:opacity-60"
            />
          </ClientDetailFieldStrip>
        );
      }
      if (k === "id_number") {
        return (
          <ClientDetailFieldStrip label={lb}>
            <input
              value={bridged}
              onChange={(e) =>
                setClient((c) =>
                  c ? { ...c, id_number: e.target.value } : c
                )
              }
              onBlur={(e) =>
                void saveClientScalarFields({ id_number: e.target.value })
              }
              dir="ltr"
              className="disabled:opacity-60"
            />
          </ClientDetailFieldStrip>
        );
      }
      if (k === "phone") {
        return (
          <ClientDetailFieldStrip label={lb}>
            <input
              type="tel"
              value={bridged}
              onChange={(e) =>
                setClient((c) =>
                  c ? { ...c, phone: e.target.value || null } : c
                )
              }
              onBlur={(e) =>
                void saveClientScalarFields({
                  phone: e.target.value || null,
                })
              }
              dir="ltr"
              className="disabled:opacity-60"
            />
          </ClientDetailFieldStrip>
        );
      }
      if (k === "agreement_notes") {
        return (
          <ClientDetailFieldStrip label={lb}>
            <textarea
              value={editAgreementNotes}
              onChange={(e) => setEditAgreementNotes(e.target.value)}
              rows={2}
              placeholder="טקסט מעל אזור החתימה"
              disabled={agreementNotesSaving}
              className="disabled:opacity-60"
            />
          </ClientDetailFieldStrip>
        );
      }
      if (k === "crm_status") {
        return (
          <ClientDetailFieldStrip label={lb}>
            <div className="p-2">{crmStatusPickerCore}</div>
          </ClientDetailFieldStrip>
        );
      }
      if (k === "lead_source") {
        return (
          <ClientDetailFieldStrip label={lb}>
            <div className={CLIENT_FIELD_VALUE_CLASS}>
              {bridged.trim() || "—"}
            </div>
          </ClientDetailFieldStrip>
        );
      }
      if (k === "lead_provider_name") {
        return (
          <ClientDetailFieldStrip label={lb}>
            <div className={CLIENT_FIELD_VALUE_CLASS}>
              {bridged.trim() || "—"}
            </div>
          </ClientDetailFieldStrip>
        );
      }
      if (k === "closed_by") {
        return (
          <ClientDetailFieldStrip label={lb}>
            <div className={CLIENT_FIELD_VALUE_CLASS}>
              {(() => {
                const cid = client.closed_by?.trim();
                if (cid) {
                  const p = closerProfileOptions.find((x) => x.id === cid);
                  return p?.full_name?.trim() || "—";
                }
                if (bridged.trim()) return bridged;
                return "לא שויך";
              })()}
            </div>
          </ClientDetailFieldStrip>
        );
      }
      if (k === "fee_upfront" || k === "fee_success" || k === "payment_status") {
        const txt = bridged.trim() || "—";
        return (
          <ClientDetailFieldStrip label={lb}>
            <div className={`${CLIENT_FIELD_VALUE_CLASS} text-start`} dir="ltr">
              {txt}
            </div>
          </ClientDetailFieldStrip>
        );
      }
      if (k === "total_amount") {
        const bs = bridged.trim();
        const nFromBridge =
          bs !== "" && !Number.isNaN(Number(bs)) ? Number(bs) : null;
        const n =
          nFromBridge ??
          (client.total_amount != null &&
          !Number.isNaN(Number(client.total_amount))
            ? Number(client.total_amount)
            : client.fee_amount != null &&
                !Number.isNaN(Number(client.fee_amount))
              ? Number(client.fee_amount)
              : null);
        return (
          <ClientDetailFieldStrip label={lb}>
            <div className={`${CLIENT_FIELD_VALUE_CLASS} text-start`} dir="ltr">
              {n != null ? String(n) : "—"}
            </div>
          </ClientDetailFieldStrip>
        );
      }
      return (
        <ClientDetailFieldStrip label={lb}>
          <input
            value={bridged}
            onChange={(e) =>
              setClient((c) =>
                c
                  ? ({ ...c, [k]: e.target.value } as ClientDetail)
                  : c
              )
            }
            onBlur={(e) => void saveClientDynamicColumn(k, e.target.value)}
            className="disabled:opacity-60"
            dir="auto"
          />
        </ClientDetailFieldStrip>
      );
    }
    if (sl.slot_kind === "custom" && sl.definition_id) {
      const def = customFieldDefinitions.find(
        (d) => String(d.id) === String(sl.definition_id)
      );
      if (!def) return null;
      return renderCrmCustomFieldControl(def);
    }
    return null;
  };

  return (
    <div
      className="min-h-screen w-full space-y-4 bg-slate-100 pb-6 dark:bg-neutral-950"
      dir="rtl"
    >
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

      {growBillingModalOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="סגור"
            className="absolute inset-0 bg-black/60"
            onClick={() => closeGrowBillingModal()}
          />
          <div className="relative z-10 flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="grow-billing-title"
              className="box-border max-h-[92dvh] w-full max-w-none overflow-y-auto border-x-0 border-b-0 border-t border-neutral-200 bg-white p-4 pb-6 shadow-2xl max-md:min-h-[70dvh] max-md:rounded-none max-md:px-4 sm:max-h-[90vh] sm:border sm:max-w-md sm:rounded-2xl sm:p-5 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id="grow-billing-title"
                  className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-50"
                >
                  חיוב אשראי מהיר — Grow
                </h2>
                <button
                  type="button"
                  onClick={() => closeGrowBillingModal()}
                  className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="סגור"
                >
                  <X className="h-5 w-5 shrink-0" aria-hidden />
                </button>
              </div>
              <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/90 p-3 text-start text-sm leading-relaxed text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-100">
                לחץ על סימניית הקסם בדף הראשון (סכום) ואז שוב בדף השני
                (פרטים).
              </p>
              <form
                onSubmit={(ev) => void handleContinueToGrow(ev)}
                className="mt-4 space-y-4"
              >
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    סכום לחיוב
                  </span>
                  <input
                    value={growBillingAmount}
                    onChange={(e) => setGrowBillingAmount(e.target.value)}
                    dir="ltr"
                    placeholder="למשל 1500"
                    required
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    תיאור העסקה
                  </span>
                  <input
                    value={growBillingDescription}
                    onChange={(e) => setGrowBillingDescription(e.target.value)}
                    placeholder={`שכר טרחה - ${client.full_name}`}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => closeGrowBillingModal()}
                    className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                  >
                    המשך לגרו
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {freeMessageModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[100]">
              <button
                type="button"
                aria-label="סגור"
                className="absolute inset-0 bg-black/60"
                onClick={(ev) => {
                  ev.preventDefault();
                  if (!isSending) setFreeMessageModalOpen(false);
                }}
              />
              <div
                className="relative z-10 flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4"
                onClick={(ev) => {
                  if (isSending) return;
                  if (ev.target === ev.currentTarget) {
                    setFreeMessageModalOpen(false);
                  }
                }}
              >
                <form
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="free-msg-title"
                  noValidate
                  onSubmit={handleFreeMessageFormSubmit}
                  className="box-border max-h-[92dvh] w-full max-w-none overflow-y-auto border-x-0 border-b-0 border-t border-slate-200 bg-white p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl max-md:rounded-t-2xl max-md:px-4 sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:border sm:p-5 dark:border-slate-700 dark:bg-neutral-900"
                  dir="rtl"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2
                      id="free-msg-title"
                      className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-50"
                    >
                      שליחת הודעה ל{client.full_name}
                    </h2>
                    <button
                      type="button"
                      disabled={isSending}
                      onClick={(ev) => {
                        ev.preventDefault();
                        setFreeMessageModalOpen(false);
                      }}
                      className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
                      aria-label="סגור"
                    >
                      <X className="h-5 w-5 shrink-0" aria-hidden />
                    </button>
                  </div>
                  <p className="mt-2 text-start text-xs text-neutral-600 dark:text-neutral-400">
                    ההודעה נשלחת מהשרת ללקוח דרך Green API (ללא פתיחת WhatsApp
                    בדפדפן). לאחר שליחה מוצלחת יעודכן זמן התזכורת האחרון, מצב
                    התזכורות יוגדר לאוטומטי, ותאריך תזכורת ידנית (אם היה) יימחק.
                  </p>
                  <label className="mt-4 block text-start text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    תוכן ההודעה
                    <textarea
                      name="freeMessageBody"
                      value={freeMessageText}
                      onChange={(e) => setFreeMessageText(e.target.value)}
                      rows={6}
                      placeholder="כתבו כאן…"
                      disabled={isSending}
                      autoComplete="off"
                      enterKeyHint="enter"
                      className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-neutral-900 placeholder:text-neutral-400 disabled:opacity-60 dark:border-slate-600 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>
                  <div className="mt-3">
                    <p className="text-start text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      קיצורי דרך
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["בטיפול", "תודה", "אחזור אליך"] as const).map(
                        (text) => (
                          <button
                            key={text}
                            type="button"
                            disabled={isSending}
                            onClick={(ev) => {
                              ev.preventDefault();
                              appendFreeMessageTemplate(text);
                            }}
                            className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            {text}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2">
                    <button
                      type="button"
                      disabled={!freeMessagePhoneOk || isSending}
                      aria-busy={isSending}
                      onClick={() => void submitFreeMessageViaGreen()}
                      className="inline-flex h-9 min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600 sm:min-w-[12rem] sm:w-auto"
                    >
                      {isSending ? (
                        <Loader2
                          className="h-4 w-4 shrink-0 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <Send className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      שלח הודעה חופשית
                    </button>
                    <button
                      type="button"
                      disabled={isSending}
                      onClick={(ev) => {
                        ev.preventDefault();
                        setFreeMessageModalOpen(false);
                      }}
                      className="h-9 min-h-9 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800 sm:w-auto"
                    >
                      ביטול
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {addPaymentOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="סגור"
            className="absolute inset-0 bg-black/60"
            onClick={() => closeAddPaymentModal()}
          />
          <div className="relative z-10 flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-payment-title"
              className="box-border max-h-[92dvh] w-full max-w-none overflow-y-auto border-x-0 border-b-0 border-t border-neutral-200 bg-white p-4 pb-6 shadow-2xl max-md:min-h-[70dvh] max-md:rounded-none max-md:px-4 sm:max-h-[90vh] sm:border sm:max-w-md sm:rounded-2xl sm:p-5 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id="add-payment-title"
                  className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-50"
                >
                  {editingPaymentId ? "עריכת תשלום" : "הוספת תשלום"}
                </h2>
                <button
                  type="button"
                  disabled={addPaymentBusy}
                  onClick={() => closeAddPaymentModal()}
                  className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
                  aria-label="סגור"
                >
                  <X className="h-5 w-5 shrink-0" aria-hidden />
                </button>
              </div>
              <form
                onSubmit={(ev) => void submitNewPayment(ev)}
                className="mt-4 space-y-4"
              >
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    סכום (₪)
                  </span>
                  <input
                    value={newPaymentAmount}
                    onChange={(e) => setNewPaymentAmount(e.target.value)}
                    inputMode="decimal"
                    dir="ltr"
                    required
                    placeholder="למשל 3000"
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    תאריך
                  </span>
                  <input
                    type="date"
                    value={newPaymentDate}
                    onChange={(e) => setNewPaymentDate(e.target.value)}
                    required
                    dir="ltr"
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    אמצעי תשלום
                  </span>
                  <input
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value)}
                    placeholder="מזומן, אשראי, העברה בנקאית…"
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    תיאור (אופציונלי)
                  </span>
                  <input
                    value={newPaymentDescription}
                    onChange={(e) => setNewPaymentDescription(e.target.value)}
                    placeholder="למשל: מקדמה, תשלום שני"
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    disabled={addPaymentBusy}
                    onClick={() => closeAddPaymentModal()}
                    className="h-9 min-h-9 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={addPaymentBusy}
                    className="inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    {addPaymentBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    {editingPaymentId ? "עדכן תשלום" : "שמור תשלום"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {cleanupConfirmOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="סגור"
            className="absolute inset-0 bg-black/60"
            onClick={() => !cleanupBusy && setCleanupConfirmOpen(false)}
          />
          <div className="relative z-10 flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cleanup-title"
              aria-describedby="cleanup-desc"
              className="box-border max-h-[92dvh] w-full max-w-none overflow-y-auto border-x-0 border-b-0 border-t border-neutral-200 bg-white p-4 pb-6 shadow-2xl max-md:rounded-t-2xl max-md:px-4 sm:max-h-[90vh] sm:border sm:max-w-md sm:rounded-2xl sm:p-5 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <h2
                id="cleanup-title"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-50"
              >
                ניקוי ופינוי שרת
              </h2>
              <p
                id="cleanup-desc"
                className="mt-3 text-start text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
              >
                Are you sure? This will permanently delete all files from the
                server
              </p>
              <p className="mt-2 text-start text-sm font-medium text-red-800 dark:text-red-200">
                האם אתה בטוח? פעולה זו תמחק לצמיתות את כל הקבצים מהשרת
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  disabled={cleanupBusy}
                  onClick={() => setCleanupConfirmOpen(false)}
                  className="h-9 min-h-9 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  disabled={cleanupBusy}
                  onClick={() => void executeStorageCleanup()}
                  className="inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
                >
                  {cleanupBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  מחק לצמיתות
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detailsEditing ? (
        <div className="mb-2 flex flex-col gap-4 rounded-xl border border-slate-300 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/clients"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            חזרה לרשימה
          </Link>
        </div>
      ) : null}

      {detailsEditing ? (
        <form
          onSubmit={(ev) => void saveClientDetails(ev)}
          className="space-y-4 rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
        >
          <ClientDetailFieldStrip label="שם מלא">
            <input
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              required
              className="disabled:opacity-60"
            />
          </ClientDetailFieldStrip>
          <ClientDetailFieldStrip label="מספר תעודת זהות">
            <input
              value={editIdNumber}
              onChange={(e) => setEditIdNumber(e.target.value)}
              required
              dir="ltr"
              className="disabled:opacity-60"
            />
          </ClientDetailFieldStrip>
          <ClientDetailFieldStrip label="טלפון">
            <input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              type="tel"
              dir="ltr"
              className="disabled:opacity-60"
            />
          </ClientDetailFieldStrip>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ClientDetailFieldStrip label="מקור הליד">
              <select
                value={editLeadSource}
                onChange={(e) => setEditLeadSource(e.target.value)}
                className="cursor-pointer disabled:opacity-60"
              >
                <option value="">לא נבחר</option>
                {LEAD_SOURCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </ClientDetailFieldStrip>
            <ClientDetailFieldStrip label="ספק ליד">
              <div className="space-y-1 p-2">
                <select
                  value={editLeadProviderName}
                  onChange={(e) => setEditLeadProviderName(e.target.value)}
                  className="cursor-pointer disabled:opacity-60"
                >
                  <option value="">לא נבחר</option>
                  {editLeadProviderName.trim() &&
                  !leadProviderOptions.some(
                    (p) => p.name === editLeadProviderName.trim()
                  ) ? (
                    <option value={editLeadProviderName.trim()}>
                      {editLeadProviderName.trim()} (שמור — לא ברשימה)
                    </option>
                  ) : null}
                  {leadProviderOptions.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {leadProvidersLoadError ? (
                  <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                    לא נטענה רשימת ספקים ({leadProvidersLoadError}).
                  </span>
                ) : null}
              </div>
            </ClientDetailFieldStrip>
          </div>
          <ClientDetailFieldStrip label="סוגר עסקה">
            <select
              value={editClosedBy}
              onChange={(e) => setEditClosedBy(e.target.value)}
              className="cursor-pointer disabled:opacity-60"
            >
              <option value="">לא שויך</option>
              {closerProfileOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name?.trim() || p.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </ClientDetailFieldStrip>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={detailsSaving}
              onClick={() => setDetailsEditing(false)}
              className="h-7 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={detailsSaving}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {detailsSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              שמור
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="sticky top-0 z-30 border-b border-slate-300 bg-slate-100/95 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-neutral-950/95">
            <div className="space-y-4 p-2.5 sm:p-3">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
                  <Link
                    href="/admin/clients"
                    className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    חזרה לרשימה
                  </Link>
                </div>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => void sendWelcome()}
                  disabled={welcomeSending || !hasPhone}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {welcomeSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  הודעת פתיחה
                </button>
                <button
                  type="button"
                  onClick={() => openFreeMessageModal()}
                  disabled={!freeMessagePhoneOk || isSending}
                  aria-busy={isSending}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {isSending ? (
                    <Loader2
                      className="h-3.5 w-3.5 shrink-0 animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  הודעה חופשית
                </button>
                <button
                  type="button"
                  onClick={() => void sendDocumentRequestToClient()}
                  disabled={documentRequestSending || !hasPhone}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {documentRequestSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  דרישת מסמכים
                </button>
                <button
                  type="button"
                  onClick={() => void sendSignatureRequestWhatsApp()}
                  disabled={
                    signatureRequestSending ||
                    (effectiveSignatureTemplateIdsForWhatsApp.length === 0 &&
                      pendingSignatureDocsForWhatsApp.length === 0) ||
                    !hasPhone
                  }
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white shadow-sm hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                >
                  {signatureRequestSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <FileSignature className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  בקשת חתימה
                </button>
                <button
                  type="button"
                  onClick={() => void sendSignatureRequestWhatsApp(true)}
                  disabled={
                    signatureRequestSending ||
                    (effectiveSignatureTemplateIdsForWhatsApp.length === 0 &&
                      pendingSignatureDocsForWhatsApp.length === 0)
                  }
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-950/60"
                >
                  {signatureRequestSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <FileSignature className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  ניסיון חתימה מקומי
                </button>
                <button
                  type="button"
                  onClick={() => copyPortalLink()}
                  disabled={!portalUrl}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {copied ? "הועתק" : "קישור פורטל"}
                </button>
                <button
                  type="button"
                  onClick={() => openGrowBillingModal()}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Grow
                </button>
              </div>
            </div>
            {!hasPhone ? (
              <p className="text-start text-xs text-slate-600 dark:text-slate-400">
                אין מספר טלפון — לא ניתן לשלוח הודעות WhatsApp.
              </p>
            ) : !freeMessagePhoneOk ? (
              <p className="text-start text-xs text-slate-600 dark:text-slate-400">
                מספר הטלפון אינו בפורמט נתמך לשליחה דרך המערכת.
              </p>
            ) : null}
              <nav
                role="tablist"
                className="flex flex-wrap gap-4 border-t border-slate-200 pt-4 dark:border-slate-800"
                aria-label="אזורי תצוגה"
              >
                {(
                  [
                    ["overview", "פרטי קשר"],
                    ["agreements", "הסכמי חתימה"],
                    ["requirements", "דרישת מסמכים"],
                    ["payments", "פרטי תשלום"],
                    ["documents", "מסמכים שהגיעו"],
                    ["notes", "הערות"],
                    ["bot", "הגדרות בוט"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    aria-controls={`client-tab-${id}`}
                    id={`client-tab-trigger-${id}`}
                    onClick={() => setActiveTab(id)}
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      activeTab === id
                        ? "border border-slate-800 bg-slate-800 text-white shadow-sm dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900"
                        : "border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="space-y-4 px-0.5 sm:px-0">
            {activeTab === "overview" ? (
            <div
              className="space-y-8"
              role="tabpanel"
              id="client-tab-overview"
              aria-labelledby="client-tab-trigger-overview"
            >
              <div
                id="client-profile-heading"
                className="flex flex-wrap items-start justify-between gap-3 px-0.5"
              >
                <h2 className="text-start text-lg font-bold text-slate-900 dark:text-slate-50">
                  כרטיס לקוח
                </h2>
                <button
                  type="button"
                  onClick={() => openDetailsEdit()}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <Pencil className="h-3 w-3 shrink-0" aria-hidden />
                  ערוך פרטים
                </button>
              </div>

              <div className="px-0.5">
                <p
                  className="text-start text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
                  dir="auto"
                >
                  {clientDisplayName || "ללא שם"}
                </p>
              </div>

              {!overviewFieldValuesReady ? (
                <ClientCardOverviewSkeleton
                  sections={clientCardLayoutSectionsForOverview}
                  slots={effectiveClientCardSlots}
                />
              ) : (
                <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/90">
                  <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    פרטי לקוח מובנים
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/60">
                      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">תעודת זהות</p>
                      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100" dir="ltr">{client.id_number?.trim() || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/60">
                      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">טלפון</p>
                      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100" dir="ltr">{client.phone?.trim() || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/60">
                      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">מקור ליד</p>
                      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{client.lead_source?.trim() || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/60">
                      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">ספק ליד</p>
                      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{client.lead_provider_name?.trim() || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/60">
                      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">סוגר עסקה</p>
                      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {(() => {
                          const cid = client.closed_by?.trim();
                          if (!cid) return "לא שויך";
                          const p = closerProfileOptions.find((x) => x.id === cid);
                          return p?.full_name?.trim() || "—";
                        })()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/60">
                      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">סטטוס CRM</p>
                      <div className="mt-1 min-w-0 overflow-visible text-start text-neutral-900 dark:text-neutral-100">
                        {crmStatusPickerCore}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {portalUrl ? (
                <SectionCard id="portal-link-h" title="קישור פורטל">
                  <p
                    className="truncate font-mono text-xs text-slate-700 dark:text-slate-300"
                    dir="ltr"
                    title={portalUrl}
                  >
                    {portalUrl}
                  </p>
                </SectionCard>
              ) : null}

              </div>
            ) : null}

            {activeTab === "documents" ? (
            <div
              className="flex flex-col w-full min-h-[600px] h-full p-4"
              role="tabpanel"
              id="client-tab-documents"
              aria-labelledby="client-tab-trigger-documents"
            >
              <ClientDocumentManager
                clientId={clientId}
                client={client}
                setClient={setClient as ClientDocumentManagerProps["setClient"]}
                docs={docs}
                setDocs={setDocs}
                documentTypes={documentTypes}
                agreementTemplateNameSet={agreementTemplateNameSet}
                portalSignatureAgreementTemplates={portalSignatureAgreementTemplates}
                agreementTemplates={agreementTemplates}
                loadAll={loadAll}
                hasPhone={hasPhone}
                onSendDocReminder={sendDocReminder}
                docReminderSending={docReminderSending}
                docAgreementPickerOpen={docAgreementPickerOpen}
                setDocAgreementPickerOpen={setDocAgreementPickerOpen}
                agreementTemplateSearch={agreementTemplateSearch}
                setAgreementTemplateSearch={setAgreementTemplateSearch}
                addingAgreementTemplateId={addingAgreementTemplateId}
                onAddAgreementFromTemplate={addAgreementFromTemplate}
                toggleNeedsSignatureForDoc={toggleNeedsSignatureForDoc}
                togglingSigDocId={togglingSigDocId}
                cleanupBusy={cleanupBusy}
                setToast={setToast}
              />
            </div>
            ) : null}

            {activeTab === "notes" ? (
            <div
              role="tabpanel"
              id="client-tab-notes"
              aria-labelledby="client-tab-trigger-notes"
            >
              <SectionCard
                id="internal-notes-h"
                title="הערות ועדכונים"
                description="נשמרות בתיק עם חותמת זמן — מהחדשה לישנה."
              >
                <form
                  onSubmit={(ev) => void submitClientNote(ev)}
                  className="space-y-3"
                >
                  <label className="grid gap-1.5 text-start text-sm">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      הערה חדשה
                    </span>
                    <textarea
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                      rows={3}
                      placeholder="טקסט לצוות המשרד"
                      className="resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={noteSubmitting || !newNoteBody.trim()}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {noteSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    שמור הערה
                  </button>
                </form>
                {clientNotes.filter(
                  (n) => n.body.trim().toLowerCase() !== "pending"
                ).length === 0 ? (
                  <p className="mt-6 border-t border-slate-200 pt-6 text-start text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    אין הערות עדיין.
                  </p>
                ) : (
                  <ul className="mt-6 divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {clientNotes
                      .filter((n) => n.body.trim().toLowerCase() !== "pending")
                      .map((n) => (
                      <li key={n.id} className="py-4 first:pt-6">
                        <p className="whitespace-pre-wrap text-start text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                          {n.body}
                        </p>
                        <p
                          className="mt-2 text-start text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400"
                          dir="ltr"
                        >
                          {formatClientNoteTimestamp(n.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

            </div>
            ) : null}

            {activeTab === "payments" ||
            activeTab === "requirements" ||
            activeTab === "agreements" ? (
            <div
              className="space-y-6"
              role="tabpanel"
              id={`client-tab-${activeTab}`}
              aria-labelledby={`client-tab-trigger-${activeTab}`}
            >
              {activeTab === "payments" ? (
              <SectionCard
                id="finance-summary-h"
                title="סיכום כספי"
                titleClassName="text-base uppercase tracking-wide text-slate-600 dark:text-slate-400"
              >
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-neutral-900/90 bg-white p-2.5 shadow-sm dark:border-neutral-200/80 dark:bg-neutral-900/90">
                    <p className="inline-flex rounded-md border border-neutral-900 px-2 py-1 text-[11px] font-semibold tracking-wide text-neutral-900 dark:border-neutral-100 dark:text-neutral-100">
                      סה״כ מוסכם
                    </p>
                    <p
                      className="mt-2 text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-50 md:text-base"
                      dir="ltr"
                    >
                      {contractValueNum == null
                        ? "—"
                        : `${contractValueNum.toLocaleString("he-IL", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })} ₪`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-300/80 bg-white p-2.5 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/20">
                    <p className="inline-flex rounded-md border border-emerald-700/70 px-2 py-1 text-[11px] font-semibold tracking-wide text-emerald-800 dark:border-emerald-300/70 dark:text-emerald-200">
                      שולם בפועל
                    </p>
                    <p
                      className="mt-2 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300 md:text-base"
                      dir="ltr"
                    >
                      {totalPaid.toLocaleString("he-IL", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}{" "}
                      ₪
                    </p>
                  </div>
                  <div className="rounded-lg border border-neutral-900/90 bg-white p-2.5 shadow-sm dark:border-neutral-200/80 dark:bg-neutral-900/90">
                    <p className="inline-flex rounded-md border border-neutral-900 px-2 py-1 text-[11px] font-semibold tracking-wide text-neutral-900 dark:border-neutral-100 dark:text-neutral-100">
                      יתרה לתשלום
                    </p>
                    <p
                      className={`mt-2 text-sm font-semibold tabular-nums md:text-base ${
                        financeBalance != null && financeBalance > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-neutral-400 dark:text-neutral-500"
                      }`}
                      dir="ltr"
                    >
                      {financeBalance == null
                        ? "—"
                        : `${financeBalance.toLocaleString("he-IL", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })} ₪`}
                    </p>
                  </div>
                </div>
              </SectionCard>
              ) : null}
              {activeTab === "payments" ? (
      <SectionCard id="finance-mgmt-h" title="כספים" titleClassName="text-base">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="grid min-w-0 flex-1 gap-1.5 text-start text-sm sm:min-w-[200px]">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              סך שכר טרחה מוסכם (₪)
            </span>
            <input
              value={editTotalAmount}
              onChange={(e) => setEditTotalAmount(e.target.value)}
              inputMode="decimal"
              dir="ltr"
              placeholder="למשל 12000"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
          <button
            type="button"
            disabled={agreedFeeSaving}
            onClick={() => void saveAgreedContractFee()}
            className="inline-flex h-9 min-h-9 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {agreedFeeSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            שמור סכום מוסכם
          </button>
        </div>

        {isFullyPaid ? (
          <p className="mt-4 text-start text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            שולם במלואו
          </p>
        ) : null}

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-start text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              פירוט תשלומים
            </h3>
            <button
              type="button"
              onClick={() => openAddPaymentModal()}
              className="inline-flex h-9 min-h-9 items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-50 px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              הוסף תשלום
            </button>
          </div>
          <ResponsiveDataTable
            className="mt-3"
            columns={clientPaymentColumns}
            data={payments}
            rowKey={(p) => p.id}
            minTableWidth="420px"
            emptyMessage='אין תשלומים רשומים. לחצו "הוסף תשלום" כדי לרשום תשלום.'
            actionsHeader="פעולות"
            actions={(p) => (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditPaymentModal(p)}
                  disabled={deletingPaymentId != null || addPaymentBusy}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={() => void deletePaymentRow(p)}
                  disabled={deletingPaymentId != null || addPaymentBusy}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-900 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/70"
                >
                  {deletingPaymentId === p.id ? (
                    <Loader2
                      className="h-3.5 w-3.5 shrink-0 animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  מחיקה
                </button>
              </div>
            )}
          />
        </div>
      </SectionCard>
              ) : null}

              {activeTab === "requirements" ? (
      <SectionCard
        id="req-docs-mgmt-h"
        title="מסמכים נדרשים"
        titleClassName="text-base"
      >
        {documentTypes.length === 0 ? (
          <p className="text-start text-sm text-amber-800 dark:text-amber-200">
            אין סוגי מסמכים במערכת — הוסיפו ב־
            <Link
              href="/admin/settings"
              className="mx-1 font-medium underline"
            >
              הגדרות ותצורה
            </Link>
            .
          </p>
        ) : (
          <>
            {requiredDocsBusy ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                שומר…
              </p>
            ) : null}
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {documentTypes.map((dt) => {
                const checked = isDocTypeCheckedForClient(
                  client.required_docs,
                  dt.name
                );
                return (
                  <li key={dt.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 text-start text-sm dark:border-neutral-700 dark:bg-neutral-900/30 ${
                        requiredDocsBusy
                          ? "pointer-events-none opacity-60"
                          : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={requiredDocsBusy}
                        onChange={(e) =>
                          void handleRequiredDocToggle(
                            dt.name,
                            e.target.checked
                          )
                        }
                        className="mt-1"
                      />
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {dt.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SectionCard>
              ) : null}

              {activeTab === "agreements" ? (
      <SectionCard
        id="agreement-mgmt-h"
        title="שליחת הסכם לחתימה"
        titleClassName="text-base font-semibold text-slate-900 dark:text-slate-100"
        headerExtra={
          agreementPendingSignature ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
              ממתין לחתימה
            </span>
          ) : null
        }
      >
        <div className="space-y-5">
          {!agreementInactive ? (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-start text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  סטטוס:{" "}
                </span>
                {agreementKindDescription}
              </p>
              <button
                type="button"
                disabled={deleteAgreementBusy}
                onClick={() => void handleDeleteAgreement()}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
              >
                {deleteAgreementBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                )}
                איפוס בקשה
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              אין בקשת חתימה פעילה.
            </p>
          )}

          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-5 shadow-sm dark:border-slate-700 dark:from-slate-950/60 dark:to-slate-900/40">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              מקור קובץ ההסכם
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-start transition ${
                  signatureSetupMode === "template"
                    ? "border-indigo-400 bg-indigo-50/80 shadow-sm dark:border-indigo-600 dark:bg-indigo-950/40"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/40"
                }`}
              >
                <input
                  type="radio"
                  name="sig-setup"
                  className="mt-0.5"
                  checked={signatureSetupMode === "template"}
                  onChange={() => setSignatureSetupMode("template")}
                />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  תבנית גלובלית (PDF / Word)
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-start transition ${
                  signatureSetupMode === "upload"
                    ? "border-indigo-400 bg-indigo-50/80 shadow-sm dark:border-indigo-600 dark:bg-indigo-950/40"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/40"
                }`}
              >
                <input
                  type="radio"
                  name="sig-setup"
                  className="mt-0.5"
                  checked={signatureSetupMode === "upload"}
                  onChange={() => setSignatureSetupMode("upload")}
                />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  קובץ PDF מהמחשב
                </span>
              </label>
            </div>

            {signatureSetupMode === "template" ? (
              <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
                <p className="text-start text-xs text-slate-600 dark:text-slate-400">
                  נוצר עותק מהמאגר במסמכי הלקוח ומסומן לחתימה בפורטל.
                </p>
                <div className="relative mt-4 w-full max-w-md">
                  <button
                    type="button"
                    disabled={
                      addingAgreementTemplateId !== null ||
                      portalSignatureAgreementTemplates.length === 0
                    }
                    onClick={() => {
                      setFinanceAgreementPickerOpen(true);
                      setAgreementTemplateSearch("");
                    }}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    הוסף הסכם מתבנית
                  </button>
                  <AgreementTemplateQuickAdd
                    hideTrigger
                    templates={portalSignatureAgreementTemplates}
                    open={financeAgreementPickerOpen}
                    onOpenChange={setFinanceAgreementPickerOpen}
                    search={agreementTemplateSearch}
                    onSearchChange={setAgreementTemplateSearch}
                    addingId={addingAgreementTemplateId}
                    onPick={(t) => void addAgreementFromTemplate(t)}
                  />
                </div>
                {portalSignatureAgreementTemplates.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    אין תבניות זמינות.{" "}
                    <Link
                      href="/admin/settings"
                      className="font-medium text-indigo-600 underline dark:text-indigo-400"
                    >
                      הוסיפו תבניות במערכת
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            {signatureSetupMode === "upload" ? (
              <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
                <label className="flex w-full max-w-md cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-medium text-slate-800 transition hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-indigo-500">
                  {customPdfBusy ? (
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-hidden />
                  ) : (
                    <FileUp className="h-6 w-6 text-indigo-600" aria-hidden />
                  )}
                  <span>העלאת PDF לחתימה</span>
                  <span className="text-xs font-normal text-slate-500">
                    הקובץ יוצמד לתיק ויסומן לחתימה
                  </span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="sr-only"
                    disabled={customPdfBusy}
                    onChange={(ev) => {
                      void handleCustomAgreementPdf(ev.target.files);
                      ev.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            לשליחת קישור ב־WhatsApp השתמשו בכפתור &quot;בקשת חתימה&quot; בראש העמוד.
          </p>
        </div>
      </SectionCard>
              ) : null}

              {activeTab === "agreements" ? (
      <SectionCard
        id="payment-admin-h"
        title="הערות וטקסטים להסכם"
        titleClassName="text-sm"
      >
        <form
          onSubmit={(ev) => void savePaymentFields(ev)}
          className="grid gap-2.5 sm:grid-cols-2"
        >
          <label className="grid gap-1 text-start text-sm sm:col-span-2">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              תשלום / יתרה (לפני ואחרי תשלום)
            </span>
            <textarea
              value={editPaymentStatus}
              onChange={(e) => setEditPaymentStatus(e.target.value)}
              rows={2}
              placeholder="למשל: שולם מקדמה 3,000 ₪ · יתרה לאחר רישיון"
              className="resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
          <label className="grid gap-1 text-start text-sm sm:col-span-2">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              מקדמה — טקסט להסכם
            </span>
            <input
              value={editFeeUpfront}
              onChange={(e) => setEditFeeUpfront(e.target.value)}
              placeholder="למשל: 3,000 ₪"
              className="h-9 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
          <label className="grid gap-1 text-start text-sm sm:col-span-2">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              שכר הצלחה — טקסט להסכם
            </span>
            <input
              value={editFeeSuccess}
              onChange={(e) => setEditFeeSuccess(e.target.value)}
              placeholder="למשל: 7,000 ₪"
              className="h-9 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={paymentSaving}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {paymentSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              שמור
            </button>
          </div>
        </form>
      </SectionCard>
              ) : null}

              {activeTab === "agreements" ? (
      <SectionCard
        id="portal-h"
        title="סטטוס פורטל"
        titleClassName="text-base"
      >
        <div className="flex flex-wrap gap-2 text-sm">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              client.upload_request_active === true
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100"
                : "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
            }`}
          >
            העלאות:{" "}
            {client.upload_request_active === true ? "פעיל" : "כבוי"}
          </span>
          {agreementPendingSignature ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
              חתימה ממתינה
            </span>
          ) : null}
        </div>
      </SectionCard>
              ) : null}

              {activeTab === "agreements" && docs.length > 0 ? (
        <SectionCard
          id="storage-cleanup-h"
          title="ניקוי אחסון"
          titleClassName="text-base"
          description="מחיקת קבצים מהשרת — פעולה בלתי הפיכה."
          className="mt-6"
        >
          <button
            type="button"
            onClick={() => setCleanupConfirmOpen(true)}
            disabled={cleanupBusy}
            className="mt-3 inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/60"
          >
            {cleanupBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
            )}
            ניקוי ופינוי שרת
          </button>
        </SectionCard>
              ) : null}
            </div>
            ) : null}

            {activeTab === "bot" ? (
            <div
              className="space-y-6"
              role="tabpanel"
              id="client-tab-bot"
              aria-labelledby="client-tab-trigger-bot"
            >
              <SectionCard
                id="reminders-h"
                title="הגדרות בוט"
                description="מצב שליחה אוטומטית למסמכים חסרים, ותזמון הודעות WhatsApp ידניות."
              >
                <div className="space-y-5">
                  <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4 dark:border-indigo-800/50 dark:bg-indigo-950/25">
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200/90 bg-amber-50/60 p-3 text-start dark:border-amber-900/45 dark:bg-amber-950/25">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                        checked={autoRemindersOff}
                        onChange={(e) => setAutoRemindersOff(e.target.checked)}
                        disabled={reminderSettingsSaving}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          ביטול תזכורות אוטומטיות
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-600 dark:text-neutral-400">
                          כאשר מסומן, הקרון לא ישלח ללקוח זה את תזכורות המסמכים האוטומטיות
                          (מחזור כל־3 ימים בלבד). תזמון לפי תאריך, הודעות מתוזמנות מהרשימה,
                          וכפתורי WhatsApp בכרטיס הלקוח — נשארים זמינים.
                        </span>
                      </span>
                    </label>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-start">
                      <span className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">
                        מצב תזכורות (מסמכים חסרים)
                      </span>
                    </div>
                    <label className="mt-3 block text-start text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      בחירת מצב
                      <select
                        className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm text-neutral-900 dark:border-indigo-800 dark:bg-neutral-900 dark:text-neutral-100"
                        value={reminderModeSelect}
                        onChange={(e) =>
                          setReminderModeSelect(
                            e.target.value === "manual" ? "manual" : "auto"
                          )
                        }
                        disabled={reminderSettingsSaving}
                      >
                        <option value="auto">אוטומטי (כל 3 ימים) — מערכת</option>
                        <option value="manual">ידני (תזמון ספציפי) — תאריך מדויק</option>
                      </select>
                    </label>
                    {reminderModeSelect === "manual" ? (
                      <label className="mt-3 block text-start text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        תאריך ושעה לתזכורת הבאה (מסמכים)
                        <input
                          type="datetime-local"
                          dir="ltr"
                          className="mt-1 w-full h-9 min-h-9 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-indigo-800 dark:bg-neutral-900 dark:text-neutral-100"
                          value={nextCustomReminderLocal}
                          onChange={(e) => setNextCustomReminderLocal(e.target.value)}
                          disabled={reminderSettingsSaving}
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void saveReminderModeSettings()}
                      disabled={reminderSettingsSaving}
                      className="mt-4 inline-flex h-9 min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600 sm:w-auto"
                    >
                      {reminderSettingsSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : null}
                      שמור מצב תזכורות
                    </button>
                  </div>

                  <div className="rounded-xl border border-indigo-200/80 bg-white p-4 shadow-sm dark:border-indigo-800/50 dark:bg-neutral-900/40">
                    <div className="flex flex-wrap items-center gap-2 text-start">
                      <Clock
                        className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400"
                        aria-hidden
                      />
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        תזמון תזכורת ידנית (WhatsApp)
                      </h3>
                    </div>
                    {!hasPhone ? (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-start text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                        אין מספר טלפון ללקוח — לא ניתן לשלוח תזכורת WhatsApp.
                      </p>
                    ) : null}
                    <label className="mt-3 block text-start text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      תאריך ושעה לשליחה
                      <input
                        type="datetime-local"
                        dir="ltr"
                        className="mt-1 w-full h-9 min-h-9 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                        value={scheduleAtLocal}
                        onChange={(e) => setScheduleAtLocal(e.target.value)}
                        disabled={scheduleSubmitting || !hasPhone}
                      />
                    </label>
                    <label className="mt-3 block text-start text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      טקסט ההודעה
                      <textarea
                        rows={4}
                        className="mt-1 w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                        value={scheduleMessage}
                        onChange={(e) => setScheduleMessage(e.target.value)}
                        disabled={scheduleSubmitting || !hasPhone}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void scheduleManualWhatsAppReminder()}
                      disabled={scheduleSubmitting || !hasPhone}
                      className="mt-4 inline-flex h-9 min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600 sm:w-auto"
                    >
                      {scheduleSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden />
                      )}
                      תזמן תזכורת
                    </button>
                  </div>

                  <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-700 dark:bg-neutral-900/30">
                    <h3 className="text-start text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      תזכורות מתוזמנות
                    </h3>
                    {remindersLoadError ? (
                      <p className="mt-2 text-start text-xs text-red-700 dark:text-red-300">
                        {remindersLoadError}
                      </p>
                    ) : scheduledReminders.length === 0 ? (
                      <p className="mt-2 text-start text-xs text-neutral-600 dark:text-neutral-400">
                        אין תזכורות ממתינות.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {scheduledReminders.map((r) => (
                          <li
                            key={r.id}
                            className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-start dark:border-neutral-600 dark:bg-neutral-900/60 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-indigo-800 dark:text-indigo-200">
                                {new Date(r.scheduled_at).toLocaleString("he-IL", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                                {r.message}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void cancelScheduledReminder(r.id)}
                              disabled={cancellingReminderId === r.id}
                              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                            >
                              {cancellingReminderId === r.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <X className="h-3.5 w-3.5" aria-hidden />
                              )}
                              ביטול
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </SectionCard>
            </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminClientDetailPage() {
  return <AdminClientDetailPageInner />;
}
