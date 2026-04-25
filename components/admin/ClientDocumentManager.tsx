"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Bell,
  Clock,
  Download,
  FileSignature,
  FileUp,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { supabase } from "@/lib/supabase";
import { buildClientPatchAfterSignatureDocumentDeleted } from "@/lib/agreementSignatureDeleteSync";
import {
  DOCUMENTS_SIGNED_BUCKET,
  DOCUMENTS_UPLOAD_BUCKET,
  resolveDocumentsUploadStoragePath,
} from "@/lib/documentsUploadStorage";
import { PORTAL_SIGNED_AGREEMENT_DOC_TYPE } from "@/lib/documentListVisibility";
import { storageObjectPathFromPublicUrl } from "@/lib/storagePublicUrl";
import {
  docRowMatchesRequiredDocType,
  documentRowHasUpload,
  effectiveRequiredDocNames,
  emptyPlaceholderRowsSameSemanticType,
  labelForDocType,
  stripExcludedRequiredDocKeys,
} from "@/lib/requiredDocuments";
import {
  timestampedStorageObjectName,
  uniqueDocumentsUploadFolderSegment,
} from "@/lib/storageKey";

export type DocRow = {
  id: string;
  doc_type: string;
  file_url: string | null;
  original_filename: string | null;
  storage_path: string | null;
  name?: string | null;
  status?: string | null;
  needs_signature?: boolean | null;
  signature_signed_at?: string | null;
  signed_pdf_storage_path?: string | null;
  created_at?: string | null;
};

export type DocumentTypeRow = {
  id: string;
  name: string;
  download_link: string | null;
};

export type AgreementTemplateRow = {
  id: string;
  name: string;
  original_filename: string | null;
  storage_path: string | null;
};

/** Shared with admin client page — portal PDF/Word eligibility. */
export function documentRowEligibleForPortalSignature(doc: DocRow): boolean {
  const name = (doc.original_filename ?? "").toLowerCase();
  if (name.endsWith(".pdf") || name.endsWith(".docx")) return true;
  const p = resolveDocumentsUploadStoragePath(doc.storage_path, doc.file_url);
  if (!p) return false;
  const pl = p.toLowerCase();
  return pl.endsWith(".pdf") || pl.endsWith(".docx");
}

function docsForRequiredName(docs: DocRow[], requiredName: string): DocRow[] {
  return docs.filter((d) =>
    docRowMatchesRequiredDocType(d.doc_type, requiredName)
  );
}

function adminDocumentViewPublicUrl(d: DocRow): string | null {
  const signedP = d.signed_pdf_storage_path?.trim();
  if (signedP) {
    const {
      data: { publicUrl },
    } = supabase.storage.from(DOCUMENTS_SIGNED_BUCKET).getPublicUrl(signedP);
    return publicUrl;
  }
  const signedFromUrl = storageObjectPathFromPublicUrl(
    d.file_url?.trim() ?? "",
    DOCUMENTS_SIGNED_BUCKET
  );
  if (signedFromUrl) {
    const {
      data: { publicUrl },
    } = supabase.storage.from(DOCUMENTS_SIGNED_BUCKET).getPublicUrl(signedFromUrl);
    return publicUrl;
  }
  const uploadPath = resolveDocumentsUploadStoragePath(
    d.storage_path,
    d.file_url
  );
  if (uploadPath) {
    const {
      data: { publicUrl },
    } = supabase.storage.from(DOCUMENTS_UPLOAD_BUCKET).getPublicUrl(uploadPath);
    return publicUrl;
  }
  const fallback = d.file_url?.trim();
  return fallback || null;
}

function dedupeAdminAgreementDocumentRows(
  rows: DocRow[],
  agreementTemplateNames: Set<string>
): DocRow[] {
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase();
  const hide = new Set<string>();

  for (const p of rows) {
    if (
      p.needs_signature !== true ||
      p.signed_pdf_storage_path?.trim() ||
      p.signature_signed_at?.trim()
    ) {
      continue;
    }
    const pFile = norm(p.original_filename);
    if (pFile) {
      const supersededLegacy = rows.some((s) => {
        if (s.id === p.id) return false;
        const signedPath = s.signed_pdf_storage_path?.trim();
        const signedAt = s.signature_signed_at?.trim();
        if (!signedPath && !signedAt) return false;
        if (norm(s.original_filename) !== pFile) return false;
        return (s.doc_type ?? "").trim() === PORTAL_SIGNED_AGREEMENT_DOC_TYPE;
      });
      if (supersededLegacy) hide.add(p.id);
    }

    const dt = (p.doc_type ?? "").trim();
    if (dt && agreementTemplateNames.has(dt)) {
      const signedSameTemplate = rows.some((s) => {
        if (s.id === p.id) return false;
        if ((s.doc_type ?? "").trim() !== dt) return false;
        return Boolean(
          s.signed_pdf_storage_path?.trim() || s.signature_signed_at?.trim()
        );
      });
      if (signedSameTemplate) hide.add(p.id);
    }
  }

  return rows.filter((d) => !hide.has(d.id));
}

function formatAdminDocTableDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

function adminDocumentTableDisplayName(d: DocRow): string {
  const title = d.name?.trim();
  if (title) return title;
  return labelForDocType(d.doc_type);
}

function adminDocRowIsFullySigned(d: DocRow): boolean {
  return Boolean(
    d.signed_pdf_storage_path?.trim() || d.signature_signed_at?.trim()
  );
}

async function downloadDocumentFileFromUrl(
  url: string,
  filename: string
): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

type AgreementTemplateQuickAddProps = {
  templates: AgreementTemplateRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (q: string) => void;
  addingId: string | null;
  onPick: (t: AgreementTemplateRow) => void;
  /** כשמוצג כפתור ראשי בדף האב — בוחרים תבנית בלי כפתור + */
  hideTrigger?: boolean;
};

export function AgreementTemplateQuickAdd({
  templates,
  open,
  onOpenChange,
  search,
  onSearchChange,
  addingId,
  onPick,
  hideTrigger = false,
}: AgreementTemplateQuickAddProps) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.original_filename ?? "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  const panel = open ? (
    <>
      <button
        type="button"
        aria-label="סגור"
        className="fixed inset-0 z-[100] cursor-default bg-transparent"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={`z-[110] w-[min(100vw-2rem,20rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900 ${
          hideTrigger
            ? "absolute end-0 top-full mt-2"
            : "absolute end-0 top-full mt-1"
        }`}
        dir="rtl"
      >
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="חיפוש תבנית…"
          className="w-full border-b border-slate-100 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          autoFocus
        />
        <ul className="max-h-[min(24rem,50vh)] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-2.5 py-2 text-center text-[10px] text-slate-500">
              אין תוצאות
            </li>
          ) : (
            filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={addingId !== null}
                  onClick={() => onPick(t)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  {addingId === t.id ? (
                    <Loader2
                      className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500"
                      aria-hidden
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {t.name}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  ) : null;

  if (hideTrigger) {
    return panel;
  }

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          onOpenChange(!open);
          if (!open) onSearchChange("");
        }}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        title="הוספת הסכם מתבנית"
        aria-expanded={open}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      {panel}
    </div>
  );
}

type ClientForDocMutations = {
  id: string;
  full_name: string;
  required_docs: unknown;
  agreement_template_ids?: string[] | null;
  agreement_template_sign_index?: number | null;
  agreement_source?: string | null;
  agreement_request_active?: boolean | null;
  agreement_custom_pdf_path?: string | null;
  agreement_custom_pdf_filename?: string | null;
};

export type ClientDocumentManagerProps = {
  clientId: string;
  client: ClientForDocMutations;
  setClient: Dispatch<SetStateAction<ClientForDocMutations | null | undefined>>;
  docs: DocRow[];
  setDocs: Dispatch<SetStateAction<DocRow[]>>;
  documentTypes: DocumentTypeRow[];
  agreementTemplateNameSet: Set<string>;
  portalSignatureAgreementTemplates: AgreementTemplateRow[];
  agreementTemplates: AgreementTemplateRow[];
  loadAll: () => Promise<void>;
  hasPhone: boolean;
  onSendDocReminder: (reqName: string) => void | Promise<void>;
  docReminderSending: string | null;
  docAgreementPickerOpen: boolean;
  setDocAgreementPickerOpen: (v: boolean) => void;
  agreementTemplateSearch: string;
  setAgreementTemplateSearch: (v: string) => void;
  addingAgreementTemplateId: string | null;
  onAddAgreementFromTemplate: (tpl: AgreementTemplateRow) => void | Promise<void>;
  toggleNeedsSignatureForDoc: (d: DocRow) => void | Promise<void>;
  togglingSigDocId: string | null;
  cleanupBusy: boolean;
  setToast: (t: { type: "success" | "error"; message: string }) => void;
};

