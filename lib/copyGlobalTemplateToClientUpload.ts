import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENTS_UPLOAD_BUCKET } from "@/lib/documentsUploadStorage";
import { prepareStorageObjectPathForSdk } from "@/lib/storagePublicUrl";
import {
  timestampedStorageObjectName,
  uniqueDocumentsUploadFolderSegment,
} from "@/lib/storageKey";

const GLOBAL_TEMPLATES_BUCKET = "documents-templates";

export type GlobalTemplateRow = {
  id: string;
  name: string;
  original_filename: string | null;
  storage_path: string;
};

function guessContentType(objectName: string): string {
  const n = objectName.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (n.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

/**
 * PDF or Word (.docx) for portal signature.
 * Agreement templates from settings live under `documents-templates` as `active/<id>.docx`;
 * legacy rows may use `active/<uuid>` without a suffix or a display name without an extension.
 */
export function isGlobalTemplateForPortalSignature(t: GlobalTemplateRow): boolean {
  const path = (t.storage_path ?? "").toLowerCase().trim();
  if (path.endsWith(".pdf") || path.endsWith(".docx")) return true;
  if (path.startsWith("active/")) return true;
  const fromOrig = (t.original_filename ?? "").toLowerCase();
  const fromName = (t.name ?? "").toLowerCase();
  return (
    fromOrig.endsWith(".pdf") ||
    fromOrig.endsWith(".docx") ||
    fromName.endsWith(".pdf") ||
    fromName.endsWith(".docx")
  );
}

/** Filename stored on the client `documents` row after copy. */
export function inferTemplateOriginalFilename(t: GlobalTemplateRow): string {
  const o = t.original_filename?.trim();
  if (o) return o;
  const n = (t.name ?? "").trim() || "template";
  const nl = n.toLowerCase();
  if (nl.endsWith(".pdf") || nl.endsWith(".docx") || nl.endsWith(".doc")) {
    return n;
  }
  const pl = (t.storage_path ?? "").toLowerCase();
  if (pl.endsWith(".docx")) return `${n}.docx`;
  if (pl.endsWith(".pdf")) return `${n}.pdf`;
  if (pl.endsWith(".doc")) return `${n}.doc`;
  return `${n}.docx`;
}

/**
 * Copies a file from `documents-templates` into `documents-uploads` for a client.
 */
export async function copyGlobalTemplateToClientDocumentsUpload(
  supabase: SupabaseClient,
  clientId: string,
  template: GlobalTemplateRow
): Promise<
  | {
      storagePath: string;
      publicUrl: string;
      originalFilename: string;
    }
  | { error: string }
> {
  const templateKey = prepareStorageObjectPathForSdk(template.storage_path);
  const { data: blob, error: dlErr } = await supabase.storage
    .from(GLOBAL_TEMPLATES_BUCKET)
    .download(templateKey);

  if (dlErr || !blob) {
    return {
      error: dlErr?.message ?? "הורדת התבנית מהאחסון נכשלה",
    };
  }

  const rawLabel = inferTemplateOriginalFilename(template);
  const objectName = timestampedStorageObjectName(rawLabel);
  const path = `${clientId}/${uniqueDocumentsUploadFolderSegment()}/${objectName}`;
  const contentType = guessContentType(objectName);

  const { error: upErr } = await supabase.storage
    .from(DOCUMENTS_UPLOAD_BUCKET)
    .upload(path, blob, {
      contentType,
      upsert: false,
    });

  if (upErr) {
    return { error: upErr.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(DOCUMENTS_UPLOAD_BUCKET).getPublicUrl(path);

  return {
    storagePath: path,
    publicUrl,
    originalFilename: rawLabel,
  };
}
