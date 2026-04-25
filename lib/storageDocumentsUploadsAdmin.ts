import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENTS_UPLOAD_BUCKET } from "@/lib/documentsUploadStorage";

/**
 * Lists object paths under `documents-uploads/{clientId}/…` (nested folders per upload).
 */
export async function listAllDocumentsUploadPathsForClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<string[]> {
  const root = clientId.trim();
  if (!root) return [];
  const paths: string[] = [];
  const { data: top, error } = await supabase.storage
    .from(DOCUMENTS_UPLOAD_BUCKET)
    .list(root, { limit: 1000 });

  if (error || !top?.length) return paths;

  for (const entry of top) {
    const subPath = `${root}/${entry.name}`;
    if (entry.metadata) {
      paths.push(subPath);
      continue;
    }
    const { data: files } = await supabase.storage
      .from(DOCUMENTS_UPLOAD_BUCKET)
      .list(subPath, { limit: 1000 });
    for (const f of files ?? []) {
      paths.push(`${subPath}/${f.name}`);
    }
  }
  return paths;
}

const REMOVE_BATCH = 80;

export async function removeDocumentsUploadPaths(
  supabase: SupabaseClient,
  paths: string[]
): Promise<{ error: Error | null }> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  for (let i = 0; i < unique.length; i += REMOVE_BATCH) {
    const chunk = unique.slice(i, i + REMOVE_BATCH);
    const { error } = await supabase.storage
      .from(DOCUMENTS_UPLOAD_BUCKET)
      .remove(chunk);
    if (error) return { error: new Error(error.message) };
  }
  return { error: null };
}