export function ClientDocumentManager({
  clientId,
  client,
  setClient,
  docs,
  setDocs,
  documentTypes,
  agreementTemplateNameSet,
  portalSignatureAgreementTemplates,
  agreementTemplates,
  loadAll,
  hasPhone,
  onSendDocReminder,
  docReminderSending,
  docAgreementPickerOpen,
  setDocAgreementPickerOpen,
  agreementTemplateSearch,
  setAgreementTemplateSearch,
  addingAgreementTemplateId,
  onAddAgreementFromTemplate,
  toggleNeedsSignatureForDoc,
  togglingSigDocId,
  cleanupBusy,
  setToast,
}: ClientDocumentManagerProps) {
  const newDocumentFileInputRef = useRef<HTMLInputElement>(null);
  const [newDocUploadBusy, setNewDocUploadBusy] = useState(false);
  const [newDocTypeChoice, setNewDocTypeChoice] = useState("");
  const [freeformDocType, setFreeformDocType] = useState("");
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(
    null
  );
  const [editingDocumentLabel, setEditingDocumentLabel] = useState("");
  const [documentLabelSaving, setDocumentLabelSaving] = useState(false);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<DocRow | null>(null);
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const [uploadDropActive, setUploadDropActive] = useState(false);

  const requiredNames = useMemo(() => {
    return effectiveRequiredDocNames(client.required_docs);
  }, [client.required_docs]);

  const visibleDocs = useMemo(() => {
    return dedupeAdminAgreementDocumentRows(docs, agreementTemplateNameSet);
  }, [docs, agreementTemplateNameSet]);

  const docsChronological = useMemo(() => {
    return [...visibleDocs].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [visibleDocs]);

  const missingRequiredNames = useMemo(() => {
    return requiredNames.filter(
      (n) => docsForRequiredName(docs, n).length === 0
    );
  }, [requiredNames, docs]);

  const downloadLinkForRequiredName = (name: string) =>
    documentTypes.find((t) => t.name === name)?.download_link?.trim() ?? null;

  useEffect(() => {
    if (documentTypes.length === 0) return;
    setNewDocTypeChoice((prev) => {
      if (prev && documentTypes.some((t) => t.name === prev)) return prev;
      return documentTypes[0]!.name;
    });
  }, [documentTypes]);

  async function uploadOneClientDocumentFile(
    file: File,
    docTypeName: string
  ): Promise<{ error: string | null; row: DocRow | null }> {
    const objectName = timestampedStorageObjectName(file.name);
    const path = `${client.id}/${uniqueDocumentsUploadFolderSegment()}/${objectName}`;
    const { error: upErr } = await supabase.storage
      .from(DOCUMENTS_UPLOAD_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
    if (upErr)
      return { error: `העלאה נכשלה: ${upErr.message}`, row: null };
    const {
      data: { publicUrl },
    } = supabase.storage.from(DOCUMENTS_UPLOAD_BUCKET).getPublicUrl(path);
    const { data: inserted, error: insErr } = await supabase
      .from("documents")
      .insert({
        client_id: client.id,
        doc_type: docTypeName,
        status: "uploaded",
        file_url: publicUrl,
        storage_path: path,
        original_filename: file.name,
      })
      .select(
        "id, doc_type, file_url, original_filename, storage_path, name, status, needs_signature, signature_signed_at, signed_pdf_storage_path, created_at"
      )
      .single();
    if (insErr) return { error: insErr.message, row: null };
    return { error: null, row: (inserted ?? null) as DocRow | null };
  }

  const handleAddNewDocumentUploads = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const docTypeName =
      documentTypes.length > 0
        ? newDocTypeChoice.trim() || documentTypes[0]!.name
        : freeformDocType.trim();
    if (!docTypeName) {
      setToast({
        type: "error",
        message:
          documentTypes.length > 0
            ? "בחרו סוג מסמך מהרשימה."
            : "הקלידו שם סוג מסמך או הוסיפו סוגים ב־הגדרות ותצורה.",
      });
      return;
    }
    setNewDocUploadBusy(true);
    try {
      const files = Array.from(fileList);
      const results = await Promise.all(
        files.map((file) => uploadOneClientDocumentFile(file, docTypeName))
      );
      const newRows: DocRow[] = [];
      let lastErr: string | null = null;
      for (const r of results) {
        if (r.error) lastErr = r.error;
        else if (r.row) newRows.push(r.row);
      }
      if (newRows.length > 0) {
        setDocs((prev) => [...prev, ...newRows]);
      }
      if (newRows.length > 0) {
        setToast({
          type: "success",
          message:
            files.length === 1
              ? "המסמך נוסף לתיק."
              : `הועלו ${newRows.length} מתוך ${files.length} קבצים.`,
        });
      }
      if (lastErr) {
        setToast({
          type: "error",
          message:
            newRows.length > 0
              ? `${lastErr} (חלק מהקבצים לא הועלו)`
              : lastErr,
        });
      }
    } finally {
      setNewDocUploadBusy(false);
      if (newDocumentFileInputRef.current) {
        newDocumentFileInputRef.current.value = "";
      }
    }
  };

  const startEditDocumentLabel = (d: DocRow) => {
    setEditingDocumentId(d.id);
    setEditingDocumentLabel((d.doc_type ?? "").trim());
  };

  const cancelEditDocumentLabel = () => {
    setEditingDocumentId(null);
    setEditingDocumentLabel("");
  };

  const saveEditDocumentLabel = async () => {
    if (!editingDocumentId) return;
    const label = editingDocumentLabel.trim();
    if (!label) {
      setToast({ type: "error", message: "יש להזין שם או סוג מסמך." });
      return;
    }
    setDocumentLabelSaving(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({ doc_type: label })
        .eq("id", editingDocumentId)
        .eq("client_id", client.id);
      if (error) {
        setToast({ type: "error", message: error.message });
        return;
      }
      cancelEditDocumentLabel();
      setToast({ type: "success", message: "עודכן סוג המסמך." });
      await loadAll();
    } finally {
      setDocumentLabelSaving(false);
    }
  };

  const executeAdminDeleteDocument = async () => {
    const d = deleteConfirmDoc;
    if (!d) return;
    setDeletingDocId(d.id);
    try {
      const p = resolveDocumentsUploadStoragePath(d.storage_path, d.file_url);
      if (p) {
        const { error: rmErr } = await supabase.storage
          .from(DOCUMENTS_UPLOAD_BUCKET)
          .remove([p]);
        if (rmErr) {
          console.warn("[ClientDocumentManager] storage remove failed", rmErr);
        }
      }
      const signedP = d.signed_pdf_storage_path?.trim();
      if (signedP) {
        const { error: sigRm } = await supabase.storage
          .from(DOCUMENTS_SIGNED_BUCKET)
          .remove([signedP]);
        if (sigRm) {
          console.warn("[ClientDocumentManager] signed storage remove failed", sigRm);
        }
      }
      const placeholdersToRemove = emptyPlaceholderRowsSameSemanticType(
        docs,
        d
      );

      const { error: delErr } = await supabase
        .from("documents")
        .delete()
        .eq("id", d.id)
        .eq("client_id", client.id);
      if (delErr) {
        setToast({ type: "error", message: delErr.message });
        return;
      }

      const phIds = new Set(placeholdersToRemove.map((x) => x.id));
      setDocs((prev) =>
        prev.filter((row) => row.id !== d.id && !phIds.has(row.id))
      );

      for (const ph of placeholdersToRemove) {
        const { error: phErr } = await supabase
          .from("documents")
          .delete()
          .eq("id", ph.id)
          .eq("client_id", client.id);
        if (phErr) {
          console.warn("[ClientDocumentManager] placeholder cascade delete failed", phErr);
        }
      }

      const remainingDocRows = docs.filter(
        (row) =>
          row.id !== d.id &&
          !placeholdersToRemove.some((ph) => ph.id === row.id)
      );
      const { next: nextRequired, changed: requiredChanged } =
        stripExcludedRequiredDocKeys(client.required_docs);

      const clientUpdate: Record<string, unknown> = {};
      if (requiredChanged) {
        clientUpdate.required_docs = nextRequired;
      }

      const sigPatch = buildClientPatchAfterSignatureDocumentDeleted(
        client,
        d,
        remainingDocRows,
        agreementTemplates
      );
      if (sigPatch) {
        Object.assign(clientUpdate, sigPatch);
      }

      if (Object.keys(clientUpdate).length > 0) {
        const { error: upErr } = await supabase
          .from("clients")
          .update(clientUpdate)
          .eq("id", client.id);
        if (upErr) {
          setToast({
            type: "error",
            message: `המסמך נמחק אך עדכון תיק הלקוח נכשל: ${upErr.message}`,
          });
          await loadAll();
          return;
        }
        setClient((c) =>
          c && c.id === client.id ? { ...c, ...clientUpdate } : c
        );
      }

      setDeleteConfirmDoc(null);
      setToast({ type: "success", message: "המסמך נמחק." });
      await loadAll();
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleDownloadAllDocuments = async () => {
    const toZip = dedupeAdminAgreementDocumentRows(docs, agreementTemplateNameSet);
    if (!clientId || toZip.length === 0) {
      setToast({ type: "error", message: "אין קבצים להורדה." });
      return;
    }
    setDownloadAllBusy(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let added = 0;
      for (let i = 0; i < toZip.length; i++) {
        const row = toZip[i]!;
        let blob: Blob | null = null;
        const signedPath = row.signed_pdf_storage_path?.trim();
        if (signedPath) {
          const { data, error } = await supabase.storage
            .from(DOCUMENTS_SIGNED_BUCKET)
            .download(signedPath);
          if (!error && data) blob = data;
        }
        const path = resolveDocumentsUploadStoragePath(
          row.storage_path,
          row.file_url
        );
        if (!blob && path) {
          const { data, error } = await supabase.storage
            .from(DOCUMENTS_UPLOAD_BUCKET)
            .download(path);
          if (!error && data) blob = data;
        }
        if (!blob && row.file_url?.trim().startsWith("http")) {
          try {
            const r = await fetch(row.file_url.trim());
            if (r.ok) blob = await r.blob();
          } catch {
            /* skip */
          }
        }
        if (!blob) continue;
        const rawName =
          row.original_filename?.trim() ||
          `${labelForDocType(row.doc_type)}-${i + 1}.bin`;
        const safe = rawName.replace(/[/\\?*:|"<>]/g, "_");
        zip.file(`${String(i + 1).padStart(2, "0")}_${safe}`, blob);
        added += 1;
      }
      if (added === 0) {
        setToast({
          type: "error",
          message: "לא ניתן היה להוריד קבצים. בדקו הרשאות או קישורים.",
        });
        return;
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      const safeClient = (client.full_name ?? "client")
        .replace(/[/\\?*:|"<>]/g, "_")
        .slice(0, 40);
      const url = URL.createObjectURL(zipBlob);
      a.href = url;
      a.download = `מסמכים_${safeClient}_${clientId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({
        type: "success",
        message: `הורד קובץ ZIP עם ${added} מסמכים.`,
      });
    } catch (e) {
      setToast({
        type: "error",
        message:
          e instanceof Error ? e.message : "יצירת הקובץ להורדה נכשלה.",
      });
    } finally {
      setDownloadAllBusy(false);
    }
  };

  return (
    <>
      <div
        className="flex h-full min-h-[600px] w-full flex-col p-4"
        role="tabpanel"
        id="client-tab-documents"
        aria-labelledby="client-tab-trigger-documents"
      >
        <SectionCard
          id="docs-h"
          title="מסמכים וחתימות"
          titleClassName="text-base font-bold"
          description={
            <span className="text-sm text-slate-600 dark:text-slate-400">
              העלו קבצים (מספר בבת אחת), הוסיפו הסכם מתבנית (+), וערכו או מחקו כל שורה
              בנפרד.
            </span>
          }
          headerExtra={
            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden text-xs font-medium text-slate-600 sm:inline dark:text-slate-400">
                תבנית
              </span>
              <AgreementTemplateQuickAdd
                templates={portalSignatureAgreementTemplates}
                open={docAgreementPickerOpen}
                onOpenChange={setDocAgreementPickerOpen}
                search={agreementTemplateSearch}
                onSearchChange={setAgreementTemplateSearch}
                addingId={addingAgreementTemplateId}
                onPick={(t) => void onAddAgreementFromTemplate(t)}
              />
            </div>
          }
        >
          <input
            ref={newDocumentFileInputRef}
            type="file"
            multiple
            className="sr-only"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png"
            onChange={(e) => void handleAddNewDocumentUploads(e.target.files)}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-stretch">
            <div className="space-y-2 text-start">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                סוג מסמך לעלאה
              </p>
              {documentTypes.length > 0 ? (
                <select
                  value={newDocTypeChoice || documentTypes[0]?.name || ""}
                  onChange={(e) => setNewDocTypeChoice(e.target.value)}
                  className="min-h-11 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm ring-indigo-500/20 focus:border-indigo-400 focus:outline-none focus:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:focus:border-indigo-500"
                  aria-label="סוג מסמך לעלאה"
                >
                  {documentTypes.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={freeformDocType}
                  onChange={(e) => setFreeformDocType(e.target.value)}
                  placeholder="שם סוג מסמך"
                  className="min-h-11 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-950"
                />
              )}
            </div>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  newDocumentFileInputRef.current?.click();
                }
              }}
              onClick={() => newDocumentFileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setUploadDropActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setUploadDropActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setUploadDropActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setUploadDropActive(false);
                void handleAddNewDocumentUploads(e.dataTransfer.files);
              }}
              aria-label="העלאת קבצים — גרירה לכאן או לחיצה לבחירה"
              className={`group relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/40 p-6 text-center shadow-inner transition-all dark:from-slate-900/80 dark:to-indigo-950/20 dark:border-slate-600 ${
                uploadDropActive
                  ? "border-indigo-400 bg-indigo-50/80 ring-2 ring-indigo-500/30 dark:border-indigo-500 dark:bg-indigo-950/40"
                  : "hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-600"
              } ${newDocUploadBusy ? "pointer-events-none opacity-70" : ""}`}
            >
              {newDocUploadBusy ? (
                <Loader2 className="h-10 w-10 animate-spin text-indigo-500" aria-hidden />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-600">
                  <FileUp className="h-7 w-7 text-indigo-600 dark:text-indigo-400" aria-hidden />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {newDocUploadBusy ? "מעלה קבצים…" : "גררו לכאן קבצים או לחצו לבחירה"}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  ניתן לבחור מספר קבצים בבת אחת (PDF, Word, תמונות)
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-4 text-sm md:hidden">
            {missingRequiredNames.map((reqName) => {
              const blankLink = downloadLinkForRequiredName(reqName);
              return (
                <article
                  key={`mobile-missing-${reqName}`}
                  className="rounded-2xl border border-rose-200/90 bg-gradient-to-br from-rose-50/90 to-white p-4 shadow-md dark:border-rose-900/60 dark:from-rose-950/30 dark:to-slate-900/40"
                >
                  <dl className="space-y-2 text-start text-sm">
                    <div>
                      <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        סוג מסמך:
                      </dt>
                      <dd className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {reqName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        סטטוס:
                      </dt>
                      <dd>
                        <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
                          חסר בתיק
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-col gap-2 border-t border-rose-200/60 pt-4 dark:border-rose-900/40">
                    <button
                      type="button"
                      onClick={() => void onSendDocReminder(reqName)}
                      disabled={!hasPhone || docReminderSending === reqName}
                      title="תזכורת WhatsApp"
                      className="inline-flex h-9 min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900 dark:bg-neutral-900 dark:text-amber-200"
                    >
                      {docReminderSending === reqName ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Bell className="h-4 w-4" aria-hidden />
                      )}
                      תזכורת WhatsApp
                    </button>
                    {blankLink ? (
                      <a
                        href={blankLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 min-h-9 w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100"
                      >
                        טופס ריק
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {docsChronological.map((d) => {
              const signed = adminDocRowIsFullySigned(d);
              const viewUrl = adminDocumentViewPublicUrl(d);
              const dlName =
                d.original_filename?.trim() || `document-${d.id.slice(0, 8)}`;
              return (
                <article
                  key={`mobile-doc-${d.id}`}
                  className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-md shadow-slate-200/40 ring-1 ring-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none dark:ring-slate-800"
                >
                  <div className="flex items-start gap-3 text-start">
                    <div className="mt-0.5 shrink-0">
                      {signed ? (
                        <Lock
                          className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                          aria-hidden
                        />
                      ) : (
                        <Clock className="h-5 w-5 text-amber-500" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      {editingDocumentId === d.id ? (
                        <div className="space-y-2">
                          <input
                            value={editingDocumentLabel}
                            onChange={(e) =>
                              setEditingDocumentLabel(e.target.value)
                            }
                            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950"
                            dir="auto"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={documentLabelSaving}
                              onClick={() => void saveEditDocumentLabel()}
                              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
                            >
                              {documentLabelSaving ? (
                                <Loader2
                                  className="h-4 w-4 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                "שמור"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditDocumentLabel}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium dark:border-slate-600"
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                              {adminDocumentTableDisplayName(d)}
                            </div>
                            <button
                              type="button"
                              title="עריכת סוג/שם מסמך"
                              disabled={
                                deletingDocId !== null ||
                                documentLabelSaving ||
                                togglingSigDocId !== null
                              }
                              onClick={() => startEditDocumentLabel(d)}
                              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              נשלח: {formatAdminDocTableDate(d.created_at)}
                            </span>
                            <span>
                              חתימה:{" "}
                              {d.signature_signed_at?.trim()
                                ? formatAdminDocTableDate(d.signature_signed_at)
                                : d.signed_pdf_storage_path?.trim()
                                  ? "חתום"
                                  : "—"}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <button
                      type="button"
                      disabled={
                        !documentRowHasUpload(d) ||
                        !documentRowEligibleForPortalSignature(d) ||
                        togglingSigDocId !== null ||
                        deletingDocId === d.id
                      }
                      title={
                        !documentRowHasUpload(d)
                          ? "העלו קובץ לפני סימון לחתימה"
                          : !documentRowEligibleForPortalSignature(d)
                            ? "לחתימה בפורטל — PDF או ‎.docx בלבד"
                            : d.needs_signature
                              ? d.signature_signed_at?.trim()
                                ? "חתום — לחץ להסרה"
                                : "ממתין לחתימה — לחץ לביטול"
                              : "סמן לחתימה בפורטל"
                      }
                      onClick={() => void toggleNeedsSignatureForDoc(d)}
                      className={`inline-flex h-10 min-h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-sm transition disabled:opacity-50 ${
                        d.needs_signature
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                          : "border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100"
                      }`}
                    >
                      {togglingSigDocId === d.id ? (
                        <Loader2
                          className="h-4 w-4 shrink-0 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <FileSignature className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      חתימה בפורטל
                    </button>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={!viewUrl}
                        onClick={() =>
                          viewUrl &&
                          window.open(viewUrl, "_blank", "noopener,noreferrer")
                        }
                        className="inline-flex h-10 min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-semibold text-blue-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-400"
                      >
                        צפייה
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          window.alert(
                            "מודול עריכת מסמכים מתקדם יוטמע כאן בהמשך"
                          )
                        }
                        className="inline-flex h-10 min-h-10 items-center justify-center gap-1 rounded-xl bg-indigo-600 text-xs font-semibold text-white shadow-md hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                      >
                        <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        עריכת מסמך
                      </button>
                      <button
                        type="button"
                        disabled={deletingDocId !== null}
                        onClick={() => setDeleteConfirmDoc(d)}
                        className="inline-flex h-10 min-h-10 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-800 shadow-sm hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
                      >
                        {deletingDocId === d.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        מחיקה
                      </button>
                    </div>
                    {viewUrl ? (
                      <button
                        type="button"
                        disabled={deletingDocId === d.id}
                        onClick={() =>
                          void downloadDocumentFileFromUrl(viewUrl, dlName)
                        }
                        className="h-10 min-h-10 w-full rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      >
                        הורדה
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {missingRequiredNames.length === 0 && visibleDocs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/90 px-4 py-12 text-center text-sm text-slate-600 shadow-inner dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                אין שורות מסמכים — הוסיפו מסמך או סמנו דרישות נדרשות.
              </div>
            ) : null}
          </div>

          <div className="mt-8 hidden min-h-[360px] md:block">
            <p className="mb-2 text-start text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              רשימת מסמכים
            </p>
            <div className="max-h-[min(75vh,56rem)] overflow-auto rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-200/50 ring-1 ring-slate-100 dark:border-slate-700 dark:bg-slate-900/30 dark:shadow-none dark:ring-slate-800">
              <table className="w-full min-w-[880px] border-collapse text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-gradient-to-l from-slate-50 to-white dark:border-slate-700 dark:from-slate-900/80 dark:to-slate-900/40">
                    <th
                      className="h-14 w-12 px-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                      aria-label="סטטוס"
                    />
                    <th className="h-14 px-4 py-3 text-start text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      מסמך / סוג
                    </th>
                    <th className="h-14 px-4 py-3 text-start text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      תאריך
                    </th>
                    <th className="h-14 px-4 py-3 text-start text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      חתימה
                    </th>
                    <th className="h-14 min-w-[280px] px-4 py-3 text-start text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {missingRequiredNames.map((reqName) => {
                    const blankLink = downloadLinkForRequiredName(reqName);
                    return (
                      <tr
                        key={`missing-${reqName}`}
                        className="h-9 border-b border-slate-50 dark:border-slate-800"
                      >
                        <td className="px-1 text-center align-middle">
                          <Send
                            className="mx-auto h-3.5 w-3.5 text-amber-500"
                            aria-hidden
                          />
                        </td>
                        <td className="px-2 align-middle font-medium text-slate-900 dark:text-slate-100">
                          {reqName}
                        </td>
                        <td className="px-2 align-middle text-[10px] text-slate-400">
                          —
                        </td>
                        <td className="px-2 align-middle text-[10px] text-slate-400">
                          —
                        </td>
                        <td className="px-2 align-middle">
                          <div className="flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void onSendDocReminder(reqName)}
                              disabled={!hasPhone || docReminderSending === reqName}
                              title="תזכורת WhatsApp"
                              className="inline-flex h-7 items-center justify-center rounded border border-slate-200 px-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {docReminderSending === reqName ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <Bell className="h-3.5 w-3.5" aria-hidden />
                              )}
                            </button>
                            {blankLink ? (
                              <a
                                href={blankLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-medium text-blue-600 underline dark:text-blue-400"
                              >
                                טופס
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {docsChronological.map((d) => {
                    const signed = adminDocRowIsFullySigned(d);
                    const viewUrl = adminDocumentViewPublicUrl(d);
                    const dlName =
                      d.original_filename?.trim() ||
                      `document-${d.id.slice(0, 8)}`;
                    const signedCol = d.signature_signed_at?.trim()
                      ? formatAdminDocTableDate(d.signature_signed_at)
                      : d.signed_pdf_storage_path?.trim()
                        ? "חתום"
                        : "—";
                    return (
                      <tr
                        key={d.id}
                        className="min-h-[3.5rem] border-b border-slate-100 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-2 text-center align-middle">
                          {signed ? (
                            <Lock
                              className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400"
                              aria-hidden
                            />
                          ) : (
                            <Clock
                              className="mx-auto h-4 w-4 text-amber-500"
                              aria-hidden
                            />
                          )}
                        </td>
                        <td className="max-w-[min(28rem,40vw)] min-w-[12rem] px-3 py-2 align-middle">
                          {editingDocumentId === d.id ? (
                            <div className="flex flex-col gap-2">
                              <input
                                value={editingDocumentLabel}
                                onChange={(e) =>
                                  setEditingDocumentLabel(e.target.value)
                                }
                                className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                                dir="auto"
                              />
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  disabled={documentLabelSaving}
                                  onClick={() => void saveEditDocumentLabel()}
                                  className="rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
                                >
                                  {documentLabelSaving ? (
                                    <Loader2
                                      className="h-3.5 w-3.5 animate-spin"
                                      aria-hidden
                                    />
                                  ) : (
                                    "שמור"
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditDocumentLabel}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600"
                                >
                                  ביטול
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {adminDocumentTableDisplayName(d)}
                              </div>
                              {d.original_filename?.trim() &&
                              adminDocumentTableDisplayName(d) !==
                                d.original_filename.trim() ? (
                                <div className="mt-0.5 truncate text-xs text-slate-400">
                                  {d.original_filename}
                                </div>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-middle text-xs text-slate-500 tabular-nums">
                          {formatAdminDocTableDate(d.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-middle text-xs text-slate-500 tabular-nums">
                          {signedCol}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                disabled={
                                  !documentRowHasUpload(d) ||
                                  !documentRowEligibleForPortalSignature(d) ||
                                  togglingSigDocId !== null ||
                                  deletingDocId === d.id
                                }
                                title="חתימה בפורטל"
                                onClick={() => void toggleNeedsSignatureForDoc(d)}
                                className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-1.5 text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                {togglingSigDocId === d.id ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <FileSignature className="h-3.5 w-3.5" aria-hidden />
                                )}
                              </button>
                              <button
                                type="button"
                                title="עריכת סוג מסמך"
                                disabled={
                                  (editingDocumentId !== null &&
                                    editingDocumentId !== d.id) ||
                                  deletingDocId !== null ||
                                  documentLabelSaving ||
                                  togglingSigDocId !== null
                                }
                                onClick={() => startEditDocumentLabel(d)}
                                className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-1.5 text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                              </button>
                              {viewUrl ? (
                                <button
                                  type="button"
                                  disabled={deletingDocId === d.id}
                                  onClick={() =>
                                    void downloadDocumentFileFromUrl(
                                      viewUrl,
                                      dlName
                                    )
                                  }
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                >
                                  הורדה
                                </button>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                disabled={!viewUrl}
                                onClick={() =>
                                  viewUrl &&
                                  window.open(
                                    viewUrl,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                                className="inline-flex h-8 min-h-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
                              >
                                צפייה
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  window.alert(
                                    "מודול עריכת מסמכים מתקדם יוטמע כאן בהמשך"
                                  )
                                }
                                className="inline-flex h-8 min-h-8 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2.5 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500"
                              >
                                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                                עריכת מסמך
                              </button>
                              <button
                                type="button"
                                disabled={deletingDocId !== null}
                                onClick={() => setDeleteConfirmDoc(d)}
                                className="inline-flex h-8 min-h-8 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
                              >
                                {deletingDocId === d.id ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                )}
                                מחיקה
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {missingRequiredNames.length === 0 &&
                  visibleDocs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        אין שורות מסמכים — הוסיפו מסמך או סמנו דרישות נדרשות.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {visibleDocs.length > 0 ? (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => void handleDownloadAllDocuments()}
                disabled={downloadAllBusy || cleanupBusy}
                className="inline-flex h-10 min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {downloadAllBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                )}
                הורדת כל המסמכים (ZIP)
              </button>
            </div>
          ) : null}
        </SectionCard>
      </div>

      {deleteConfirmDoc ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="סגור"
            className="absolute inset-0 bg-black/60"
            onClick={() =>
              deletingDocId === null && setDeleteConfirmDoc(null)
            }
          />
          <div className="relative z-10 flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="del-doc-title"
              aria-describedby="del-doc-desc"
              className="box-border max-h-[92dvh] w-full max-w-none overflow-y-auto border-x-0 border-b-0 border-t border-neutral-200 bg-white p-4 pb-6 shadow-2xl max-md:rounded-t-2xl max-md:px-4 sm:max-h-[90vh] sm:border sm:max-w-md sm:rounded-2xl sm:p-5 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <h2
                id="del-doc-title"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-50"
              >
                מחיקת מסמך
              </h2>
              <p
                id="del-doc-desc"
                className="mt-3 text-start text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
              >
                Are you sure you want to delete this document?
              </p>
              <p className="mt-2 text-start text-xs text-neutral-500 dark:text-neutral-400">
                {deleteConfirmDoc.original_filename?.trim() ||
                  labelForDocType(deleteConfirmDoc.doc_type)}
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  disabled={deletingDocId !== null}
                  onClick={() => setDeleteConfirmDoc(null)}
                  className="h-9 min-h-9 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  disabled={deletingDocId !== null}
                  onClick={() => void executeAdminDeleteDocument()}
                  className="inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
                >
                  {deletingDocId !== null ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  מחיקה
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
