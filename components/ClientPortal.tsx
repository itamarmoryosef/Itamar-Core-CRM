"use client";

import {
  Suspense,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  PenLine,
  Pencil,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getLayoutSectionsTableName } from "@/lib/layoutSectionsTable";
import { fetchClientRowForPortal } from "@/lib/fetchClientForPortal";
import { buildAgreementTemplateData } from "@/lib/populateAgreementDocx";
import { parseSignatureAnchor } from "@/lib/signatureAnchor";

/** Loads only when the signature UI mounts — keeps initial portal JS smaller. */
const SignaturePad = dynamic(
  () =>
    import("@/components/SignaturePad").then((m) => ({
      default: m.SignaturePad,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-2 text-start text-sm text-neutral-500">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        טוען אזור חתימה…
      </div>
    ),
  }
);
import {
  docRowMatchesRequiredDocType,
  documentRowHasRequiredChecklistUpload,
  documentRowHasUpload,
  effectiveRequiredDocNames,
  emptyPlaceholderRowsSameSemanticType,
  isPortalSignedDocumentRow,
  isRequiredDocsCompleteFromDocumentRows,
  stripExcludedRequiredDocKeys,
} from "@/lib/requiredDocuments";
import {
  ADMIN_OFFICE_AGREEMENT_DOC_TYPE,
  isDocumentRowVisibleInClientUi,
} from "@/lib/documentListVisibility";
import {
  DOCUMENTS_SIGNED_BUCKET,
  DOCUMENTS_UPLOAD_BUCKET,
  documentsUploadDownloadCandidates,
  downloadDocumentsUploadBlob,
  resolveDocumentsUploadStoragePath,
} from "@/lib/documentsUploadStorage";
import { prepareStorageObjectPathForSdk } from "@/lib/storagePublicUrl";
import {
  timestampedStorageObjectName,
  uniqueDocumentsUploadFolderSegment,
} from "@/lib/storageKey";
import {
  convertPortalDocumentImageToPdf,
  isRasterImageFileForPortalUpload,
} from "@/lib/portalDocumentImageToPdf";
import { buildClientPatchAfterSignatureDocumentDeleted } from "@/lib/agreementSignatureDeleteSync";
import { isPastPortalApplicationSubmit } from "@/lib/clientCrmStatus";
import {
  hasOutstandingTemplateAgreementQueue,
  needsAuxSignatureStep,
  normalizedAgreementTemplateIds,
  pendingSignatureDocuments,
  portalSignatureFullyComplete,
  portalSignatureWorkRemaining,
} from "@/lib/portalSignatureState";
import { stripClientIdentitySummaryFromAgreementHtml } from "@/lib/stripAgreementHtmlClientSummary";
import { PortalAgreementFormGrid } from "@/components/PortalAgreementFormGrid";
import {
  groupTemplateFieldsByRow,
  buildPdfStructuredRows,
  type TemplateFieldRow,
} from "@/lib/agreementFormTemplateLayout";
import { filterTemplateFieldsByAssignment } from "@/lib/fieldAssignment";
import { useClientBranding } from "@/components/branding/BrandingRoot";
import { parseClientCustomFieldsData } from "@/lib/customFieldsTemplate";
import { applyCalculationsToDraft } from "@/lib/crmFormulaEval";
import { normalizeCrmFieldType } from "@/lib/crmFieldLayout";
import {
  refreshDocumentRowDocxHtml,
  refreshTemplateAgreementHtml,
} from "@/lib/portalDocxAgreementRefresh";

type DocumentTypeRow = {
  id: string;
  name: string;
  download_link: string | null;
  created_at: string;
};

type ClientRow = {
  id: string;
  full_name: string;
  id_number: string;
  phone: string | null;
  fee_amount: number | null;
  fee_upfront: string | number | null;
  fee_success: string | number | null;
  has_signed: boolean | null;
  signature_url: string | null;
  signed_at: string | null;
  last_reminder_at: string | null;
  required_docs: unknown;
  status?: string | null;
  agreement_request_active?: boolean | null;
  agreement_source?: string | null;
  agreement_custom_pdf_path?: string | null;
  agreement_custom_pdf_filename?: string | null;
  /** Set when template/custom-pdf step is signed (after document queue, if any). */
  agreement_aux_signed_at?: string | null;
  /** When false, document upload checklist is hidden until the office enables it. */
  upload_request_active?: boolean | null;
  /** Ordered template UUIDs; empty = use latest active template (legacy). */
  agreement_template_ids?: string[] | null;
  /** Index into agreement_template_ids for the current template signature step. */
  agreement_template_sign_index?: number | null;
  /** Shown in agreement PDF before signature (admin: פרופיל לקוח). */
  agreement_notes?: string | null;
  total_amount?: number | null;
  payment_status?: string | null;
  /** Dynamic field values keyed by slug (Word: {{custom_slug}}). */
  custom_fields_data?: unknown;
  /** Structured form layout for portal (agreement_templates / legacy). */
  agreement_structure_template_id?: string | null;
  /** Structured signature template — PDF כולל בלוק «פרטים מהטופס» (signature_templates). */
  signature_template_id?: string | null;
  short_id?: string | null;
  /** If set, only these custom field definition IDs appear in the portal/PDF. */
  assigned_field_definition_ids?: string[] | null;
};

function feeDisplayText(
  primary: string | number | null | undefined,
  legacyAmount: number | null | undefined
): string {
  if (primary != null && primary !== "") {
    if (typeof primary === "number") {
      if (Number.isNaN(primary)) return "";
      return `${primary.toLocaleString("he-IL")} ₪`;
    }
    const t = String(primary).trim();
    if (t) return t;
  }
  if (legacyAmount != null && !Number.isNaN(Number(legacyAmount))) {
    return `${Number(legacyAmount).toLocaleString("he-IL")} ₪`;
  }
  return "";
}

type ClientPortalProps = {
  /** Always the real `clients.id` (UUID); the route may use short_id, resolved on the server. */
  clientId: string;
};

type PortalDocumentRow = {
  id: string;
  doc_type: string;
  file_url: string | null;
  original_filename: string | null;
  /** Path inside `documents-uploads`; required for private buckets / signed URLs. */
  storage_path: string | null;
  needs_signature?: boolean | null;
  signature_signed_at?: string | null;
  signed_pdf_storage_path?: string | null;
  signature_anchor?: unknown | null;
  created_at?: string | null;
};

type PortalSignatureStep =
  | { kind: "document"; doc: PortalDocumentRow }
  | { kind: "custom_pdf" }
  | { kind: "template" };

function isImageMimeType(t: string | undefined): boolean {
  return Boolean(t && t.toLowerCase().startsWith("image/"));
}

function replaceFileExtWithPdf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "document.pdf";
  return /\.[^./\\]+$/.test(trimmed)
    ? trimmed.replace(/\.[^./\\]+$/, ".pdf")
    : `${trimmed}.pdf`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("FILE_READER_FAILED"));
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.readAsDataURL(file);
  });
}

async function dataUrlToImageEl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
    img.src = dataUrl;
  });
}

/**
 * Client uploads only: normalize image uploads to PDF so downloads/open are stable.
 * Does not participate in signature generation flow.
 */
