import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmLayoutSlotRow } from "@/lib/crmClientCardLayout";
import {
  fetchCrmLayoutSlotsResilient,
  type CrmLayoutSlotsSchemaLevel,
} from "@/lib/fetchCrmLayoutSlots";
import { getLayoutSectionsTableName } from "@/lib/layoutSectionsTable";

export type AdminCatalogDocumentType = {
  id: string;
  name: string;
  download_link: string | null;
};

export type AdminCatalogAgreementTemplate = {
  id: string;
  name: string;
  original_filename: string | null;
  storage_path: string | null;
};

export type AdminCatalogCustomFieldSection = {
  id: string;
  title: string;
  sort_order: number;
  /** מולטי-טנאנסי: ריק = legacy; חייב להתאים ל־`clients.organization_id` בכרטיס */
  organization_id?: string | null;
};

export type AdminCatalogCustomFieldDefinition = {
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
  organization_id?: string | null;
};

export type AdminClientGlobalCatalog = {
  documentTypes: AdminCatalogDocumentType[];
  agreementTemplates: AdminCatalogAgreementTemplate[];
  agreementFormTemplates: { id: string; title: string }[];
  signatureFormTemplates: { id: string; title: string }[];
  customFieldSections: AdminCatalogCustomFieldSection[];
  customFieldDefinitions: AdminCatalogCustomFieldDefinition[];
  crmLayoutSlots: CrmLayoutSlotRow[];
  layoutSlotsSchemaLevel: CrmLayoutSlotsSchemaLevel;
};

let cache: AdminClientGlobalCatalog | null = null;
let inflight: Promise<AdminClientGlobalCatalog> | null = null;

export function getAdminClientGlobalCatalogSnapshot(): AdminClientGlobalCatalog | null {
  return cache;
}

/** For layout designer saves — optional call to pick up new slots/defs without full reload. */
export function invalidateAdminClientGlobalCatalog(): void {
  cache = null;
  inflight = null;
}

/** Platform super מקבל מ-PostgREST את כל השורות; בכרטיס לקוח רק org של הלקוח. */
function rowOrgId(row: { organization_id?: string | null }): string | null {
  const o = row.organization_id;
  if (o == null) return null;
  const t = String(o).trim();
  return t ? t : null;
}

export function filterAdminCatalogByOrganizationId(
  catalog: AdminClientGlobalCatalog,
  clientOrgId: string | null | undefined
): AdminClientGlobalCatalog {
  const want = clientOrgId?.trim() || null;
  const keep = (r: { organization_id?: string | null }) => {
    const have = rowOrgId(r);
    if (!want) {
      return have == null;
    }
    if (have == null) {
      return true;
    }
    return have === want;
  };
  return {
    ...catalog,
    customFieldSections: catalog.customFieldSections.filter(keep),
    customFieldDefinitions: catalog.customFieldDefinitions.filter(keep),
  };
}

async function fetchCatalogOnce(
  supabase: SupabaseClient
): Promise<AdminClientGlobalCatalog> {
  const sectionsTable = await getLayoutSectionsTableName(supabase);

  const [
    dtRes,
    tplRes,
    atRes,
    sigRes,
    secRes,
    cfRes,
    slotsBundle,
  ] = await Promise.all([
    supabase
      .from("document_types")
      .select("id, name, download_link")
      .order("created_at", { ascending: true }),
    supabase
      .from("templates")
      .select("id, name, original_filename, storage_path")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("agreement_templates")
      .select("id, title")
      .order("created_at", { ascending: false }),
    supabase
      .from("signature_templates")
      .select("id, title")
      .order("created_at", { ascending: false }),
    supabase
      .from(sectionsTable)
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("custom_field_definitions")
      .select(
        "id, label, slug, field_type, section_id, row_number, column_span, options, formula, sort_order, organization_id"
      )
      .order("row_number", { ascending: true })
      .order("sort_order", { ascending: true }),
    fetchCrmLayoutSlotsResilient(supabase),
  ]);

  if (tplRes.error) {
    console.warn("[admin catalog] templates load:", tplRes.error.message);
  }
  if (atRes.error) {
    console.warn(
      "[admin catalog] agreement_templates load:",
      atRes.error.message
    );
  }
  if (sigRes.error) {
    console.warn(
      "[admin catalog] signature_templates load:",
      sigRes.error.message
    );
  }
  if (secRes.error) {
    console.warn(
      "[admin catalog] custom_field_sections load:",
      secRes.error.message
    );
  }
  if (cfRes.error) {
    console.warn(
      "[admin catalog] custom_field_definitions load:",
      cfRes.error.message
    );
  }
  if (slotsBundle.error) {
    console.warn("[admin catalog] crm_layout_slots:", slotsBundle.error);
  }

  return {
    documentTypes: (dtRes.data ?? []) as AdminCatalogDocumentType[],
    agreementTemplates: (tplRes.data ?? []) as AdminCatalogAgreementTemplate[],
    agreementFormTemplates: (atRes.data ?? []) as {
      id: string;
      title: string;
    }[],
    signatureFormTemplates: (sigRes.data ?? []) as {
      id: string;
      title: string;
    }[],
    customFieldSections: (secRes.data ?? []) as AdminCatalogCustomFieldSection[],
    customFieldDefinitions: (cfRes.data ??
      []) as AdminCatalogCustomFieldDefinition[],
    crmLayoutSlots: slotsBundle.error ? [] : slotsBundle.rows,
    layoutSlotsSchemaLevel: slotsBundle.schemaLevel,
  };
}

/**
 * Admin CRM layout + template lists shared by all client cards.
 * Fetched once per browser session; concurrent callers share one in-flight promise.
 */
export function ensureAdminClientGlobalCatalog(
  supabase: SupabaseClient
): Promise<AdminClientGlobalCatalog> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetchCatalogOnce(supabase)
    .then((data) => {
      cache = data;
      inflight = null;
      return data;
    })
    .catch((e) => {
      inflight = null;
      throw e;
    });
  return inflight;
}
