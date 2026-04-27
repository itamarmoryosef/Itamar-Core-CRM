import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCustomFieldSlugInput } from "@/lib/customFieldsTemplate";
import {
  buildAgreementTemplateData,
  populateDocxTemplateToHtml,
} from "@/lib/populateAgreementDocx";
import { normalizedAgreementTemplateIds } from "@/lib/portalSignatureState";
import { prepareStorageObjectPathForSdk } from "@/lib/storagePublicUrl";
import { stripClientIdentitySummaryFromAgreementHtml } from "@/lib/stripAgreementHtmlClientSummary";
import {
  documentsUploadDownloadCandidates,
  resolveDocumentsUploadStoragePath,
} from "@/lib/documentsUploadStorage";

export type PortalClientRowLike = {
  full_name: string;
  id_number: string;
  phone?: string | null;
  fee_upfront?: string | number | null;
  fee_success?: string | number | null;
  fee_amount?: number | null;
  total_amount?: number | null;
  payment_status?: string | null;
  agreement_notes?: string | null;
  agreement_template_ids?: string[] | null;
  agreement_template_sign_index?: number | null;
};

export type PortalDocRowLike = {
  id: string;
  storage_path: string | null;
  file_url: string | null;
  original_filename: string | null;
};

function metaRowsToSlugsAndTypes(
  data: { slug?: string; field_type?: string }[] | null
): { slugs: string[]; typeBySlug: Record<string, string> } {
  const typeBySlug: Record<string, string> = {};
  const slugs: string[] = [];
  for (const r of data ?? []) {
    const raw = (r.slug ?? "").trim();
    if (!raw) continue;
    const key = normalizeCustomFieldSlugInput(raw);
    if (!key) continue;
    typeBySlug[key] = String((r as { field_type?: string }).field_type ?? "text");
    slugs.push(raw);
  }
  return { slugs, typeBySlug };
}

async function loadCustomFieldDefinitionMeta(
  supabase: SupabaseClient
): Promise<{ slugs: string[]; typeBySlug: Record<string, string> }> {
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("slug, field_type");
  if (error || !data) return { slugs: [], typeBySlug: {} };
  return metaRowsToSlugsAndTypes(
    data as { slug?: string; field_type?: string }[]
  );
}

/**
 * Re-merge Word → HTML with latest custom fields (browser; same pipeline as portal load).
 */
export async function refreshTemplateAgreementHtml(
  supabase: SupabaseClient,
  client: PortalClientRowLike,
  customFieldsData: unknown,
  customFieldDefinitionSlugs?: string[],
  customFieldTypeBySlug?: Record<string, string> | null
): Promise<string | null> {
  const orderedIds = normalizedAgreementTemplateIds(
    client.agreement_template_ids
  );
  const signIdx = Math.max(
    0,
    Number(client.agreement_template_sign_index ?? 0) || 0
  );
  const currentTemplateId =
    orderedIds.length > 0 && signIdx < orderedIds.length
      ? orderedIds[signIdx]
      : null;

  let storagePath: string | null = null;

  if (currentTemplateId) {
    const res = await supabase
      .from("templates")
      .select("storage_path")
      .eq("id", currentTemplateId)
      .eq("is_active", true)
      .maybeSingle();
    storagePath = (res.data as { storage_path?: string } | null)
      ?.storage_path?.trim() ?? null;
  } else {
    const res = await supabase
      .from("templates")
      .select("storage_path")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    storagePath = (res.data as { storage_path?: string } | null)
      ?.storage_path?.trim() ?? null;
  }

  if (!storagePath) return null;

  const key = prepareStorageObjectPathForSdk(storagePath);
  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("documents-templates")
    .download(key);
  if (downloadError || !fileBlob) return null;

  const arrayBuffer = await fileBlob.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;

  try {
    let slugList = customFieldDefinitionSlugs;
    let typeBySlug = customFieldTypeBySlug;
    if (!slugList) {
      const m = await loadCustomFieldDefinitionMeta(supabase);
      slugList = m.slugs;
      typeBySlug = typeBySlug ?? m.typeBySlug;
    } else if (typeBySlug == null) {
      const m = await loadCustomFieldDefinitionMeta(supabase);
      typeBySlug = m.typeBySlug;
    }
    const templateData = buildAgreementTemplateData(
      {
        ...client,
        custom_fields_data: customFieldsData,
      },
      slugList,
      typeBySlug ?? null
    );
    const populated = await populateDocxTemplateToHtml(
      arrayBuffer,
      templateData
    );
    return stripClientIdentitySummaryFromAgreementHtml(populated.html);
  } catch {
    return null;
  }
}

export async function refreshDocumentRowDocxHtml(
  supabase: SupabaseClient,
  client: PortalClientRowLike,
  docRow: PortalDocRowLike,
  customFieldsData: unknown,
  customFieldDefinitionSlugs?: string[],
  customFieldTypeBySlug?: Record<string, string> | null
): Promise<string | null> {
  const uploadPath =
    resolveDocumentsUploadStoragePath(
      docRow.storage_path,
      docRow.file_url
    ) ?? "";
  const cand0 =
    documentsUploadDownloadCandidates(
      docRow.storage_path,
      docRow.file_url
    )[0] ?? "";
  const usedKey = cand0 || uploadPath;
  if (!usedKey.trim()) return null;

  const { data, error } = await supabase.storage
    .from("documents-uploads")
    .download(prepareStorageObjectPathForSdk(usedKey));
  if (error || !data) return null;

  const buf = await data.arrayBuffer();
  if (!buf || buf.byteLength === 0) return null;

  const nameLower = (docRow.original_filename ?? "").toLowerCase();
  const pathForType = usedKey.toLowerCase();
  const isDocx =
    nameLower.endsWith(".docx") || pathForType.endsWith(".docx");
  if (!isDocx) return null;

  try {
    let slugList = customFieldDefinitionSlugs;
    let typeBySlug = customFieldTypeBySlug;
    if (!slugList) {
      const m = await loadCustomFieldDefinitionMeta(supabase);
      slugList = m.slugs;
      typeBySlug = typeBySlug ?? m.typeBySlug;
    } else if (typeBySlug == null) {
      const m = await loadCustomFieldDefinitionMeta(supabase);
      typeBySlug = m.typeBySlug;
    }
    const templateData = buildAgreementTemplateData(
      {
        ...client,
        custom_fields_data: customFieldsData,
      },
      slugList,
      typeBySlug ?? null
    );
    const populated = await populateDocxTemplateToHtml(buf, templateData);
    return stripClientIdentitySummaryFromAgreementHtml(populated.html);
  } catch {
    return null;
  }
}