async function normalizeClientDocumentUploadFile(
  file: File
): Promise<{ uploadFile: File; originalNameForDb: string }> {
  if (!isImageMimeType(file.type)) {
    return { uploadFile: file, originalNameForDb: file.name };
  }

  const dataUrl = await fileToDataUrl(file);
  const img = await dataUrlToImageEl(dataUrl);
  const w = Math.max(1, img.naturalWidth || img.width || 1);
  const h = Math.max(1, img.naturalHeight || img.height || 1);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const jpegBytes = await fetch(jpegDataUrl).then((r) => r.arrayBuffer());

  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  // Keep the output readable/consistent: full-width image on A4-like page.
  const a4Portrait: [number, number] = [595.28, 841.89];
  const a4Landscape: [number, number] = [841.89, 595.28];
  const pageSize: [number, number] = w >= h ? a4Landscape : a4Portrait;
  const page = pdf.addPage(pageSize);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const jpg = await pdf.embedJpg(jpegBytes);
  const imageAspect = w / h;
  const drawWidth = pageWidth;
  const drawHeight = Math.min(pageHeight, drawWidth / imageAspect);
  const y = (pageHeight - drawHeight) / 2;
  page.drawImage(jpg, { x: 0, y, width: drawWidth, height: drawHeight });
  const pdfBytes = await pdf.save();

  const pdfName = replaceFileExtWithPdf(file.name);
  const pdfBlob = new Blob([Uint8Array.from(pdfBytes)], {
    type: "application/pdf",
  });
  const pdfFile = new File([pdfBlob], pdfName, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
  return {
    uploadFile: pdfFile,
    originalNameForDb: pdfName,
  };
}

/**
 * Unique PDF object name: signed_{template_id}_{timestamp}.pdf (single timestamp per save).
 */
function signedAgreementStorageObjectName(
  step: PortalSignatureStep,
  client: ClientRow,
  fileTimestamp: number
): string {
  if (step.kind === "document") {
    const safeId = step.doc.id.replace(/[^a-fA-F0-9-]/g, "") || "doc";
    return `signed_doc_${safeId}_${fileTimestamp}.pdf`;
  }
  if (step.kind === "custom_pdf") {
    return `signed_custom_${fileTimestamp}.pdf`;
  }
  const orderedIds = normalizedAgreementTemplateIds(
    client.agreement_template_ids
  );
  const idx = Math.max(
    0,
    Number(client.agreement_template_sign_index ?? 0) || 0
  );
  const templateId =
    orderedIds.length > 0 && idx < orderedIds.length
      ? orderedIds[idx]!.replace(/[^a-fA-F0-9-]/g, "") || "legacy"
      : "legacy";
  return `signed_${templateId}_${fileTimestamp}.pdf`;
}

const PORTAL_SIGNED_DOCUMENT_TYPE = "Signed Agreement";

/** `public.documents` insert shape for portal-signed PDF row (snake_case only). */
type PortalSignedDocumentDbInsert = {
  client_id: string;
  doc_type: string;
  status: "completed";
  file_url: string;
  original_filename: string;
  signed_pdf_storage_path: string;
  storage_path: string;
  needs_signature: false;
  signature_signed_at: string;
  name: string;
  document_type: string;
  is_active: true;
};

async function insertPortalSignedDocumentRow(args: {
  clientId: string;
  /** Hebrew display name, e.g. הסכם חתום - {timestamp} */
  displayName: string;
  /** Storage object path in documents-signed: {clientId}/{filename}.pdf */
  storagePath: string;
  /** Public URL for the signed PDF */
  publicUrl: string;
  /** Logical file name in storage (unique per save) */
  storageObjectName: string;
  /** Source template / upload filename for audit */
  originalTemplateName: string;
  signedAtIso: string;
}) {
  const client_id = args.clientId.trim();
  if (!client_id) {
    console.error(
      "[insertPortalSignedDocumentRow] missing or empty clientId"
    );
    return Promise.resolve({
      data: null,
      error: {
        message: "חסר מזהה לקוח (client_id)",
        details: "",
        hint: "",
        code: "APP_VALIDATION",
      },
    });
  }

  /** Same path in both columns so admin UI (view/download) always resolves the signed bucket. */
  const signedPath = args.storagePath.trim();
  const row: PortalSignedDocumentDbInsert = {
    client_id,
    doc_type: PORTAL_SIGNED_DOCUMENT_TYPE,
    status: "completed",
    file_url: args.publicUrl,
    original_filename: args.originalTemplateName,
    signed_pdf_storage_path: signedPath,
    storage_path: signedPath,
    needs_signature: false,
    signature_signed_at: args.signedAtIso,
    name: args.displayName,
    document_type: PORTAL_SIGNED_DOCUMENT_TYPE,
    is_active: true,
  };
  return supabase.from("documents").insert(row);
}

/** In-place replace of the unsigned row after the signed PDF is in `documents-signed`. */
async function updatePortalDocumentRowWithSignedPdf(args: {
  documentId: string;
  clientId: string;
  displayName: string;
  storagePath: string;
  publicUrl: string;
  storageObjectName: string;
  signedAtIso: string;
}) {
  const client_id = args.clientId.trim();
  const docId = args.documentId.trim();
  if (!client_id || !docId) {
    return Promise.resolve({
      error: {
        message: "חסר מזהה מסמך או לקוח",
        details: "",
        hint: "",
        code: "APP_VALIDATION",
      },
    });
  }
  const signedPath = args.storagePath.trim();
  return supabase
    .from("documents")
    .update({
      file_url: args.publicUrl,
      storage_path: signedPath,
      signed_pdf_storage_path: signedPath,
      needs_signature: false,
      signature_signed_at: args.signedAtIso,
      original_filename: args.storageObjectName,
      status: "completed",
      name: args.displayName,
      document_type: PORTAL_SIGNED_DOCUMENT_TYPE,
      is_active: true,
    })
    .eq("id", docId)
    .eq("client_id", client_id);
}

/**
 * CRM Thank You may show only when there is no template queue, the queue cursor
 * has moved past the last template, or the office recorded the final aux
 * signature (`agreement_aux_signed_at` — we do not advance sign_index to
 * `length` after the last sign).
 */
function templateQueueAllowsPortalThankYou(client: ClientRow): boolean {
  const ids = normalizedAgreementTemplateIds(client.agreement_template_ids);
  if (ids.length === 0) return true;
  const idx = Math.max(
    0,
    Number(client.agreement_template_sign_index ?? 0) || 0
  );
  if (idx >= ids.length) return true;
  return Boolean(client.agreement_aux_signed_at?.trim());
}

const TEMPLATE_MISSING_MSG =
  "לא נמצאה תבנית הסכם פעילה (קובץ ‎.docx) במערכת. יש להעלות תבנית מלוח הניהול (אזור ״תבנית הסכם״) לפני שניתן יהיה להציג את נוסח ההסכם ללקוח.";

const TEMPLATE_LOAD_FAIL_MSG =
  "לא ניתן לטעון את תבנית ההסכם מהשרת. ודאו שהתבנית קיימת באחסון ושהרשאות מוגדרות, או פנו למשרד.";

const AGREEMENT_INACTIVE_MSG =
  "בקשת החתימה הדיגיטלית טרם הופעלה על ידי המשרד. לאחר ההפעלה יוצג כאן נוסח ההסכם לקריאה ולחתימה.";

const PORTAL_THANK_YOU_MSG =
  "תודה, פרטיך התקבלו. נגיש אותך בהקדם האפשרי";

const SIGNATURE_RECEIVED_HOLD_MSG =
  "תודה על חתימתך. מיד נשלח לך קישור להעלאת המסמכים. עם קבלת כל המסמכים נתחיל בהליך ההגשה.";

const WORD_DOC_LOAD_ERROR_MSG = "שגיאה בטעינת קובץ הוורד";

const UUID_LIKE_HTML_PREFIX =
  /^\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function agreementHtmlLooksCorruptFromDocx(html: string): boolean {
  const t = html.trim();
  if (!t) return true;
  return UUID_LIKE_HTML_PREFIX.test(t);
}

type DocUploadBusy =
  | { mode: "add"; requiredDocName: string }
  | { mode: "replace"; documentId: string };

function ClientPortalImpl({ clientId }: ClientPortalProps) {
  const searchParams = useSearchParams();
  const portalMode = useMemo(() => {
    const m = searchParams.get("mode")?.trim().toLowerCase() ?? "";
    if (m === "sign") return "sign" as const;
    if (m === "documents") return "documents" as const;
    return null;
  }, [searchParams]);

  const clientBranding = useClientBranding();

  /** Documents-only link: hide agreement / signature UI. */
  const hideSignatureUi = portalMode === "documents";
  /** Sign-only link: hide required-doc upload checklist. */
  const hideDocumentsUi = portalMode === "sign";

  const [client, setClient] = useState<ClientRow | null | undefined>(
    undefined
  );
  const [portalDocumentRows, setPortalDocumentRows] = useState<
    PortalDocumentRow[]
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signSaving, setSignSaving] = useState(false);
  const [signedDownloadBusy, setSignedDownloadBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  /** Brief message when advancing document/template queue without showing the full success screen. */
  const [signatureQueueAdvanceNotice, setSignatureQueueAdvanceNotice] =
    useState<string | null>(null);
  const [docUploadBusy, setDocUploadBusy] = useState<DocUploadBusy | null>(
    null
  );
  const [docError, setDocError] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null
  );
  const [submitApplicationBusy, setSubmitApplicationBusy] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeRow[]>([]);
  const [documentTypesLoading, setDocumentTypesLoading] = useState(false);
  const [documentTypesError, setDocumentTypesError] = useState<string | null>(
    null
  );
  const [agreementHtml, setAgreementHtml] = useState<string>("");
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementError, setAgreementError] = useState<string | null>(null);
  const [agreementPdfUrl, setAgreementPdfUrl] = useState<string | null>(null);
  const agreementBlobUrlRef = useRef<string | null>(null);
  const agreementDocxRetryKeyRef = useRef("");
  const agreementDocxRetryCountRef = useRef(0);
  const [signatureDocsLoaded, setSignatureDocsLoaded] = useState(false);
  const [docsOnlyFinishMessage, setDocsOnlyFinishMessage] = useState<
    string | null
  >(null);
  /** Set when a terminal signature save completes; stable across background reloads of client/docs. */
  const [isSuccessfullySigned, setIsSuccessfullySigned] = useState(false);

  const postSignatureAudit = (shortId: string | null | undefined) => {
    const sid = shortId?.trim().toLowerCase() ?? "";
    if (!/^[a-z0-9]{6}$/.test(sid)) return;
    void fetch("/api/portal/signature-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shortId: sid,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    }).catch(() => {});
  };
  /** From the last successful save — enables download before documents list catches up. */
  const [lastSignedPdfPath, setLastSignedPdfPath] = useState<string | null>(
    null
  );
  const [lastSignedPdfPublicUrl, setLastSignedPdfPublicUrl] = useState<
    string | null
  >(null);

  const [structureFields, setStructureFields] = useState<TemplateFieldRow[]>(
    []
  );
  const structureLayoutRef = useRef<TemplateFieldRow[]>([]);
  const customFieldDefinitionSlugsRef = useRef<string[]>([]);
  const [portalFieldDraft, setPortalFieldDraft] = useState<
    Record<string, string>
  >({});
  const portalFieldDraftRef = useRef<Record<string, string>>({});
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const portalGridValues = useMemo(() => {
    const merged = applyCalculationsToDraft(
      portalFieldDraft,
      structureFields
    );
    const out = { ...portalFieldDraft };
    for (const tf of structureFields) {
      if (normalizeCrmFieldType(tf.definition.field_type) === "calculation") {
        out[tf.definition.slug] = merged[tf.definition.slug] ?? "";
      }
    }
    return out;
  }, [portalFieldDraft, structureFields]);

  useEffect(() => {
    setIsSuccessfullySigned(false);
    setLastSignedPdfPath(null);
    setLastSignedPdfPublicUrl(null);
  }, [clientId]);

  useEffect(() => {
    if (portalMode !== "documents") setDocsOnlyFinishMessage(null);
  }, [portalMode]);

  useEffect(() => {
    if (client?.upload_request_active === true && portalMode === "documents") {
      setDocsOnlyFinishMessage(null);
    }
  }, [client?.upload_request_active, portalMode]);

  const revokeAgreementBlobUrl = useCallback(() => {
    if (agreementBlobUrlRef.current) {
      URL.revokeObjectURL(agreementBlobUrlRef.current);
      agreementBlobUrlRef.current = null;
    }
    setAgreementPdfUrl(null);
  }, []);

  const loadClient = useCallback(async () => {
    setLoadError(null);
    const portalRes = await fetchClientRowForPortal(supabase, clientId);
    const { data, error } = portalRes;

    if (error) {
      console.warn("[ClientPortal] loadClient:", error);
      setLoadError("שגיאה בטעינת פרטי הלקוח. נסו שוב מאוחר יותר.");
      setClient(null);
      customFieldDefinitionSlugsRef.current = [];
      return;
    }
    if (!data) {
      setLoadError(null);
      setClient(null);
      customFieldDefinitionSlugsRef.current = [];
      return;
    }
    setClient(data as ClientRow);
    const row = data as ClientRow;
    const assigned = row.assigned_field_definition_ids;
    if (assigned == null) {
      const { data: slugRows } = await supabase
        .from("custom_field_definitions")
        .select("slug");
      customFieldDefinitionSlugsRef.current = (slugRows as { slug: string }[] | null)
        ?.map((r) => r.slug?.trim())
        .filter((s): s is string => Boolean(s)) ?? [];
    } else {
      const ids = (assigned as unknown[]).map((x) => String(x).trim()).filter(Boolean);
      if (ids.length === 0) {
        customFieldDefinitionSlugsRef.current = [];
      } else {
        const { data: slugRows } = await supabase
          .from("custom_field_definitions")
          .select("slug")
          .in("id", ids);
        customFieldDefinitionSlugsRef.current = (slugRows as { slug: string }[] | null)
          ?.map((r) => r.slug?.trim())
          .filter((s): s is string => Boolean(s)) ?? [];
      }
    }
  }, [clientId]);

  const loadDocuments = useCallback(async (): Promise<
    PortalDocumentRow[] | null
  > => {
    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, doc_type, file_url, original_filename, storage_path, needs_signature, signature_signed_at, signed_pdf_storage_path, signature_anchor, created_at"
      )
      .eq("client_id", clientId);

    if (error) {
      setPortalDocumentRows([]);
      setSignatureDocsLoaded(true);
      return null;
    }
    const rows = (data ?? []) as PortalDocumentRow[];
    setPortalDocumentRows(rows);
    setSignatureDocsLoaded(true);
    return rows;
  }, [clientId]);

  /** Realtime fires on every row change — debounce so we don't re-run mammoth/PDF loadAgreement in a loop. */
  const documentsRealtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const scheduleLoadDocumentsFromRealtime = useCallback(() => {
    if (documentsRealtimeTimerRef.current) {
      clearTimeout(documentsRealtimeTimerRef.current);
    }
    documentsRealtimeTimerRef.current = setTimeout(() => {
      documentsRealtimeTimerRef.current = null;
      void loadDocuments();
    }, 500);
  }, [loadDocuments]);

  const clientsRealtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const scheduleLoadClientFromRealtime = useCallback(() => {
    if (clientsRealtimeTimerRef.current) {
      clearTimeout(clientsRealtimeTimerRef.current);
    }
    clientsRealtimeTimerRef.current = setTimeout(() => {
      clientsRealtimeTimerRef.current = null;
      void loadClient();
    }, 500);
  }, [loadClient]);

  const loadDocumentTypes = useCallback(async () => {
    setDocumentTypesLoading(true);
    setDocumentTypesError(null);
    const { data, error } = await supabase
      .from("document_types")
      .select("id, name, download_link, created_at")
      .order("created_at", { ascending: true });

    setDocumentTypesLoading(false);
    if (error) {
      setDocumentTypesError(error.message);
      setDocumentTypes([]);
      return;
    }
    setDocumentTypes((data ?? []) as DocumentTypeRow[]);
  }, []);

  useEffect(() => {
    setSignatureDocsLoaded(false);
  }, [clientId]);

  useEffect(() => {
    void loadClient();
  }, [loadClient]);

  useEffect(() => {
    if (!clientId) return;
    const ch = supabase
      .channel(`client-row-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "clients",
          filter: `id=eq.${clientId}`,
        },
        () => {
          scheduleLoadClientFromRealtime();
        }
      )
      .subscribe();

    return () => {
      if (clientsRealtimeTimerRef.current) {
        clearTimeout(clientsRealtimeTimerRef.current);
        clientsRealtimeTimerRef.current = null;
      }
      void supabase.removeChannel(ch);
    };
  }, [clientId, scheduleLoadClientFromRealtime]);

  useEffect(() => {
    if (!clientId) return;
    const ch = supabase
      .channel(`portal-docs-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          scheduleLoadDocumentsFromRealtime();
        }
      )
      .subscribe();
    return () => {
      if (documentsRealtimeTimerRef.current) {
        clearTimeout(documentsRealtimeTimerRef.current);
        documentsRealtimeTimerRef.current = null;
      }
      void supabase.removeChannel(ch);
    };
  }, [clientId, scheduleLoadDocumentsFromRealtime]);

  useEffect(() => {
    if (client && client !== null) {
      void loadDocuments();
    }
  }, [client, loadDocuments]);

  useEffect(() => {
    if (!client) {
      setPortalFieldDraft({});
      portalFieldDraftRef.current = {};
      return;
    }
    const p = parseClientCustomFieldsData(client.custom_fields_data);
    setPortalFieldDraft(p);
    portalFieldDraftRef.current = p;
  }, [client?.id, client?.custom_fields_data]);

  useEffect(() => {
    let cancelled = false;
    const newTid = client?.signature_template_id?.trim();
    const legacyTid = client?.agreement_structure_template_id?.trim();
    if (!newTid && !legacyTid) {
      setStructureFields([]);
      structureLayoutRef.current = [];
      return;
    }
    void (async () => {
      const secTable = await getLayoutSectionsTableName(supabase);
      const defSel =
        secTable === "crm_layout_sections"
          ? "label, slug, field_type, options, formula, section_id, row_number, column_span, sort_order, crm_layout_sections ( title, sort_order )"
          : "label, slug, field_type, options, formula, section_id, row_number, column_span, sort_order, custom_field_sections ( title, sort_order )";
      const q = newTid
        ? supabase
            .from("signature_template_fields")
            .select(
              `id, row_number, col_span, sort_order, definition_id, custom_field_definitions (${defSel})`
            )
            .eq("template_id", newTid)
        : supabase
            .from("template_fields")
            .select(
              `id, row_number, col_span, sort_order, definition_id, custom_field_definitions (${defSel})`
            )
            .eq("template_id", legacyTid!);
      const { data, error } = await q
        .order("row_number", { ascending: true })
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error || !data) {
        setStructureFields([]);
        structureLayoutRef.current = [];
        return;
      }
      const mapped: TemplateFieldRow[] = [];
      for (const r of data as Record<string, unknown>[]) {
        const def = r.custom_field_definitions as
          | Record<string, unknown>
          | null
          | undefined;
        const slug = def?.slug != null ? String(def.slug).trim() : "";
        if (!slug) continue;
        let secRaw = (def?.crm_layout_sections ??
          def?.custom_field_sections) as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null
          | undefined;
        if (Array.isArray(secRaw)) {
          secRaw = (secRaw[0] as Record<string, unknown> | undefined) ?? null;
        }
        const sectionId =
          def?.section_id != null && String(def.section_id).trim() !== ""
            ? String(def.section_id)
            : null;
        const sectionTitle =
          secRaw?.title != null ? String(secRaw.title) : null;
        const sectionSortOrder =
          secRaw != null && typeof secRaw === "object"
            ? Number(secRaw.sort_order) || 0
            : sectionId
              ? 0
              : 1_000_000;
        mapped.push({
          id: String(r.id),
          row_number: Number(r.row_number) || 1,
          col_span: Number(r.col_span) || 4,
          sort_order: Number(r.sort_order) || 0,
          definition_id: String(r.definition_id),
          definition: {
            label: def?.label != null ? String(def.label) : slug,
            slug,
            field_type:
              def?.field_type != null ? String(def.field_type) : "text",
            formula:
              def?.formula != null && String(def.formula).trim() !== ""
                ? String(def.formula)
                : null,
            options: def?.options,
            section_id: sectionId,
            section_title: sectionTitle,
            section_sort_order: sectionSortOrder,
            crm_row_number: Number(def?.row_number) || 1,
            crm_column_span: Number(def?.column_span) || 4,
            crm_sort_order: Number(def?.sort_order) || 0,
          },
        });
      }
      const assigned = client?.assigned_field_definition_ids;
      const visible = filterTemplateFieldsByAssignment(mapped, assigned);
      structureLayoutRef.current = visible;
      setStructureFields(visible);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    client?.signature_template_id,
    client?.agreement_structure_template_id,
    client?.id,
    client?.assigned_field_definition_ids,
  ]);

  useEffect(() => {
    if (!client || client === null) return;
    if (hideSignatureUi) {
      void loadDocumentTypes();
      return;
    }
    const sigRemaining = portalSignatureWorkRemaining(
      portalDocumentRows,
      client
    );
    if (
      !sigRemaining &&
      !isPastPortalApplicationSubmit(client.status) &&
      client.upload_request_active === true
    ) {
      void loadDocumentTypes();
    }
  }, [client, portalDocumentRows, loadDocumentTypes, hideSignatureUi]);

  useEffect(() => {
    if (client === undefined) return;
    if (client === null) {
      revokeAgreementBlobUrl();
      return;
    }
    if (hideSignatureUi) {
      revokeAgreementBlobUrl();
      setAgreementLoading(false);
      setAgreementError(null);
      setAgreementHtml("");
      return;
    }
    const row = client;
    if (!portalSignatureWorkRemaining(portalDocumentRows, row)) {
      revokeAgreementBlobUrl();
      setAgreementLoading(false);
      return;
    }

    let cancelled = false;

    const pending = pendingSignatureDocuments(portalDocumentRows);
    const auxAfterDocs = needsAuxSignatureStep(row, pending.length);
    let step: PortalSignatureStep | null = null;
    if (pending.length > 0) {
      step = { kind: "document", doc: pending[0] };
    } else if (auxAfterDocs) {
      const src = String(row.agreement_source ?? "").trim();
      if (src === "custom_pdf" && row.agreement_custom_pdf_path?.trim()) {
        step = { kind: "custom_pdf" };
      } else {
        step = { kind: "template" };
      }
    }

    async function loadAgreement() {
      revokeAgreementBlobUrl();
      setAgreementHtml("");
      setAgreementError(null);

      if (row.agreement_request_active === false) {
        setAgreementLoading(false);
        setAgreementError(AGREEMENT_INACTIVE_MSG);
        return;
      }

      const agreementLikelyActive =
        row.agreement_request_active == null ||
        row.agreement_request_active === true;
      const templateQueueOutstanding =
        hasOutstandingTemplateAgreementQueue(row);
      if (
        !signatureDocsLoaded &&
        agreementLikelyActive &&
        (row.has_signed !== true || templateQueueOutstanding)
      ) {
        setAgreementLoading(true);
        return;
      }

      if (!step) {
        setAgreementLoading(false);
        setAgreementError(
          "טרם סומנו מסמכי PDF או ‎.docx לחתימה, או שאין בקשת חתימה פעילה. פנו למשרד."
        );
        return;
      }

      if (step.kind === "document") {
        setAgreementLoading(true);
        try {
          const docRow = step.doc;
          const uploadPath =
            resolveDocumentsUploadStoragePath(
              docRow.storage_path,
              docRow.file_url
            ) ?? "";

          const { data, error: dlErr, triedKeys, usedKey } =
            await downloadDocumentsUploadBlob(
              supabase,
              docRow.storage_path,
              docRow.file_url
            );

          if (dlErr || !data) {
            console.error(
              "[ClientPortal] documents-upload download failed",
              dlErr?.message ?? dlErr,
              { triedKeys, uploadPath: uploadPath || null }
            );
            if (!cancelled) {
              setAgreementError(WORD_DOC_LOAD_ERROR_MSG);
              setAgreementHtml("");
            }
            return;
          }

          const buf = await data.arrayBuffer();

          if (!buf || buf.byteLength === 0) {
            console.error(
              "[ClientPortal] loadAgreement document: empty buffer"
            );
            if (!cancelled) {
              setAgreementError(WORD_DOC_LOAD_ERROR_MSG);
              setAgreementHtml("");
            }
            return;
          }

          const nameLower = (docRow.original_filename ?? "").toLowerCase();
          const pathForType = (usedKey ?? uploadPath).toLowerCase();
          const isDocx =
            nameLower.endsWith(".docx") || pathForType.endsWith(".docx");

          if (isDocx) {
            const docxKey = `doc:${docRow.id}`;
            if (agreementDocxRetryKeyRef.current !== docxKey) {
              agreementDocxRetryKeyRef.current = docxKey;
              agreementDocxRetryCountRef.current = 0;
            }

            let html: string;
            try {
              const { populateDocxTemplateToHtml } = await import(
                "@/lib/populateAgreementDocx"
              );
              const populated = await populateDocxTemplateToHtml(
                buf,
                buildAgreementTemplateData(
                  row,
                  customFieldDefinitionSlugsRef.current
                )
              );
              html = populated.html;
            } catch (e) {
              console.error(
                "[ClientPortal] populateDocxTemplateToHtml (document) failed",
                e
              );
              if (!cancelled) {
                setAgreementError(WORD_DOC_LOAD_ERROR_MSG);
                setAgreementHtml("");
              }
              return;
            }

            const stripped = stripClientIdentitySummaryFromAgreementHtml(html);

            if (agreementHtmlLooksCorruptFromDocx(stripped)) {
              console.warn(
                "[ClientPortal] loadAgreement: corrupt docx HTML (document row)",
                stripped.slice(0, 160)
              );
              if (agreementDocxRetryCountRef.current < 1) {
                agreementDocxRetryCountRef.current += 1;
                await new Promise((r) => setTimeout(r, 500));
                if (!cancelled) {
                  setAgreementLoading(true);
                  return await loadAgreement();
                }
              }
              if (!cancelled) {
                setAgreementError(WORD_DOC_LOAD_ERROR_MSG);
                setAgreementHtml("");
                revokeAgreementBlobUrl();
                setAgreementPdfUrl(null);
              }
              return;
            }

            agreementDocxRetryCountRef.current = 0;

            if (!cancelled) {
              setAgreementHtml(stripped);
              setAgreementError(null);
              setAgreementPdfUrl(null);
            }
          } else {
            const blob = new Blob([buf], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            agreementBlobUrlRef.current = url;
            if (!cancelled) {
              setAgreementPdfUrl(url);
              setAgreementError(null);
            } else {
              URL.revokeObjectURL(url);
              agreementBlobUrlRef.current = null;
            }
          }
        } catch {
          if (!cancelled) {
            setAgreementError(
              "טרם הועלה מסמך לחתימה, או שהקובץ נמחק / אינו זמין. פנו למשרד."
            );
          }
        } finally {
          if (!cancelled) setAgreementLoading(false);
        }
        return;
      }

      if (step.kind === "custom_pdf") {
        const customPath = row.agreement_custom_pdf_path?.trim();
        if (!customPath) {
          setAgreementLoading(false);
          setAgreementError("לא נמצא קובץ הסכם. פנו למשרד.");
          return;
        }
        const customKey = prepareStorageObjectPathForSdk(customPath);
        setAgreementLoading(true);
        try {
          const { data, error: dlErr } = await supabase.storage
            .from("client-agreements")
            .download(customKey);

          if (dlErr || !data) {
            throw dlErr ?? new Error("download failed");
          }

          const buf = await data.arrayBuffer();
          const blob = new Blob([buf], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          agreementBlobUrlRef.current = url;
          if (!cancelled) {
            setAgreementPdfUrl(url);
            setAgreementError(null);
          } else {
            URL.revokeObjectURL(url);
            agreementBlobUrlRef.current = null;
          }
        } catch {
          if (!cancelled) {
            setAgreementError(
              "לא ניתן לטעון את קובץ ההסכם. פנו למשרד או נסו לרענן את הדף."
            );
          }
        } finally {
          if (!cancelled) setAgreementLoading(false);
        }
        return;
      }

      setAgreementLoading(true);
      try {
        const orderedIds = normalizedAgreementTemplateIds(
          row.agreement_template_ids
        );
        const signIdx = Math.max(
          0,
          Number(row.agreement_template_sign_index ?? 0) || 0
        );
        const currentTemplateId =
          orderedIds.length > 0 && signIdx < orderedIds.length
            ? orderedIds[signIdx]
            : null;

        if (orderedIds.length > 0 && !currentTemplateId) {
          if (!cancelled) {
            setAgreementError(
              "מצב תבניות בפורטל אינו תקין. פנו למשרד לאיפוס בקשת החתימה."
            );
            setAgreementHtml("");
          }
          return;
        }

        let template: { storage_path: string } | null = null;
        let templateError: { message: string } | null = null;

        if (currentTemplateId) {
          const res = await supabase
            .from("templates")
            .select("storage_path")
            .eq("id", currentTemplateId)
            .eq("is_active", true)
            .maybeSingle();
          template = res.data;
          templateError = res.error;
        } else {
          const res = await supabase
            .from("templates")
            .select("storage_path")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          template = res.data;
          templateError = res.error;
        }

        if (templateError) throw templateError;

        if (!template?.storage_path) {
          if (!cancelled) {
            setAgreementError(
              currentTemplateId
                ? "התבנית שנבחרה אינה זמינה או אינה פעילה. פנו למשרד."
                : TEMPLATE_MISSING_MSG
            );
            setAgreementHtml("");
          }
          return;
        }

        const templateKey = prepareStorageObjectPathForSdk(
          template.storage_path
        );
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from("documents-templates")
          .download(templateKey);

        if (downloadError || !fileBlob) {
          console.error(
            "[ClientPortal] documents-templates download failed",
            downloadError?.message ?? downloadError,
            { templateKey }
          );
          if (!cancelled) {
            setAgreementError(WORD_DOC_LOAD_ERROR_MSG);
            setAgreementHtml("");
          }
          return;
        }

        const arrayBuffer = await fileBlob.arrayBuffer();

        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          console.error(
            "[ClientPortal] loadAgreement template: empty array buffer"
          );
          if (!cancelled) {
            setAgreementError(WORD_DOC_LOAD_ERROR_MSG);
            setAgreementHtml("");
          }
          return;
        }

        const docxKey = `tpl:${template.storage_path}`;
        if (agreementDocxRetryKeyRef.current !== docxKey) {
          agreementDocxRetryKeyRef.current = docxKey;
          agreementDocxRetryCountRef.current = 0;
        }

        let html: string;
        try {
          const { populateDocxTemplateToHtml } = await import(
            "@/lib/populateAgreementDocx"
          );
          const populated = await populateDocxTemplateToHtml(
            arrayBuffer,
            buildAgreementTemplateData(
              row,
              customFieldDefinitionSlugsRef.current
            )
          );
          html = populated.html;
        } catch (e) {
          console.error(
            "[ClientPortal] populateDocxTemplateToHtml (template) failed",
            e
          );
          if (!cancelled) {
            setAgreementError(WORD_DOC_LOAD_ERROR_MSG);
            setAgreementHtml("");
          }
          return;
        }

        const stripped = stripClientIdentitySummaryFromAgreementHtml(html);

        if (agreementHtmlLooksCorruptFromDocx(stripped)) {
          console.warn(
            "[ClientPortal] loadAgreement: corrupt or uuid-like docx HTML",
            stripped.slice(0, 160)
          );
          if (agreementDocxRetryCountRef.current < 1) {
            agreementDocxRetryCountRef.current += 1;
            await new Promise((r) => setTimeout(r, 500));
            if (!cancelled) {
              setAgreementLoading(true);
              return await loadAgreement();
            }
          }
          if (!cancelled) {
            setAgreementError(WORD_DOC_LOAD_ERROR_MSG);
            setAgreementHtml("");
            revokeAgreementBlobUrl();
            setAgreementPdfUrl(null);
          }
          return;
        }

        agreementDocxRetryCountRef.current = 0;

        if (!cancelled) {
          setAgreementHtml(stripped);
          setAgreementError(null);
          setAgreementPdfUrl(null);
        }
      } catch {
        if (!cancelled) {
          setAgreementError(TEMPLATE_LOAD_FAIL_MSG);
          setAgreementHtml("");
        }
      } finally {
        if (!cancelled) setAgreementLoading(false);
      }
    }

    void loadAgreement();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    portalDocumentRows,
    revokeAgreementBlobUrl,
    signatureDocsLoaded,
    hideSignatureUi,
  ]);

  /** Hide queue-advance toast once the next agreement finishes loading (or shortly after). */
  useEffect(() => {
    if (!signatureQueueAdvanceNotice) return;
    if (agreementLoading) return;
    const id = window.setTimeout(() => {
      setSignatureQueueAdvanceNotice(null);
    }, 900);
    return () => window.clearTimeout(id);
  }, [signatureQueueAdvanceNotice, agreementLoading]);

  useEffect(() => {
    return () => {
      if (agreementBlobUrlRef.current) {
        URL.revokeObjectURL(agreementBlobUrlRef.current);
        agreementBlobUrlRef.current = null;
      }
    };
  }, []);

  const inSignaturePhase = useMemo(() => {
    if (!client) return false;
    return portalSignatureWorkRemaining(portalDocumentRows, client);
  }, [client, portalDocumentRows]);

  /**
   * `?mode=documents`: hide signature UI but DB may still report signature work — must not block
   * the document upload section or the "uploads not yet open" gate (avoids blank screen).
   */
  const signatureWorkBlocksUploadFlow = inSignaturePhase && !hideSignatureUi;

  const agreementPending = Boolean(
    client && inSignaturePhase && agreementLoading
  );

  const agreementInactive = client?.agreement_request_active === false;

  const pendingSigDocs = useMemo(
    () => pendingSignatureDocuments(portalDocumentRows),
    [portalDocumentRows]
  );

  const signatureTasksForList = useMemo(() => {
    return portalDocumentRows
      .filter(
        (d) => d.needs_signature === true && documentRowHasUpload(d)
      )
      .slice()
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      });
  }, [portalDocumentRows]);

  const currentAgreementFileLabel = useMemo(() => {
    if (!client || !inSignaturePhase) return "";
    const aux = needsAuxSignatureStep(client, pendingSigDocs.length);
    if (pendingSigDocs.length > 0) {
      return pendingSigDocs[0].original_filename?.trim() || "מסמך לחתימה";
    }
    if (aux && client.agreement_source === "custom_pdf") {
      return client.agreement_custom_pdf_filename?.trim() || "הסכם PDF";
    }
    return "נוסח מהתבנית";
  }, [client, inSignaturePhase, pendingSigDocs]);

  /** Progress through document signatures + optional agreement (template/custom) step(s). */
  const signatureProgressLabel = useMemo(() => {
    if (!client || hideSignatureUi || !inSignaturePhase) return null;
    const docTasks = signatureTasksForList;
    const templateIds = normalizedAgreementTemplateIds(client.agreement_template_ids);
    const templateIdx = Math.max(
      0,
      Number(client.agreement_template_sign_index ?? 0) || 0
    );
    const src = String(client.agreement_source ?? "").trim();
    let templateStepCount = 0;
    if (client.agreement_request_active !== false) {
      if (src === "custom_pdf" && client.agreement_custom_pdf_path?.trim()) {
        templateStepCount = 1;
      } else if (src === "template" || src === "") {
        templateStepCount = templateIds.length > 0 ? templateIds.length : 1;
      }
    }
    const totalSteps = docTasks.length + templateStepCount;
    if (totalSteps <= 0) return null;

    let currentStep = 1;
    if (pendingSigDocs.length > 0) {
      const firstId = pendingSigDocs[0]!.id;
      const ix = docTasks.findIndex((d) => d.id === firstId);
      currentStep = ix >= 0 ? ix + 1 : Math.min(docTasks.length, totalSteps);
    } else if (
      needsAuxSignatureStep(client, pendingSigDocs.length) &&
      templateStepCount > 0
    ) {
      currentStep = docTasks.length + Math.min(templateIdx + 1, templateStepCount);
    } else {
      currentStep = totalSteps;
    }

    currentStep = Math.max(1, Math.min(currentStep, totalSteps));
    return `מסמך ${currentStep} מתוך ${totalSteps}`;
  }, [
    client,
    hideSignatureUi,
    inSignaturePhase,
    signatureTasksForList,
    pendingSigDocs,
  ]);

  const isPdfAgreement = useMemo(() => {
    if (!client || !inSignaturePhase) return false;
    const aux = needsAuxSignatureStep(client, pendingSigDocs.length);
    if (pendingSigDocs.length > 0) return true;
    if (aux && client.agreement_source === "custom_pdf") return true;
    return false;
  }, [client, inSignaturePhase, pendingSigDocs]);

  const portalRequiredDocNames = useMemo(() => {
    if (!client) return [];
    return effectiveRequiredDocNames(client.required_docs);
  }, [client]);

  const requiredDocItems = useMemo(() => {
    if (!client) return [];
    return portalRequiredDocNames.map((name) => ({
      name,
      downloadLink:
        documentTypes.find((t) => t.name === name)?.download_link?.trim() ||
        null,
    }));
  }, [client, documentTypes, portalRequiredDocNames]);

  /** CRM "application submitted" thank-you — uses `status` + template queue only (not `required_docs`). */
  const showPortalThankYou = useMemo(() => {
    if (!client) return false;
    if (!isPastPortalApplicationSubmit(client.status)) return false;
    return templateQueueAllowsPortalThankYou(client);
  }, [client]);

  const uploadRequestActive = client?.upload_request_active === true;

  const signatureFullyDone = useMemo(() => {
    if (!client) return false;
    return portalSignatureFullyComplete(portalDocumentRows, client);
  }, [client, portalDocumentRows]);

  const hadSignatureContext = useMemo(() => {
    if (!client) return false;
    if (client.agreement_request_active === true) return true;
    return portalDocumentRows.some(
      (d) =>
        d.needs_signature === true || Boolean(d.signature_signed_at?.trim())
    );
  }, [client, portalDocumentRows]);

  /**
   * Default portal (not `?mode=sign` / `?mode=documents`): once every signature step is done,
   * show the required-document checklist without `upload_request_active` — otherwise clients
   * only see "שלב העלאת המסמכים טרם נפתח" and cannot upload until a WhatsApp ping.
   *
   * After the office turns off `agreement_request_active`, `hadSignatureContext` can become false
   * even though the client signed (`has_signed`) — keep unlock based on `has_signed` too.
   */
  const postSignatureUploadsUnlocked = useMemo(
    () =>
      !hideSignatureUi &&
      !hideDocumentsUi &&
      (hadSignatureContext || client?.has_signed === true) &&
      signatureFullyDone &&
      !inSignaturePhase,
    [
      hideSignatureUi,
      hideDocumentsUi,
      hadSignatureContext,
      client?.has_signed,
      signatureFullyDone,
      inSignaturePhase,
    ]
  );

  /**
   * Signature-finished UI (SIGNATURE_RECEIVED_HOLD_MSG + download).
   * Depends only on agreement/signature DB state (`portalSignatureFullyComplete`, `isSuccessfullySigned`,
   * `hadSignatureContext`) — never on `required_docs` / upload checklist.
   * `requiredDocItems` uses `effectiveRequiredDocNames` (legacy exam-proof entries stripped in lib).
   */
  const showSignatureSuccessScreen = useMemo(() => {
    if (hideSignatureUi) return false;
    if (showPortalThankYou) return false;
    if (signatureWorkBlocksUploadFlow) return false;
    if (isSuccessfullySigned) return true;
    if (!client) return false;
    if (inSignaturePhase) return false;
    if (!signatureFullyDone) return false;
    if (!hadSignatureContext) return false;
    return true;
  }, [
    hideSignatureUi,
    showPortalThankYou,
    signatureWorkBlocksUploadFlow,
    isSuccessfullySigned,
    client,
    inSignaturePhase,
    signatureFullyDone,
    hadSignatureContext,
  ]);

  const showWaitingForUploadGate = useMemo(() => {
    if (!client || showPortalThankYou) return false;
    if (hideSignatureUi) return false;
    if (signatureWorkBlocksUploadFlow) return false;
    if (uploadRequestActive) return false;
    if (showSignatureSuccessScreen && !hideSignatureUi) return false;
    if (postSignatureUploadsUnlocked) return false;
    if (requiredDocItems.length === 0) return false;
    return true;
  }, [
    client,
    showPortalThankYou,
    hideSignatureUi,
    signatureWorkBlocksUploadFlow,
    uploadRequestActive,
    showSignatureSuccessScreen,
    postSignatureUploadsUnlocked,
    requiredDocItems.length,
  ]);

  const allRequiredDocsUploaded = useMemo(() => {
    if (!client) return false;
    const required = effectiveRequiredDocNames(client.required_docs);
    if (required.length === 0) return true;
    return isRequiredDocsCompleteFromDocumentRows(required, portalDocumentRows);
  }, [client, portalDocumentRows]);

  /**
   * After portal submit, the sign flow shows thank-you only (no duplicate checklist).
   * Exceptions: `?mode=documents`, reopened upload, or new required items still missing files.
   */
  const portalThankYouSuppressesClientWork = useMemo(
    () =>
      showPortalThankYou &&
      !hideSignatureUi &&
      !uploadRequestActive &&
      allRequiredDocsUploaded,
    [
      showPortalThankYou,
      hideSignatureUi,
      uploadRequestActive,
      allRequiredDocsUploaded,
    ]
  );

  /**
   * Sign portal: checklist only when upload step is active, unless post-submit missing new requirements.
   * Documents link: always show when not in sign-only mode.
   */
  const documentsUploadSectionVisible =
    !hideDocumentsUi &&
    (uploadRequestActive ||
      hideSignatureUi ||
      (showPortalThankYou &&
        requiredDocItems.length > 0 &&
        !allRequiredDocsUploaded) ||
      (postSignatureUploadsUnlocked && requiredDocItems.length > 0));

  /** After admin adds required types, drop the old "הכל התקבל" banner so uploads are usable again. */
  useEffect(() => {
    if (client != null && !allRequiredDocsUploaded) {
      setDocsOnlyFinishMessage(null);
    }
  }, [client, allRequiredDocsUploaded]);

  /** Documents link: refresh client/docs when returning to the tab (picks up new `required_docs` from admin). */
  useEffect(() => {
    if (portalMode !== "documents") return;
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void loadClient();
        void loadDocuments();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [portalMode, loadClient, loadDocuments]);

  const showStructuredPortalForm =
    (Boolean(client?.signature_template_id?.trim()) ||
      Boolean(client?.agreement_structure_template_id?.trim())) &&
    structureFields.length > 0;

  const portalFormComplete = useMemo(() => {
    if (!showStructuredPortalForm) return true;
    const merged = applyCalculationsToDraft(portalFieldDraft, structureFields);
    for (const tf of structureFields) {
      if (normalizeCrmFieldType(tf.definition.field_type) === "calculation") {
        continue;
      }
      const v = (merged[tf.definition.slug] ?? "").trim();
      if (!v) return false;
    }
    return true;
  }, [showStructuredPortalForm, structureFields, portalFieldDraft]);

  const flushPortalFieldDraft = useCallback(
    async (data: Record<string, string>) => {
      const id = String(clientId ?? "").trim();
      if (!id) return;
      await supabase
        .from("clients")
        .update({ custom_fields_data: data })
        .eq("id", id);
    },
    [clientId]
  );

  const onPortalFieldChange = useCallback(
    (slug: string, value: string) => {
      setPortalFieldDraft((prev) => {
        const next = { ...prev, [slug]: value };
        portalFieldDraftRef.current = next;
        if (draftSaveTimerRef.current) {
          clearTimeout(draftSaveTimerRef.current);
        }
        draftSaveTimerRef.current = setTimeout(() => {
          draftSaveTimerRef.current = null;
          const merged = applyCalculationsToDraft(
            portalFieldDraftRef.current,
            structureLayoutRef.current
          );
          void flushPortalFieldDraft(merged);
        }, 550);
        return next;
      });
    },
    [flushPortalFieldDraft]
  );

  const canSign = Boolean(
    client &&
      signatureWorkBlocksUploadFlow &&
      !agreementLoading &&
      !agreementInactive &&
      !agreementError &&
      portalFormComplete &&
      (Boolean(agreementPdfUrl) || agreementHtml.trim().length > 0)
  );

  const signedAgreementLegacyUrl = useMemo(() => {
    if (!client || client.has_signed !== true) return null;
    return client.signature_url?.trim() || null;
  }, [client]);

  const signedAgreementStoragePath = useMemo(() => {
    if (!client || client.has_signed !== true) return null;
    const candidates = portalDocumentRows.filter((d) =>
      Boolean(d.signed_pdf_storage_path?.trim())
    );
    candidates.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return candidates[0]?.signed_pdf_storage_path?.trim() ?? null;
  }, [client, portalDocumentRows]);

  const signedAgreementDownloadUrl = useMemo(() => {
    const legacy = signedAgreementLegacyUrl;
    if (legacy) return legacy;
    const path = signedAgreementStoragePath;
    if (!path) return null;
    const {
      data: { publicUrl },
    } = supabase.storage.from(DOCUMENTS_SIGNED_BUCKET).getPublicUrl(path);
    return publicUrl || null;
  }, [signedAgreementLegacyUrl, signedAgreementStoragePath]);

  const effectiveSignedPdfPath = lastSignedPdfPath ?? signedAgreementStoragePath;
  const effectiveSignedPdfUrl =
    lastSignedPdfPublicUrl ?? signedAgreementDownloadUrl;

  const signedPdfDownloadReady = Boolean(
    signedAgreementLegacyUrl ||
      effectiveSignedPdfPath ||
      effectiveSignedPdfUrl
  );

  const signedAgreementFilePending =
    client?.has_signed === true &&
    !signedPdfDownloadReady &&
    !isSuccessfullySigned;

  const downloadSignedAgreement = useCallback(async () => {
    const path = lastSignedPdfPath ?? signedAgreementStoragePath;
    const url = lastSignedPdfPublicUrl ?? signedAgreementDownloadUrl;
    if (!path && !url) return;
    setSignedDownloadBusy(true);
    try {
      if (path) {
        const { data: fileBlob, error: dlErr } = await supabase.storage
          .from(DOCUMENTS_SIGNED_BUCKET)
          .download(path);
        if (!dlErr && fileBlob) {
          const objUrl = URL.createObjectURL(fileBlob);
          const a = document.createElement("a");
          a.href = objUrl;
          a.download = "הסכם-חתום.pdf";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
          return;
        }
      }
      if (url) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error("fetch failed");
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objUrl;
          a.download = "הסכם-חתום.pdf";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
        } catch {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    } finally {
      setSignedDownloadBusy(false);
    }
  }, [
    lastSignedPdfPath,
    lastSignedPdfPublicUrl,
    signedAgreementStoragePath,
    signedAgreementDownloadUrl,
  ]);

  const handleSignatureSave = async (dataUrl: string) => {
    if (!client) return;
    const cid = String(clientId ?? "").trim();
    if (!cid) {
      console.error(
        "[ClientPortal][signature-save] ABORT: clientId is missing/undefined"
      );
      setSignError("שגיאת מערכת — חסר מזהה לקוח. רעננו את הדף.");
      return;
    }

    setSignError(null);
    setSignSaving(true);
    try {
      const pending = pendingSignatureDocuments(portalDocumentRows);
      const auxAfterDocs = needsAuxSignatureStep(client, pending.length);
      let step: PortalSignatureStep | null = null;
      if (pending.length > 0) {
        step = { kind: "document", doc: pending[0] };
      } else if (auxAfterDocs) {
        const src = String(client.agreement_source ?? "").trim();
        if (src === "custom_pdf" && client.agreement_custom_pdf_path?.trim()) {
          step = { kind: "custom_pdf" };
        } else {
          step = { kind: "template" };
        }
      }
      if (!step) {
        console.error(
          "[ClientPortal][signature-save] no active signature step",
          { pending: pending.length, auxAfterDocs }
        );
        setSignError("אין שלב חתימה פעיל. רעננו את הדף.");
        return;
      }

      const signatureDataUrl = dataUrl?.trim() ?? "";
      if (!signatureDataUrl) {
        console.error(
          "[ClientPortal][signature-save] empty signature data URL"
        );
        return;
      }

      if (step.kind === "document") {
        const { data: srcExists, error: srcErr } = await supabase
          .from("documents")
          .select("id")
          .eq("id", step.doc.id)
          .eq("client_id", cid)
          .maybeSingle();
        if (srcErr || !srcExists) {
          console.error(
            "[ClientPortal][signature-save] source document row missing or error",
            { docId: step.doc.id, clientId: cid, srcErr }
          );
          setSignError(
            "המסמך לחתימה לא נמצא (ייתכן שנמחק). פנו למשרד לעדכון."
          );
          return;
        }
      }

      if (step.kind === "template") {
        const orderedIds = normalizedAgreementTemplateIds(
          client.agreement_template_ids
        );
        const tIdx = Math.max(
          0,
          Number(client.agreement_template_sign_index ?? 0) || 0
        );
        if (orderedIds.length > 0 && tIdx >= orderedIds.length) {
          console.error(
            "[ClientPortal][signature-save] template queue index out of range",
            { tIdx, queueLen: orderedIds.length, orderedIds }
          );
          setSignError(
            "תור התבניות אינו תקין. רעננו את הדף או בקשו מהמשרד לאפס את הבחירה."
          );
          return;
        }
        const total = orderedIds.length > 0 ? orderedIds.length : 1;
        const pos =
          orderedIds.length > 0 ? Math.min(tIdx + 1, orderedIds.length) : 1;
        const tid =
          orderedIds.length > 0 && tIdx < orderedIds.length
            ? orderedIds[tIdx]
            : null;
        console.error(
          `[ClientPortal][signature-save] queue: signing doc ${pos} of ${total}${
            tid ? ` (template_id=${tid})` : " (legacy single template)"
          }`
        );
      }

      const hasSigTid = Boolean(client.signature_template_id?.trim());
      const hasLegacyStructureTid = Boolean(
        client.agreement_structure_template_id?.trim()
      );
      const wantsPortalCustomMerge =
        hasSigTid || hasLegacyStructureTid;

      let mergedCustomJson: Record<string, string> =
        parseClientCustomFieldsData(client.custom_fields_data);
      if (wantsPortalCustomMerge) {
        const base = {
          ...mergedCustomJson,
          ...portalFieldDraftRef.current,
        };
        mergedCustomJson = applyCalculationsToDraft(
          base,
          structureLayoutRef.current
        );
        const { error: preSaveErr } = await supabase
          .from("clients")
          .update({ custom_fields_data: mergedCustomJson })
          .eq("id", cid);
        if (preSaveErr) {
          setSignError(`שמירת שדות הטופס נכשלה: ${preSaveErr.message}`);
          return;
        }
      }

      const structuredPdfRows = hasSigTid
        ? buildPdfStructuredRows(
            groupTemplateFieldsByRow(structureLayoutRef.current),
            mergedCustomJson
          )
        : [];

      let htmlForSign = agreementHtml;

      console.error(
        "[ClientPortal][signature-save] step: PDF generation start",
        { kind: step.kind }
      );

      let pdfBlob: Blob;

      if (step.kind === "document") {
        try {
          const docRow = step.doc;
          const uploadPath =
            resolveDocumentsUploadStoragePath(
              docRow.storage_path,
              docRow.file_url
            ) ?? "";
          const nameLower = (docRow.original_filename ?? "").toLowerCase();
          const cand0 =
            documentsUploadDownloadCandidates(
              docRow.storage_path,
              docRow.file_url
            )[0] ?? "";
          const pathHint = (cand0 || uploadPath).toLowerCase();
          const isDocx =
            nameLower.endsWith(".docx") || pathHint.endsWith(".docx");

          if (isDocx) {
            if (wantsPortalCustomMerge) {
              const freshDocHtml = await refreshDocumentRowDocxHtml(
                supabase,
                client,
                docRow,
                mergedCustomJson,
                customFieldDefinitionSlugsRef.current
              );
              if (freshDocHtml?.trim()) {
                htmlForSign = freshDocHtml;
              }
            }
            if (!htmlForSign.trim()) {
              console.error(
                "[ClientPortal][signature-save] PDF gen: DOCX path but empty agreementHtml"
              );
              setSignError("טעינת נוסח ההסכם נכשלה. רעננו את הדף.");
              return;
            }
            if (hasSigTid) {
              const { buildTemplateSignedDeclarationPdf } = await import(
                "@/lib/buildTemplateSignedDeclarationPdf"
              );
              const signedBlob = await buildTemplateSignedDeclarationPdf({
                agreementHtml: htmlForSign,
                signatureDataUrl,
                agreementNotes: client.agreement_notes?.trim() || null,
                structuredRows: structuredPdfRows,
                brandName: clientBranding.businessName,
                brandTagline: clientBranding.tagline,
              });
              if (!signedBlob) {
                console.error(
                  "[ClientPortal][signature-save] PDF gen: buildTemplateSignedDeclarationPdf returned empty (document docx)"
                );
                setSignError("יצירת PDF נכשלה. נסו שוב.");
                return;
              }
              pdfBlob = signedBlob;
            } else {
              const { buildSignedDeclarationPdf } = await import(
                "@/lib/buildDeclarationPdf"
              );
              const signedBlob = await buildSignedDeclarationPdf({
                agreementHtml: htmlForSign,
                signatureDataUrl,
                agreementNotes: client.agreement_notes?.trim() || null,
                brandName: clientBranding.businessName,
                brandTagline: clientBranding.tagline,
              });
              if (!signedBlob) {
                console.error(
                  "[ClientPortal][signature-save] PDF gen: buildSignedDeclarationPdf returned empty (document docx)"
                );
                setSignError("יצירת PDF נכשלה. נסו שוב.");
                return;
              }
              pdfBlob = signedBlob;
            }
          } else {
            const { data: dlBlob, error: dlBlobErr, triedKeys } =
              await downloadDocumentsUploadBlob(
                supabase,
                docRow.storage_path,
                docRow.file_url
              );
            if (dlBlobErr || !dlBlob) {
              console.error(
                "[ClientPortal][signature-save] documents-upload download failed",
                dlBlobErr?.message,
                { triedKeys }
              );
              throw dlBlobErr ?? new Error("download failed");
            }
            const { mergeCustomAgreementPdfWithSignature } = await import(
              "@/lib/mergeCustomAgreementPdfSignature"
            );
            const agreementBytes = await dlBlob.arrayBuffer();
            const signatureAnchor = parseSignatureAnchor(docRow.signature_anchor);
            pdfBlob = await mergeCustomAgreementPdfWithSignature(
              agreementBytes,
              signatureDataUrl,
              {
                idNumber: client.id_number,
                signedAt: new Date(),
                signatureAnchor,
              }
            );
          }
        } catch (e) {
          console.error(
            "[ClientPortal][signature-save] PDF generation failed (document step)",
            e
          );
          setSignError(
            "יצירת קובץ PDF חתום נכשלה. נסו שוב או פנו למשרד."
          );
          return;
        }
      } else if (step.kind === "custom_pdf") {
        const customPath = client.agreement_custom_pdf_path?.trim();
        if (!customPath) {
          console.error(
            "[ClientPortal][signature-save] custom_pdf step but no custom path"
          );
          setSignError("לא נמצא קובץ הסכם.");
          return;
        }
        const customKey = prepareStorageObjectPathForSdk(customPath);
        try {
          const { mergeCustomAgreementPdfWithSignature } = await import(
            "@/lib/mergeCustomAgreementPdfSignature"
          );
          const { data: pdfFile, error: dlErr } = await supabase.storage
            .from("client-agreements")
            .download(customKey);
          if (dlErr || !pdfFile) {
            throw dlErr ?? new Error("download failed");
          }
          const agreementBytes = await pdfFile.arrayBuffer();
          pdfBlob = await mergeCustomAgreementPdfWithSignature(
            agreementBytes,
            signatureDataUrl,
            {
              idNumber: client.id_number,
              signedAt: new Date(),
            }
          );
        } catch (e) {
          console.error(
            "[ClientPortal][signature-save] PDF generation failed (custom_pdf)",
            e
          );
          setSignError(
            "יצירת קובץ PDF חתום נכשלה. נסו שוב או פנו למשרד."
          );
          return;
        }
      } else {
        if (wantsPortalCustomMerge) {
          const freshTplHtml = await refreshTemplateAgreementHtml(
            supabase,
            client,
            mergedCustomJson,
            customFieldDefinitionSlugsRef.current
          );
          if (freshTplHtml?.trim()) {
            htmlForSign = freshTplHtml;
          }
        }
        if (!htmlForSign.trim()) {
          console.error(
            "[ClientPortal][signature-save] template step but empty agreementHtml"
          );
          setSignError("טעינת נוסח ההסכם נכשלה. רעננו את הדף.");
          return;
        }
        try {
          if (hasSigTid) {
            const { buildTemplateSignedDeclarationPdf } = await import(
              "@/lib/buildTemplateSignedDeclarationPdf"
            );
            const signedBlob = await buildTemplateSignedDeclarationPdf({
              agreementHtml: htmlForSign,
              signatureDataUrl,
              agreementNotes: client.agreement_notes?.trim() || null,
              structuredRows: structuredPdfRows,
              brandName: clientBranding.businessName,
              brandTagline: clientBranding.tagline,
            });
            if (!signedBlob) {
              console.error(
                "[ClientPortal][signature-save] PDF gen: template buildTemplateSignedDeclarationPdf empty"
              );
              setSignError("יצירת PDF נכשלה. נסו שוב.");
              return;
            }
            pdfBlob = signedBlob;
          } else {
            const { buildSignedDeclarationPdf } = await import(
              "@/lib/buildDeclarationPdf"
            );
            const signedBlob = await buildSignedDeclarationPdf({
              agreementHtml: htmlForSign,
              signatureDataUrl,
              agreementNotes: client.agreement_notes?.trim() || null,
              brandName: clientBranding.businessName,
              brandTagline: clientBranding.tagline,
            });
            if (!signedBlob) {
              console.error(
                "[ClientPortal][signature-save] PDF gen: template buildSignedDeclarationPdf empty"
              );
              setSignError("יצירת PDF נכשלה. נסו שוב.");
              return;
            }
            pdfBlob = signedBlob;
          }
        } catch (e) {
          console.error(
            "[ClientPortal][signature-save] PDF generation failed (template)",
            e
          );
          setSignError(
            "יצירת קובץ PDF מההצהרה נכשלה. נסו שוב או רעננו את הדף."
          );
          return;
        }
      }

      console.error("[ClientPortal][signature-save] step: PDF generation OK", {
        kind: step.kind,
        blobSize: pdfBlob.size,
      });

      const fileTimestamp = Date.now();
      const signedObjectName = signedAgreementStorageObjectName(
        step,
        client,
        fileTimestamp
      );
      const path = `${cid}/${signedObjectName}`;

      console.error(
        "[ClientPortal][signature-save] step: storage upload start",
        { path, clientId: cid, signedObjectName }
      );

      const { error: upErr } = await supabase.storage
        .from("documents-signed")
        .upload(path, pdfBlob, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (upErr) {
        console.error(
          "[ClientPortal][signature-save] storage upload FAILED",
          upErr
        );
        setSignError(
          "העלאת הקובץ נכשלה. ודאו שקיים באקט׳ documents-signed והרשאות אחסון מוגדרות."
        );
        return;
      }

      console.error(
        "[ClientPortal][signature-save] step: storage upload OK",
        { path }
      );

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents-signed").getPublicUrl(path);

      const signedAtIso = new Date().toISOString();

      const displayNameHebrew = `הסכם חתום - ${fileTimestamp}`;
      const originalTemplateName =
        step.kind === "document"
          ? step.doc.original_filename?.trim() ||
            step.doc.doc_type?.trim() ||
            signedObjectName
          : step.kind === "custom_pdf"
            ? client.agreement_custom_pdf_filename?.trim() ||
              "הסכם PDF מהמשרד"
            : (() => {
                const ids = normalizedAgreementTemplateIds(
                  client.agreement_template_ids
                );
                const ix = Math.max(
                  0,
                  Number(client.agreement_template_sign_index ?? 0) || 0
                );
                if (ids.length > 0 && ix < ids.length) {
                  return `תבנית ${ids[ix]!.slice(0, 8)}…`;
                }
                return "תבנית Word (פורטל)";
              })();

      let dbErr: { message?: string } | null = null;
      if (step.kind === "document") {
        console.error(
          "[ClientPortal][signature-save] step: documents UPDATE (in place) start",
          {
            displayNameHebrew,
            path,
            originalTemplateName,
            document_type: PORTAL_SIGNED_DOCUMENT_TYPE,
            documentId: step.doc.id,
          }
        );
        dbErr = (
          await updatePortalDocumentRowWithSignedPdf({
            documentId: step.doc.id,
            clientId: cid,
            displayName: displayNameHebrew,
            storagePath: path,
            publicUrl,
            storageObjectName: signedObjectName,
            signedAtIso,
          })
        ).error;
      } else {
        console.error(
          "[ClientPortal][signature-save] step: documents INSERT start",
          {
            displayNameHebrew,
            path,
            originalTemplateName,
            document_type: PORTAL_SIGNED_DOCUMENT_TYPE,
          }
        );
        dbErr = (
          await insertPortalSignedDocumentRow({
            clientId: cid,
            displayName: displayNameHebrew,
            storagePath: path,
            publicUrl,
            storageObjectName: signedObjectName,
            originalTemplateName,
            signedAtIso,
          })
        ).error;
      }

      if (dbErr) {
        console.error(
          step.kind === "document"
            ? "[ClientPortal][signature-save] documents UPDATE FAILED"
            : "[ClientPortal][signature-save] documents INSERT FAILED",
          dbErr
        );
        const { error: rbErr } = await supabase.storage
          .from(DOCUMENTS_SIGNED_BUCKET)
          .remove([path]);
        if (rbErr) {
          console.warn(
            "[ClientPortal][signature-save] rollback signed upload failed",
            rbErr
          );
        }
        setSignError(
          dbErr.message?.includes("name") ||
            dbErr.message?.includes("document_type") ||
            dbErr.message?.includes("is_active") ||
            dbErr.message?.includes("status")
            ? "שמירת המסמך נכשלה — הריצו ב-Supabase את add_documents_portal_signed_columns.sql"
            : "שמירת רשומת המסמך נכשלה. פנו למשרד."
        );
        return;
      }

      console.error(
        step.kind === "document"
          ? "[ClientPortal][signature-save] step: documents UPDATE OK"
          : "[ClientPortal][signature-save] step: documents INSERT OK",
        { displayNameHebrew, path }
      );

      if (step.kind === "document") {
        const oldUploadKey = resolveDocumentsUploadStoragePath(
          step.doc.storage_path,
          step.doc.file_url
        );
        if (oldUploadKey) {
          const { error: rmErr } = await supabase.storage
            .from(DOCUMENTS_UPLOAD_BUCKET)
            .remove([oldUploadKey]);
          if (rmErr) {
            console.warn(
              "[ClientPortal][signature-save] remove unsigned upload failed",
              rmErr
            );
          }
        }

        const { data: allDocRows } = await supabase
          .from("documents")
          .select(
            "needs_signature, signature_signed_at, file_url, storage_path, created_at"
          )
          .eq("client_id", cid);

        const { data: freshClient } = await supabase
          .from("clients")
          .select(
            "agreement_request_active, agreement_source, agreement_custom_pdf_path, agreement_aux_signed_at"
          )
          .eq("id", cid)
          .maybeSingle();

        const slice = {
          agreement_request_active:
            freshClient?.agreement_request_active ??
            client.agreement_request_active,
          agreement_source:
            freshClient?.agreement_source ?? client.agreement_source,
          agreement_custom_pdf_path:
            freshClient?.agreement_custom_pdf_path ??
            client.agreement_custom_pdf_path,
          agreement_aux_signed_at:
            freshClient?.agreement_aux_signed_at ??
            client.agreement_aux_signed_at,
        };

        const complete = portalSignatureFullyComplete(
          allDocRows ?? [],
          slice
        );

        if (complete) {
          console.error(
            "[ClientPortal][signature-save] step: clients UPDATE (has_signed, doc flow) start"
          );
          const { error: dbErr } = await supabase
            .from("clients")
            .update({
              has_signed: true,
              signature_url: publicUrl,
              signed_at: signedAtIso,
              agreement_template_sign_index: 0,
            })
            .eq("id", cid);

          if (dbErr) {
            console.error(
              "[ClientPortal][signature-save] clients UPDATE (has_signed doc) FAILED",
              dbErr
            );
            setSignError("עדכון הרשומה נכשל. נסו שוב.");
            return;
          }

          console.error(
            "[ClientPortal][signature-save] step: clients UPDATE (has_signed doc) OK"
          );

          setClient((c) =>
            c
              ? {
                  ...c,
                  has_signed: true,
                  signature_url: publicUrl,
                  signed_at: signedAtIso,
                  agreement_template_sign_index: 0,
                }
              : c
          );
          setLastSignedPdfPath(path);
          setLastSignedPdfPublicUrl(publicUrl);
          setIsSuccessfullySigned(true);
          postSignatureAudit(client.short_id);
        } else {
          setSignatureQueueAdvanceNotice(
            "החתימה נשמרה. טוען את המסמך הבא…"
          );
        }

        await loadDocuments();
        await loadClient();
      } else if (step.kind === "custom_pdf") {
        console.error(
          "[ClientPortal][signature-save] step: clients UPDATE (custom final) start"
        );
        const { error: dbErr } = await supabase
          .from("clients")
          .update({
            agreement_aux_signed_at: signedAtIso,
            has_signed: true,
            signature_url: publicUrl,
            signed_at: signedAtIso,
            agreement_template_sign_index: 0,
          })
          .eq("id", cid);

        if (dbErr) {
          console.error(
            "[ClientPortal][signature-save] clients UPDATE (custom) FAILED",
            dbErr
          );
          setSignError("עדכון הרשומה נכשל. נסו שוב.");
          return;
        }

        console.error(
          "[ClientPortal][signature-save] step: clients UPDATE (custom) OK"
        );

        setClient((c) =>
          c
            ? {
                ...c,
                agreement_aux_signed_at: signedAtIso,
                has_signed: true,
                signature_url: publicUrl,
                signed_at: signedAtIso,
                agreement_template_sign_index: 0,
              }
            : c
        );
        setLastSignedPdfPath(path);
        setLastSignedPdfPublicUrl(publicUrl);
        setIsSuccessfullySigned(true);
        postSignatureAudit(client.short_id);

        await loadClient();
      } else {
        const orderedIds = normalizedAgreementTemplateIds(
          client.agreement_template_ids
        );
        const idx = Math.max(
          0,
          Number(client.agreement_template_sign_index ?? 0) || 0
        );
        const moreTemplates =
          orderedIds.length > 0 && idx + 1 < orderedIds.length;

        if (moreTemplates) {
          console.error(
            "[ClientPortal][signature-save] step: clients UPDATE (advance template index) start",
            { nextIndex: idx + 1 }
          );
          const { error: dbErr } = await supabase
            .from("clients")
            .update({
              agreement_template_sign_index: idx + 1,
            })
            .eq("id", cid);

          if (dbErr) {
            console.error(
              "[ClientPortal][signature-save] clients UPDATE (advance index) FAILED",
              dbErr
            );
            setSignError("עדכון הרשומה נכשל. נסו שוב.");
            return;
          }

          console.error(
            "[ClientPortal][signature-save] step: clients UPDATE (advance index) OK"
          );

          setClient((c) =>
            c
              ? {
                  ...c,
                  agreement_template_sign_index: idx + 1,
                }
              : c
          );

          setSignatureQueueAdvanceNotice(
            "החתימה נשמרה. טוען את ההסכם הבא…"
          );
          await loadClient();
          return;
        }

        console.error(
          "[ClientPortal][signature-save] step: clients UPDATE (template queue complete) start"
        );
        const { error: dbErr } = await supabase
          .from("clients")
          .update({
            agreement_aux_signed_at: signedAtIso,
            has_signed: true,
            signature_url: publicUrl,
            signed_at: signedAtIso,
            agreement_template_sign_index: 0,
          })
          .eq("id", cid);

        if (dbErr) {
          console.error(
            "[ClientPortal][signature-save] clients UPDATE (template final) FAILED",
            dbErr
          );
          setSignError("עדכון הרשומה נכשל. נסו שוב.");
          return;
        }

        console.error(
          "[ClientPortal][signature-save] step: clients UPDATE (template final) OK"
        );

        setClient((c) =>
          c
            ? {
                ...c,
                agreement_aux_signed_at: signedAtIso,
                has_signed: true,
                signature_url: publicUrl,
                signed_at: signedAtIso,
                agreement_template_sign_index: 0,
              }
            : c
        );
        setLastSignedPdfPath(path);
        setLastSignedPdfPublicUrl(publicUrl);
        setIsSuccessfullySigned(true);
        postSignatureAudit(client.short_id);

        await loadClient();
      }
    } finally {
      setSignSaving(false);
    }
  };

  const handleDocFile = async (docName: string, file: File) => {
    setDocError(null);
    setDocUploadBusy({ mode: "add", requiredDocName: docName });
    try {
      const normalized = await normalizeClientDocumentUploadFile(file);
      const objectName = timestampedStorageObjectName(normalized.uploadFile.name);
      const path = `${clientId}/${uniqueDocumentsUploadFolderSegment()}/${objectName}`;

      const contentType = normalized.uploadFile.type || "application/pdf";

      const { error: upErr } = await supabase.storage
        .from("documents-uploads")
        .upload(path, normalized.uploadFile, {
          cacheControl: "3600",
          upsert: false,
          ...(contentType ? { contentType } : {}),
        });

      if (upErr) {
        setDocError(
          "העלאת הקובץ נכשלה. ודאו שקיים באקט׳ documents-uploads והרשאות אחסון."
        );
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents-uploads").getPublicUrl(path);

      const { error: insErr } = await supabase.from("documents").insert({
        client_id: clientId,
        doc_type: docName,
        status: "uploaded",
        file_url: publicUrl,
        storage_path: path,
        original_filename: normalized.originalNameForDb,
      });

      if (insErr) {
        setDocError("שמירת פרטי המסמך נכשלה. נסו שוב.");
        return;
      }

      await loadDocuments();
    } finally {
      setDocUploadBusy(null);
    }
  };

  const handleReplaceDocFile = async (row: PortalDocumentRow, file: File) => {
    setDocError(null);
    setDocUploadBusy({ mode: "replace", documentId: row.id });
    try {
      const normalized = await normalizeClientDocumentUploadFile(file);
      const oldPath = resolveDocumentsUploadStoragePath(
        row.storage_path,
        row.file_url
      );
      const objectName = timestampedStorageObjectName(normalized.uploadFile.name);
      const path = `${clientId}/${uniqueDocumentsUploadFolderSegment()}/${objectName}`;

      const contentType = normalized.uploadFile.type || "application/pdf";

      const { error: upErr } = await supabase.storage
        .from(DOCUMENTS_UPLOAD_BUCKET)
        .upload(path, normalized.uploadFile, {
          cacheControl: "3600",
          upsert: false,
          ...(contentType ? { contentType } : {}),
        });

      if (upErr) {
        setDocError(
          "החלפת הקובץ נכשלה. ודאו שקיים באקט׳ documents-uploads והרשאות אחסון."
        );
        return;
      }

      if (oldPath) {
        const { error: rmErr } = await supabase.storage
          .from(DOCUMENTS_UPLOAD_BUCKET)
          .remove([oldPath]);
        if (rmErr) {
          console.warn("[ClientPortal] remove old object after replace failed", rmErr);
        }
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(DOCUMENTS_UPLOAD_BUCKET).getPublicUrl(path);

      const { error: upDb } = await supabase
        .from("documents")
        .update({
          file_url: publicUrl,
          storage_path: path,
          original_filename: normalized.originalNameForDb,
          status: "uploaded",
        })
        .eq("id", row.id)
        .eq("client_id", clientId);

      if (upDb) {
        setDocError("עדכון פרטי המסמך נכשל. נסו שוב.");
        return;
      }

      await loadDocuments();
    } finally {
      setDocUploadBusy(null);
    }
  };

  const handleSubmitApplication = async () => {
    if (!client) return;
    setDocError(null);
    setSubmitApplicationBusy(true);
    try {
      const res = await fetch("/api/portal/submit-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      let data: { error?: string; complete?: boolean } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        if (data.complete === false) {
          setDocError("חסרים מסמכים נדרשים. השלימו את הרשימה לפני השליחה.");
        } else {
          setDocError(
            data.error ??
              "שליחת הבקשה נכשלה. נסו שוב או פנו למשרד."
          );
        }
        return;
      }
      await loadClient();
    } finally {
      setSubmitApplicationBusy(false);
    }
  };

  /** Documents-only portal (`?mode=documents`): confirm uploads; notifies admin via WhatsApp when CRM advances. */
  const handleDocumentsPortalFinish = async () => {
    if (!client) return;
    setDocError(null);
    setDocsOnlyFinishMessage(null);
    setSubmitApplicationBusy(true);
    try {
      const res = await fetch("/api/portal/documents-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      let data: { error?: string; complete?: boolean } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        if (data.complete === false) {
          setDocError("חסרים מסמכים נדרשים. השלימו את הרשימה לפני האישור.");
        } else {
          setDocError(
            data.error ?? "לא ניתן לאשר כרגע. נסו שוב או פנו למשרד."
          );
        }
        return;
      }
      setDocsOnlyFinishMessage(
        "התקבלו כל המסמכים. העלאת המסמכים נסגרה ונשלחה הודעה למשרד."
      );
      await loadClient();
    } finally {
      setSubmitApplicationBusy(false);
    }
  };

  const handleOpenPortalDocument = (row: PortalDocumentRow) => {
    setDocError(null);
    const objectPath = resolveDocumentsUploadStoragePath(
      row.storage_path,
      row.file_url
    );
    if (objectPath) {
      const {
        data: { publicUrl },
      } = supabase.storage.from(DOCUMENTS_UPLOAD_BUCKET).getPublicUrl(objectPath);
      if (publicUrl) {
        window.open(publicUrl, "_blank", "noopener,noreferrer");
        return;
      }
    }

    const legacyUrl = row.file_url?.trim();
    if (
      legacyUrl &&
      (legacyUrl.startsWith("http://") || legacyUrl.startsWith("https://"))
    ) {
      window.open(legacyUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setDocError(
      "לא ניתן לפתוח את הקובץ לצפייה. פנו למשרד או נסו להעלות מחדש."
    );
  };

  const handleDeletePortalDocument = async (row: PortalDocumentRow) => {
    setDocError(null);
    setDeletingDocumentId(row.id);
    try {
      const path = resolveDocumentsUploadStoragePath(
        row.storage_path,
        row.file_url
      );
      if (path) {
        const { error: rmErr } = await supabase.storage
          .from("documents-uploads")
          .remove([path]);
        if (rmErr) {
          console.warn("[ClientPortal] storage remove failed", rmErr);
        }
      }

      const placeholdersToRemove = emptyPlaceholderRowsSameSemanticType(
        portalDocumentRows,
        row
      );

      const { error: delErr } = await supabase
        .from("documents")
        .delete()
        .eq("id", row.id)
        .eq("client_id", clientId);

      if (delErr) {
        setDocError("מחיקת המסמך נכשלה. נסו שוב.");
        return;
      }
      for (const p of placeholdersToRemove) {
        const { error: phErr } = await supabase
          .from("documents")
          .delete()
          .eq("id", p.id)
          .eq("client_id", clientId);
        if (phErr) {
          console.warn("[ClientPortal] placeholder cascade delete failed", phErr);
        }
      }

      if (client) {
        const remainingDocs = portalDocumentRows.filter(
          (r) =>
            r.id !== row.id &&
            !placeholdersToRemove.some((ph) => ph.id === r.id)
        );
        const { next: nextRequired, changed } =
          stripExcludedRequiredDocKeys(client.required_docs);

        let tplForSync: { id: string; name: string }[] = [];
        const tplIds = normalizedAgreementTemplateIds(client.agreement_template_ids);
        if (tplIds.length > 0) {
          const { data: tplRows } = await supabase
            .from("templates")
            .select("id, name")
            .in("id", tplIds);
          tplForSync = (tplRows ?? []) as { id: string; name: string }[];
        }
        const sigPatch = buildClientPatchAfterSignatureDocumentDeleted(
          client,
          row,
          remainingDocs,
          tplForSync
        );

        const clientPatch: Record<string, unknown> = {};
        if (changed) clientPatch.required_docs = nextRequired;
        if (sigPatch) Object.assign(clientPatch, sigPatch);
        if (Object.keys(clientPatch).length > 0) {
          const { error: upErr } = await supabase
            .from("clients")
            .update(clientPatch)
            .eq("id", clientId);
          if (upErr) {
            setDocError(
              "המסמך נמחק אך עדכון רשומת הלקוח נכשל. פנו למשרד."
            );
          }
        }
      }

      await loadDocuments();
      await loadClient();
    } finally {
      setDeletingDocumentId(null);
    }
  };

  if (client === undefined) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-neutral-600 dark:text-neutral-400">
        <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
        <p className="text-start text-base">טוען את פורטל הלקוח…</p>
      </div>
    );
  }

  if (client === null) {
    return (
      <div
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-start text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
        role="alert"
      >
        <p className="font-semibold">
          {loadError ? "שגיאה בטעינה" : "לא נמצאה רשומת לקוח"}
        </p>
        <p className="mt-2 text-sm opacity-90">
          {loadError ??
            "מזהה הלקוח אינו תקף או שאינו קיים במערכת."}
        </p>
      </div>
    );
  }

  const showPdfViewer =
    !agreementLoading &&
    !agreementError &&
    Boolean(agreementPdfUrl);
  const showTemplateHtml =
    !agreementLoading &&
    !agreementError &&
    agreementHtml.trim().length > 0 &&
    !agreementInactive &&
    !agreementPdfUrl;
  const showAgreementLoader =
    agreementPending && !showPdfViewer && !showTemplateHtml;

  const documentsOnlyMainVisible =
    hideSignatureUi &&
    !portalThankYouSuppressesClientWork &&
    (showWaitingForUploadGate || documentsUploadSectionVisible);

  let portalMain: ReactNode;
  try {
    portalMain = (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-slate-950 mx-auto w-full px-3 pb-4 pt-0 sm:px-5 ${
        signatureWorkBlocksUploadFlow &&
        showStructuredPortalForm &&
        !showPortalThankYou
          ? "max-w-7xl"
          : "max-w-3xl"
      }`}
    >
      <header className="border-b border-slate-100 bg-white/85 py-4 shadow-sm shadow-slate-200/30 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-2 gap-y-2">
          <div className="min-w-0 flex-1 text-start">
            <p className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-lg">
              {clientBranding.businessName}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              <span>פורטל לקוח — {clientBranding.tagline}</span>
              {portalMode === "sign" ? (
                <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900 dark:bg-violet-950/70 dark:text-violet-200">
                  חתימה
                </span>
              ) : null}
              {portalMode === "documents" ? (
                <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950/70 dark:text-sky-200">
                  מסמכים
                </span>
              ) : null}
            </p>
          </div>
          {signatureProgressLabel ? (
            <p
              className="shrink-0 rounded-md border border-slate-200/90 bg-slate-50/90 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600 dark:border-slate-700 dark:bg-slate-900/45 dark:text-slate-300"
              aria-live="polite"
            >
              {signatureProgressLabel}
            </p>
          ) : null}
        </div>
      </header>

      {showPortalThankYou && !hideSignatureUi ? (
        <section
          className="mt-4 flex min-h-[50vh] flex-col items-center justify-center gap-4 px-2 text-center"
          aria-labelledby="portal-complete-heading"
        >
          <CheckCircle2
            className="h-14 w-14 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <h2
            id="portal-complete-heading"
            className="text-balance text-lg font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {PORTAL_THANK_YOU_MSG}
          </h2>
          <p className="max-w-md text-balance text-sm text-neutral-600 dark:text-neutral-400">
            הבקשה נשלחה למשרד. אין צורך בפעולה נוספת.
          </p>
          {client?.has_signed === true && signedAgreementFilePending ? (
            <div
              className="mt-2 flex min-h-14 w-full max-w-md items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-4 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              role="status"
              aria-live="polite"
            >
              <Loader2
                className="h-6 w-6 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              מכינים את קובץ ה־PDF החתום…
            </div>
          ) : null}
          {signedPdfDownloadReady ? (
            <button
              type="button"
              disabled={signedDownloadBusy}
              onClick={() => void downloadSignedAgreement()}
              className="mt-3 flex min-h-[3.25rem] w-full max-w-md touch-manipulation items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-lg ring-2 ring-blue-400/40 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-wait disabled:opacity-90 dark:bg-blue-500 dark:ring-blue-400/30 dark:hover:bg-blue-600"
            >
              {signedDownloadBusy ? (
                <Loader2
                  className="h-6 w-6 shrink-0 animate-spin"
                  aria-hidden
                />
              ) : (
                <>
                  <CheckCircle2
                    className="h-7 w-7 shrink-0 text-white"
                    aria-hidden
                  />
                  <Download className="h-6 w-6 shrink-0" aria-hidden />
                </>
              )}
              הורד את ההסכם החתום (PDF)
            </button>
          ) : null}
        </section>
      ) : null}

      {signatureWorkBlocksUploadFlow && !showPortalThankYou ? (
        <section className="mt-0 space-y-1" aria-labelledby="agreement-heading">
          <h2 id="agreement-heading" className="sr-only">
            הסכמת שכר טרחה והצהרה
          </h2>

          {signatureQueueAdvanceNotice ? (
            <p
              className="flex items-center gap-2 rounded-lg border border-emerald-200/85 bg-emerald-50/90 px-3 py-2 text-start text-xs font-medium text-emerald-950 dark:border-emerald-900/45 dark:bg-emerald-950/35 dark:text-emerald-100"
              role="status"
              aria-live="polite"
            >
              {agreementLoading ? (
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-700 dark:text-emerald-300"
                  aria-hidden
                />
              ) : null}
              <span>{signatureQueueAdvanceNotice}</span>
            </p>
          ) : null}

          {showStructuredPortalForm ? (
            <div
              dir="ltr"
              className="mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(18rem,0.92fr)] lg:items-start lg:gap-10"
            >
              <div
                dir="rtl"
                className="order-1 flex min-h-0 min-w-0 flex-col items-center gap-4 lg:sticky lg:top-4 lg:max-h-[min(88dvh,calc(100dvh-4.5rem))] lg:overflow-y-auto lg:pe-2"
              >
                <p className="w-full max-w-3xl text-start text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  תצוגת המסמך
                </p>
                {showPdfViewer ? (
                  <div className="w-full max-w-3xl px-2 lg:px-4">
                    <div
                      className="rounded-sm bg-white shadow-[0_28px_64px_-16px_rgba(15,23,42,0.45)] ring-1 ring-slate-300/40 dark:bg-slate-900 dark:ring-slate-700/60"
                      style={{ transform: "rotate(-0.2deg)" }}
                    >
                      <div className="overflow-hidden rounded-sm bg-white dark:bg-slate-900">
                        <iframe
                          title="הסכם לחתימה"
                          src={`${agreementPdfUrl}#toolbar=0`}
                          className="h-[min(75dvh,520px)] w-full min-h-[44dvh] bg-white lg:h-[min(78dvh,620px)]"
                        />
                      </div>
                      <p className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-start text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                        {currentAgreementFileLabel.trim()
                          ? `קובץ: ${currentAgreementFileLabel}`
                          : "קראו את המסמך לפני החתימה."}
                      </p>
                    </div>
                  </div>
                ) : null}
                {showTemplateHtml ? (
                  <div className="w-full max-w-3xl px-2 lg:px-4">
                    <div
                      className="rounded-sm bg-white shadow-[0_28px_64px_-16px_rgba(15,23,42,0.45)] ring-1 ring-slate-300/40 dark:bg-slate-900 dark:ring-slate-700/60"
                      style={{ transform: "rotate(-0.2deg)" }}
                    >
                      <div
                        dir="rtl"
                        className="mammoth-agreement-html max-h-[min(75dvh,520px)] overflow-y-auto bg-white p-6 text-right text-sm text-slate-800 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_table]:max-w-full dark:bg-slate-900 dark:text-slate-200 lg:max-h-[min(78dvh,620px)]"
                        dangerouslySetInnerHTML={{ __html: agreementHtml }}
                      />
                    </div>
                  </div>
                ) : null}
                {showAgreementLoader ? (
                  <div className="flex w-full max-w-3xl items-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-start text-sm font-medium text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                    {isPdfAgreement
                      ? "טוען את קובץ ההסכם…"
                      : "טוען את נוסח ההסכם (Word → PDF)…"}
                  </div>
                ) : null}
                {!showPdfViewer &&
                !showTemplateHtml &&
                !showAgreementLoader ? (
                  <div className="w-full max-w-3xl rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    {agreementLoading
                      ? "טוען…"
                      : "תצוגת המסמך תופיע כאן לאחר הטעינה."}
                  </div>
                ) : null}
              </div>

              <div dir="rtl" className="order-2 min-w-0 space-y-8">
                <p className="text-start text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  מילוי פרטים
                </p>
                <PortalAgreementFormGrid
                  fields={structureFields}
                  values={portalGridValues}
                  onChange={onPortalFieldChange}
                  disabled={signSaving || agreementLoading}
                />
                {!portalFormComplete ? (
                  <div
                    className="rounded-xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-start text-sm font-medium leading-relaxed text-amber-950 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100"
                    role="status"
                  >
                    מלאו את כל השדות בכל הסעיפים (מסומנים ב־*) כדי להמשיך
                    לחתימה. ניתן לעיין במסמך במקביל למילוי הטופס.
                  </div>
                ) : null}
                {portalFormComplete ? (
                  <div className="space-y-3 rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm ring-0 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:bottom-6 lg:z-20">
                    <h3 className="text-start text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
                      חתימה דיגיטלית
                    </h3>
                    {!canSign && !signSaving && !agreementLoading ? (
                      <p className="text-start text-sm text-neutral-600 dark:text-neutral-400">
                        {agreementInactive
                          ? AGREEMENT_INACTIVE_MSG
                          : agreementError
                            ? "לא ניתן לפתוח את מסמך ההסכם — פרטים בהודעה למטה."
                            : "ממתינים להצגת מסמך ההסכם לפני החתימה."}
                      </p>
                    ) : null}
                    {signError ? (
                      <p
                        className="text-start text-sm text-red-600 dark:text-red-400"
                        role="alert"
                      >
                        {signError}
                      </p>
                    ) : null}
                    {signSaving ? (
                      <p className="flex items-center gap-2 text-start text-sm text-neutral-600 dark:text-neutral-400">
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden
                        />
                        יוצר PDF ושומר…
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 sm:flex-row sm:items-stretch dark:border-slate-800 dark:bg-slate-950/50">
                      <div
                        className="flex shrink-0 items-center justify-center gap-2 self-center rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-md shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:min-w-[6rem] sm:flex-col sm:justify-center sm:py-4"
                        aria-hidden
                      >
                        <PenLine
                          className="h-4 w-4 shrink-0 text-slate-500 opacity-90 dark:text-slate-400"
                          strokeWidth={1.75}
                        />
                        <span className="max-w-[7rem] text-center leading-snug">
                          חתום כאן
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <SignaturePad
                          onSave={(url) => void handleSignatureSave(url)}
                          disabled={signSaving || !canSign}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              {showPdfViewer ? (
                <div className="mt-0 overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-700">
                  <iframe
                    title="הסכם לחתימה"
                    src={`${agreementPdfUrl}#toolbar=0`}
                    className="h-[min(92dvh,calc(100dvh-56px))] w-full min-h-[50dvh] bg-white sm:h-[min(92dvh,calc(100dvh-64px))]"
                  />
                  <p className="border-t border-neutral-100 px-2 py-0.5 text-start text-[0.65rem] leading-tight text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    {currentAgreementFileLabel.trim()
                      ? `קובץ: ${currentAgreementFileLabel}`
                      : "קראו את המסמך לפני החתימה."}
                  </p>
                </div>
              ) : null}

              {showTemplateHtml ? (
                <div
                  dir="rtl"
                  className="mammoth-agreement-html mt-0 rounded border border-neutral-200 bg-white p-2 text-right text-sm text-neutral-800 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_table]:max-w-full dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-200"
                  dangerouslySetInnerHTML={{ __html: agreementHtml }}
                />
              ) : null}

              {showAgreementLoader ? (
                <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50/80 px-2 py-1.5 text-start text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-300">
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin"
                    aria-hidden
                  />
                  {isPdfAgreement
                    ? "טוען את קובץ ההסכם…"
                    : "טוען את נוסח ההסכם (Word → PDF)…"}
                </div>
              ) : null}
            </>
          )}

          {!agreementLoading && agreementError ? (
            <div
              className={`rounded-lg border px-3 py-2.5 text-start text-sm ${
                agreementInactive
                  ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                  : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
              }`}
              role="alert"
            >
              <p className="font-semibold">
                {agreementInactive
                  ? "ממתינים להפעלת בקשת חתימה"
                  : "לא ניתן להציג את הסכם שכר הטרחה"}
              </p>
              <p className="mt-1.5 leading-relaxed">{agreementError}</p>
            </div>
          ) : null}

          {signatureTasksForList.length > 0 ? (
            <ul
              className="mt-1 space-y-1 rounded-md border border-neutral-200 bg-neutral-50/90 p-2 text-start text-xs dark:border-neutral-700 dark:bg-neutral-900/50"
              aria-label="מסמכים לחתימה"
            >
              {signatureTasksForList.map((d) => {
                const done = Boolean(d.signature_signed_at?.trim());
                const isCurrent =
                  !done && pendingSigDocs[0]?.id === d.id;
                return (
                  <li
                    key={d.id}
                    className={`flex items-center gap-2 rounded px-1 py-0.5 ${
                      isCurrent
                        ? "bg-indigo-100/80 font-medium text-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-100"
                        : "text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-hidden
                      />
                    ) : (
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-neutral-400 dark:border-neutral-500"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 truncate">
                      {d.original_filename?.trim() || d.doc_type}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {!showStructuredPortalForm ? (
            <div className="space-y-1.5 pt-1">
              <h3 className="text-start text-xs font-medium text-neutral-700 dark:text-neutral-300">
                חתימה דיגיטלית
              </h3>
              {!canSign && !signSaving && !agreementLoading ? (
                <p className="text-start text-sm text-neutral-600 dark:text-neutral-400">
                  {agreementInactive
                    ? AGREEMENT_INACTIVE_MSG
                    : agreementError
                      ? "לא ניתן לפתוח את מסמך ההסכם — פרטים בהודעה למעלה."
                      : Boolean(agreementPdfUrl) ||
                          agreementHtml.trim().length > 0
                        ? "לאחר שמסמך ההסכם יוצג למעלה ניתן לחתום."
                        : "החתימה תופעל לאחר שיוצג נוסח ההסכם המלא."}
                </p>
              ) : null}
              {signError ? (
                <p
                  className="text-start text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {signError}
                </p>
              ) : null}
              {signSaving ? (
                <p className="flex items-center gap-2 text-start text-sm text-neutral-600 dark:text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  יוצר PDF ושומר…
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                <div
                  className="flex shrink-0 items-center justify-center gap-1.5 self-center rounded-lg border border-slate-200/85 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300 sm:min-w-[5.75rem] sm:flex-col sm:justify-center sm:py-3"
                  aria-hidden
                >
                  <PenLine
                    className="h-4 w-4 shrink-0 text-slate-500 opacity-80 dark:text-slate-400"
                    strokeWidth={1.75}
                  />
                  <span className="max-w-[7rem] text-center leading-snug">
                    חתום כאן
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <SignaturePad
                    onSave={(url) => void handleSignatureSave(url)}
                    disabled={signSaving || !canSign}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!signatureWorkBlocksUploadFlow &&
      !showPortalThankYou &&
      showSignatureSuccessScreen &&
      !hideSignatureUi ? (
        <section
          className="mt-4 flex min-h-[40vh] flex-col items-center justify-center gap-4 px-2 text-center"
          aria-labelledby="sig-received-heading"
        >
          <CheckCircle2
            className="h-16 w-16 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <h2
            id="sig-received-heading"
            className="max-w-md text-balance text-lg font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {SIGNATURE_RECEIVED_HOLD_MSG}
          </h2>
          {client?.has_signed === true && signedAgreementFilePending ? (
            <div
              className="mt-2 flex min-h-14 w-full max-w-md items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-4 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              role="status"
              aria-live="polite"
            >
              <Loader2
                className="h-6 w-6 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              מכינים את קובץ ה־PDF החתום…
            </div>
          ) : null}
          {signedPdfDownloadReady ? (
            <button
              type="button"
              disabled={signedDownloadBusy}
              onClick={() => void downloadSignedAgreement()}
              className="mt-3 flex min-h-[3.25rem] w-full max-w-md touch-manipulation items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-lg ring-2 ring-blue-400/40 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-wait disabled:opacity-90 dark:bg-blue-500 dark:ring-blue-400/30 dark:hover:bg-blue-600"
            >
              {signedDownloadBusy ? (
                <Loader2
                  className="h-6 w-6 shrink-0 animate-spin"
                  aria-hidden
                />
              ) : (
                <>
                  <CheckCircle2
                    className="h-7 w-7 shrink-0 text-white"
                    aria-hidden
                  />
                  <Download className="h-6 w-6 shrink-0" aria-hidden />
                </>
              )}
              הורד את ההסכם החתום (PDF)
            </button>
          ) : null}
        </section>
      ) : null}

      {!signatureWorkBlocksUploadFlow &&
      !showPortalThankYou &&
      showWaitingForUploadGate &&
      !hideDocumentsUi ? (
        <section
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-5 text-start dark:border-amber-900/60 dark:bg-amber-950/25"
          role="status"
        >
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            שלב העלאת המסמכים טרם נפתח.
          </p>
          <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">
            המשרד ישלח הודעה כשיהיה ניתן להעלות את המסמכים הנדרשים בפורטל.
          </p>
        </section>
      ) : null}

      {(!signatureWorkBlocksUploadFlow || uploadRequestActive) &&
      !portalThankYouSuppressesClientWork &&
      documentsUploadSectionVisible ? (
        <section className="mt-2 space-y-4" aria-labelledby="docs-heading">
          <h2
            id="docs-heading"
            className="text-start text-sm font-medium text-neutral-600 dark:text-neutral-400"
          >
            מסמכים נדרשים
          </h2>
          {docsOnlyFinishMessage ? (
            <p
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-start text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
              role="status"
            >
              {docsOnlyFinishMessage}
            </p>
          ) : null}
          <p className="text-start text-sm text-neutral-600 dark:text-neutral-300">
            יש להעלות כל אחד מהקבצים הבאים. לאחר העלאה ניתן לפתוח את הקובץ לבדיקה,
            להחליף אותו בקובץ אחר, או למחוק.
            {allRequiredDocsUploaded && requiredDocItems.length > 0 ? (
              <>
                {" "}
                {portalMode === "documents"
                  ? "כשכל המסמכים מסומנים בירוק, לחצו למטה לאישור שההעלאות נשמרו במערכת."
                  : 'כשכל המסמכים מסומנים בירוק, לחצו על "שליחת הבקשה" למטה כדי לסיים.'}
              </>
            ) : null}
          </p>

          {docError ? (
            <p
              className="text-start text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {docError}
            </p>
          ) : null}

          {documentTypesLoading ? (
            <p className="flex items-center gap-2 text-start text-xs text-neutral-500 dark:text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              טוען קישורי טפסים רשמיים…
            </p>
          ) : null}

          {documentTypesError ? (
            <p
              className="text-start text-sm text-amber-800 dark:text-amber-200"
              role="status"
            >
              לא ניתן לטעון את רשימת סוגי המסמכים ({documentTypesError}). ניתן
              עדיין להעלות קבצים לפי הרשימה שנשמרה לתיק.
            </p>
          ) : null}

          {requiredDocItems.length === 0 ? (
            <div
              className={`rounded-xl border border-neutral-200 bg-neutral-50/90 px-4 py-6 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-900/40 dark:text-neutral-200 ${
                hideSignatureUi
                  ? "p-8 text-center text-base"
                  : "text-start text-sm text-amber-800 dark:text-amber-200"
              }`}
              role="status"
            >
              {hideSignatureUi ? (
                <>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    אין כרגע מסמכים שנדרש להעלות.
                  </p>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    אם ציפיתם לראות רשימה כאן, פנו למשרד — ייתכן שטרם הוגדרו
                    דרישות מסמכים לתיק.
                  </p>
                </>
              ) : (
                <p>לא הוגדרו מסמכים נדרשים ללקוח זה. פנו למשרד.</p>
              )}
            </div>
          ) : (
            <ul className="space-y-4">
              {requiredDocItems.map((doc) => {
                const matchingRows = portalDocumentRows.filter(
                  (r) =>
                    !isPortalSignedDocumentRow(r) &&
                    isDocumentRowVisibleInClientUi(
                      r,
                      portalRequiredDocNames,
                      ADMIN_OFFICE_AGREEMENT_DOC_TYPE
                    ) &&
                    docRowMatchesRequiredDocType(r.doc_type, doc.name)
                );
                const allSlotsFilled =
                  matchingRows.length > 0 &&
                  matchingRows.every((r) =>
                    documentRowHasRequiredChecklistUpload(r)
                  );
                const done = allSlotsFilled;
                const addBusy =
                  docUploadBusy?.mode === "add" &&
                  docUploadBusy.requiredDocName === doc.name;
                const uploadLocked =
                  docUploadBusy !== null || portalThankYouSuppressesClientWork;
                return (
                  <li
                    key={doc.name}
                    className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {done ? (
                        <CheckCircle2
                          className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-label="הועלה"
                        />
                      ) : (
                        <span
                          className="mt-1.5 h-5 w-5 shrink-0 rounded-full border-2 border-neutral-300 dark:border-neutral-600"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1 text-start">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {doc.name}
                        </span>
                        {!done ? (
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            {matchingRows.length > 1
                              ? `${matchingRows.filter((r) => !documentRowHasRequiredChecklistUpload(r)).length} ממתינים להעלאה`
                              : "טרם הועלה מסמך"}
                          </p>
                        ) : null}
                        {matchingRows.length > 0 ? (
                          <ul className="mt-2 space-y-2">
                            {matchingRows.map((row) => {
                              const replaceBusy =
                                docUploadBusy?.mode === "replace" &&
                                docUploadBusy.documentId === row.id;
                              const resolved = resolveDocumentsUploadStoragePath(
                                row.storage_path,
                                row.file_url
                              );
                              const leg = row.file_url?.trim();
                              const legacyOk = !!(
                                leg?.startsWith("http://") ||
                                leg?.startsWith("https://")
                              );
                              const canView = Boolean(resolved || legacyOk);
                              const hasFile =
                                documentRowHasRequiredChecklistUpload(row);
                              if (!hasFile) {
                                return (
                                  <li
                                    key={row.id}
                                    className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-2 py-2 text-xs dark:border-amber-900/60 dark:bg-amber-950/20 sm:text-sm"
                                  >
                                    <span className="min-w-0 flex-1 text-neutral-700 dark:text-neutral-300">
                                      ממתין להעלאה (שורה במערכת)
                                    </span>
                                    <label
                                      className={
                                        uploadLocked
                                          ? "inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 font-medium text-neutral-800 opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                                          : "inline-flex cursor-pointer items-center gap-1 rounded-md bg-neutral-900 px-2 py-1 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                                      }
                                    >
                                      {replaceBusy ? (
                                        <Loader2
                                          className="h-3.5 w-3.5 animate-spin"
                                          aria-hidden
                                        />
                                      ) : (
                                        <FileUp
                                          className="h-3.5 w-3.5"
                                          aria-hidden
                                        />
                                      )}
                                      <span>{replaceBusy ? "מעלה…" : "העלה"}</span>
                                      <input
                                        type="file"
                                        className="sr-only"
                                        accept="image/*,.pdf,application/pdf"
                                        disabled={uploadLocked || replaceBusy}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          e.target.value = "";
                                          if (f)
                                            void handleReplaceDocFile(row, f);
                                        }}
                                      />
                                    </label>
                                  </li>
                                );
                              }
                              return (
                              <li
                                key={row.id}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50/80 px-2 py-2 text-xs dark:border-neutral-600 dark:bg-neutral-900/60 sm:text-sm"
                              >
                                <span className="min-w-0 flex-1 break-words text-neutral-700 dark:text-neutral-300">
                                  {row.original_filename?.trim() ||
                                    "מסמך שהועלה"}
                                </span>
                                <span className="flex shrink-0 flex-wrap items-center gap-2">
                                  {canView ? (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-800 transition hover:bg-blue-100 disabled:opacity-60 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200 dark:hover:bg-blue-950"
                                        disabled={
                                          uploadLocked ||
                                          deletingDocumentId === row.id
                                        }
                                        onClick={() =>
                                          handleOpenPortalDocument(row)
                                        }
                                      >
                                        <ExternalLink
                                          className="h-3.5 w-3.5"
                                          aria-hidden
                                        />
                                        צפייה
                                      </button>
                                  ) : null}
                                  <label
                                    className={
                                      uploadLocked || deletingDocumentId === row.id
                                        ? "inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 font-medium text-neutral-800 opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                                        : "inline-flex cursor-pointer items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 font-medium text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                                    }
                                  >
                                    {replaceBusy ? (
                                      <Loader2
                                        className="h-3.5 w-3.5 animate-spin"
                                        aria-hidden
                                      />
                                    ) : (
                                      <Pencil
                                        className="h-3.5 w-3.5"
                                        aria-hidden
                                      />
                                    )}
                                    <span>החלף</span>
                                    <input
                                      type="file"
                                      className="sr-only"
                                      accept="image/*,.pdf,application/pdf"
                                      disabled={
                                        uploadLocked ||
                                        deletingDocumentId === row.id
                                      }
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = "";
                                        if (f) void handleReplaceDocFile(row, f);
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-medium text-red-800 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-950"
                                    disabled={
                                      deletingDocumentId === row.id ||
                                      uploadLocked
                                    }
                                    onClick={() =>
                                      void handleDeletePortalDocument(row)
                                    }
                                  >
                                    {deletingDocumentId === row.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2
                                        className="h-3.5 w-3.5"
                                        aria-hidden
                                      />
                                    )}
                                    מחק
                                  </button>
                                </span>
                              </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {doc.downloadLink ? (
                          <div className="mt-2">
                            <a
                              href={doc.downloadLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 underline decoration-blue-400 underline-offset-2 transition hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200 dark:decoration-blue-500 dark:hover:bg-blue-950"
                            >
                              להורדת הטופס
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {!done && matchingRows.length === 0 ? (
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 self-start rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white sm:shrink-0">
                        {addBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileUp className="h-4 w-4" aria-hidden />
                        )}
                        <span>{addBusy ? "מעלה…" : "העלה קובץ"}</span>
                        <input
                          type="file"
                          className="sr-only"
                          accept="image/*,.pdf,application/pdf"
                          disabled={addBusy || uploadLocked}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void handleDocFile(doc.name, f);
                          }}
                        />
                      </label>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {allRequiredDocsUploaded && requiredDocItems.length > 0 ? (
            <div
              className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-6 dark:border-emerald-800 dark:bg-emerald-950/25"
              role="region"
              aria-label={
                portalMode === "documents"
                  ? "אישור שמירת מסמכים"
                  : "שליחת הבקשה"
              }
            >
              <p className="text-start text-sm font-medium text-emerald-950 dark:text-emerald-100">
                כל המסמכים הנדרשים הועלו. מומלץ לבדוק שוב את הקבצים בלחיצה על
                &quot;צפייה&quot;
                {portalMode === "documents"
                  ? " לפני האישור."
                  : " לפני השליחה הסופית."}
              </p>
              {portalMode === "documents" ? (
                <p className="mt-2 text-start text-xs text-emerald-900/85 dark:text-emerald-200/90">
                  במצב קישור מסמכים בלבד — הלחיצה אינה פותחת חתימה ואינה שולחת
                  את בקשת הסיום המלאה; היא מאשרת שהקבצים נשמרו ומעדכנת את סטטוס
                  התיק כאשר רלוונטי.
                </p>
              ) : null}
              <button
                type="button"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500 sm:w-auto"
                disabled={
                  submitApplicationBusy ||
                  docUploadBusy !== null ||
                  deletingDocumentId !== null
                }
                onClick={() =>
                  void (portalMode === "documents"
                    ? handleDocumentsPortalFinish()
                    : handleSubmitApplication())
                }
              >
                {submitApplicationBusy ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                )}
                {portalMode === "documents"
                  ? "סיימתי — המסמכים נשמרו"
                  : "שליחת הבקשה"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {hideSignatureUi &&
      client &&
      !portalThankYouSuppressesClientWork &&
      !documentsOnlyMainVisible ? (
        <section
          className="mt-6 rounded-xl border border-sky-200 bg-sky-50/80 p-5 text-start dark:border-sky-900/50 dark:bg-sky-950/25"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-sky-950 dark:text-sky-100">
            קישור העלאת מסמכים
          </p>
          <p className="mt-2 text-sm text-sky-900/90 dark:text-sky-200/90">
            אם אינכם רואים כאן רשימת קבצים — ייתכן שהמשרד טרם הפעיל את שלב
            ההעלאות, או שטרם הוגדרו מסמכים נדרשים לתיק. פנו למשרד לקבלת עזרה.
          </p>
        </section>
      ) : null}
    </div>
    );
  } catch (err) {
    console.error("[ClientPortal] render error (documents/sign mode)", err);
    portalMain = (
      <div
        className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-start text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
        role="alert"
        dir="rtl"
      >
        <p className="font-semibold">שגיאה בתצוגת הפורטל</p>
        <p className="mt-2 text-sm opacity-90">
          נסו לרענן את הדף. אם הבעיה נמשכת, פנו למשרד.
        </p>
      </div>
    );
  }

  return portalMain;
}

function PortalSearchParamsFallback() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-neutral-600 dark:text-neutral-400"
      dir="rtl"
    >
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      <div className="text-sm">Loading...</div>
    </div>
  );
}

/** Suspense required: `useSearchParams()` must not run without a boundary (Next.js CSR bailout). */
export function ClientPortal(props: ClientPortalProps) {
  return (
    <Suspense fallback={<PortalSearchParamsFallback />}>
      <ClientPortalImpl {...props} />
    </Suspense>
  );
}
