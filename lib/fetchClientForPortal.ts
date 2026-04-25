import type { SupabaseClient } from "@supabase/supabase-js";

function looksLikeUnknownColumnError(message: string): boolean {
  return (
    /does not exist/i.test(message) ||
    /column\s+[\w.]+\s+does not exist/i.test(message)
  );
}

/**
 * Longest-first `select` lists for `clients` in the portal. When production is
 * missing migrations, PostgREST returns 400; we retry with fewer columns.
 * Order: drop newest / optional columns first.
 */
const PORTAL_CLIENT_SELECTS: string[] = [
  "id, full_name, id_number, phone, short_id, fee_amount, fee_upfront, fee_success, has_signed, signature_url, signed_at, last_reminder_at, required_docs, status, agreement_request_active, agreement_source, agreement_custom_pdf_path, agreement_custom_pdf_filename, agreement_aux_signed_at, upload_request_active, agreement_template_ids, agreement_template_sign_index, agreement_notes, custom_fields_data, agreement_structure_template_id, signature_template_id, total_amount, payment_status, assigned_field_definition_ids",
  "id, full_name, id_number, phone, fee_amount, fee_upfront, fee_success, has_signed, signature_url, signed_at, last_reminder_at, required_docs, status, agreement_request_active, agreement_source, agreement_custom_pdf_path, agreement_custom_pdf_filename, agreement_aux_signed_at, upload_request_active, agreement_template_ids, agreement_template_sign_index, agreement_notes, custom_fields_data, agreement_structure_template_id, signature_template_id, total_amount, payment_status",
  "id, full_name, id_number, phone, fee_amount, fee_upfront, fee_success, has_signed, signature_url, signed_at, last_reminder_at, required_docs, status, agreement_request_active, agreement_source, agreement_custom_pdf_path, agreement_custom_pdf_filename, agreement_aux_signed_at, upload_request_active, agreement_template_ids, agreement_template_sign_index, agreement_notes, custom_fields_data",
  "id, full_name, id_number, phone, fee_amount, fee_upfront, fee_success, has_signed, signature_url, signed_at, last_reminder_at, required_docs, status, agreement_request_active, agreement_source, agreement_custom_pdf_path, agreement_custom_pdf_filename, upload_request_active, agreement_template_ids, agreement_template_sign_index, custom_fields_data",
  "id, full_name, id_number, phone, fee_amount, fee_upfront, fee_success, has_signed, signature_url, signed_at, last_reminder_at, required_docs, status, agreement_request_active, agreement_source, agreement_custom_pdf_path, agreement_custom_pdf_filename, upload_request_active, agreement_template_ids, agreement_template_sign_index",
  "id, full_name, id_number, phone, fee_amount, fee_upfront, fee_success, has_signed, signature_url, signed_at, last_reminder_at, required_docs, status, agreement_request_active, agreement_source, agreement_custom_pdf_path, agreement_custom_pdf_filename, upload_request_active",
  "id, full_name, id_number, phone, fee_amount, fee_upfront, fee_success, has_signed, signature_url, signed_at, last_reminder_at, required_docs, status",
];

export async function fetchClientRowForPortal(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  let lastMessage: string | null = null;

  for (const selectList of PORTAL_CLIENT_SELECTS) {
    const res = await supabase
      .from("clients")
      .select(selectList)
      .eq("id", clientId)
      .maybeSingle();

    if (!res.error) {
      return { data: (res.data ?? null) as Record<string, unknown> | null, error: null };
    }

    const msg = res.error.message ?? "";
    lastMessage = msg || null;
    if (!msg || !looksLikeUnknownColumnError(msg)) {
      return { data: null, error: msg || "request failed" };
    }
  }

  return { data: null, error: lastMessage };
}
