import Docxtemplater from "docxtemplater";
import mammoth from "mammoth";
import PizZip from "pizzip";
import {
  customPlaceholdersForDocx,
  displayClientNameFromRow,
} from "@/lib/customFieldsTemplate";

export type AgreementTemplateData = {
  full_name: string;
  id_number: string;
  fee_upfront: string;
  fee_success: string;
  /** `{date}` / `{{date}}` in Word — default: Hebrew locale today */
  date?: string;
  /** Core client fields for Word placeholders */
  phone?: string;
  agreement_notes?: string;
  /** Formatted currency line, e.g. total deal */
  total_amount?: string;
  payment_status?: string;
  /** Keys like `custom_address` from `clients.custom_fields_data` */
  customPlaceholders?: Record<string, string>;
};

const DOCX_XML_PATH =
  /^word\/(document\.xml|footer\d+\.xml|header\d+\.xml|endnotes\.xml|footnotes\.xml)$/i;

const MAMMOTH_HTML_UUID_PREFIX =
  /^\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function assertMammothHtmlIsRealDocument(html: string): void {
  const t = html.trim();
  if (!t) {
    console.error("[populateAgreementDocx] mammoth returned empty HTML");
    throw new Error("DOCX_EMPTY_HTML");
  }
  if (MAMMOTH_HTML_UUID_PREFIX.test(t)) {
    console.error(
      "[populateAgreementDocx] mammoth output starts like a UUID (fetch/pipeline likely failed), not document HTML:",
      t.slice(0, 80)
    );
    throw new Error("DOCX_HTML_UUID_LIKE");
  }
}

/**
 * Word often splits one visible tag into many XML runs.
 * Merge adjacent text runs so template delimiters become contiguous.
 */
function mergeAdjacentWtInSameRun(xml: string): string {
  let out = xml;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/<\/w:t>\s*<w:t[^>]*>/gi, "");
  }
  return out;
}

function mergeAcrossWrRuns(xml: string): string {
  const mergeRe =
    /<\/w:t>\s*<\/w:r>\s*(?:<w:proofErr[^>]*\/>\s*)?<w:r[^>]*>(?:\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t[^>]*>/gi;
  let out = xml;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(mergeRe, "");
  }
  return out;
}

function normalizeBrokenBraces(xml: string): string {
  let out = xml;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out
      .replace(/\{\{\{+/g, "{{")
      .replace(/\}\}\}+/g, "}}")
      .replace(/}}\s+\}/g, "}}");
  }
  return out;
}

function preprocessDocxXmlForTags(xml: string): string {
  let out = mergeAdjacentWtInSameRun(xml);
  out = mergeAcrossWrRuns(out);
  out = normalizeBrokenBraces(out);
  return out;
}

function normalizePossiblySplitDoubleBraceToken(xml: string, token: string): string {
  const sep = String.raw`(?:\s|<[^>]+>)*`;
  const escapedChars = token
    .split("")
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(sep);
  const pattern = new RegExp(
    String.raw`\{\{` + sep + escapedChars + sep + String.raw`\}\}`,
    "gi"
  );
  return xml.replace(pattern, `{${token}}`);
}

function normalizePossiblySplitBraceTokenToSquare(
  xml: string,
  token: string
): string {
  const sep = String.raw`(?:\s|<[^>]+>)*`;
  const escapedChars = token
    .split("")
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(sep);
  const pattern = new RegExp(
    String.raw`(?:\{` +
      sep +
      String.raw`){1,2}` +
      sep +
      escapedChars +
      sep +
      String.raw`(?:\}` +
      sep +
      String.raw`){1,2}`,
    "gi"
  );
  return xml.replace(pattern, `[[${token}]]`);
}

/**
 * Converts `{{full_name}}`-style placeholders in Word XML to `{full_name}` for Docxtemplater.
 * (Word may split runs; unsplit occurrences are handled.)
 */
export function normalizeDoubleBracePlaceholdersInDocxZip(zip: PizZip): void {
  const replacements: [RegExp, string][] = [
    [/\{\{\s*full_name\s*\}\}/gi, "[[full_name]]"],
    [/\{\{\s*id_number\s*\}\}/gi, "[[id_number]]"],
    [/\{\{\s*fee_upfront\s*\}\}/gi, "[[fee_upfront]]"],
    [/\{\{\s*fee_success\s*\}\}/gi, "[[fee_success]]"],
    [/\{\{\s*date\s*\}\}/gi, "[[date]]"],
    [/\{\s*full_name\s*\}/gi, "[[full_name]]"],
    [/\{\s*id_number\s*\}/gi, "[[id_number]]"],
    [/\{\s*fee_upfront\s*\}/gi, "[[fee_upfront]]"],
    [/\{\s*fee_success\s*\}/gi, "[[fee_success]]"],
    [/\{\s*date\s*\}/gi, "[[date]]"],
  ];
  for (const path of Object.keys(zip.files)) {
    if (!DOCX_XML_PATH.test(path) || zip.files[path].dir) continue;
    const f = zip.file(path);
    if (!f) continue;
    let xml = preprocessDocxXmlForTags(f.asText());
    xml = normalizePossiblySplitDoubleBraceToken(xml, "full_name");
    xml = normalizePossiblySplitDoubleBraceToken(xml, "id_number");
    xml = normalizePossiblySplitDoubleBraceToken(xml, "fee_upfront");
    xml = normalizePossiblySplitDoubleBraceToken(xml, "fee_success");
    xml = normalizePossiblySplitDoubleBraceToken(xml, "date");
    xml = normalizePossiblySplitBraceTokenToSquare(xml, "full_name");
    xml = normalizePossiblySplitBraceTokenToSquare(xml, "id_number");
    xml = normalizePossiblySplitBraceTokenToSquare(xml, "fee_upfront");
    xml = normalizePossiblySplitBraceTokenToSquare(xml, "fee_success");
    xml = normalizePossiblySplitBraceTokenToSquare(xml, "date");
    for (const [re, to] of replacements) {
      xml = xml.replace(re, to);
    }
    xml = xml.replace(
      /\{\{\s*(custom_[a-zA-Z0-9_]+)\s*\}\}/g,
      "[[$1]]"
    );
    xml = xml.replace(
      /\{\s*(custom_[a-zA-Z0-9_]+)\s*\}/g,
      "[[$1]]"
    );
    zip.file(path, xml);
  }
}

/**
 * Fills a .docx template (placeholders: {full_name} or {{full_name}}, same for other fields)
 * and converts the result to HTML via mammoth. Intended for browser use only.
 */
export async function populateDocxTemplateToHtml(
  templateArrayBuffer: ArrayBuffer,
  data: AgreementTemplateData
): Promise<{ html: string }> {
  const zip = new PizZip(templateArrayBuffer);
  normalizeDoubleBracePlaceholdersInDocxZip(zip);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "[[", end: "]]" },
    nullGetter: () => "",
  });

  const baseData: Record<string, string> = {
    full_name: String(data.full_name ?? ""),
    id_number: String(data.id_number ?? ""),
    fee_upfront: String(data.fee_upfront ?? ""),
    fee_success: String(data.fee_success ?? ""),
    date: String(data.date ?? new Date().toLocaleDateString("he-IL")),
    phone: String(data.phone ?? ""),
    agreement_notes: String(data.agreement_notes ?? ""),
    total_amount: String(data.total_amount ?? ""),
    payment_status: String(data.payment_status ?? ""),
  };
  const custom = data.customPlaceholders ?? {};
  for (const [k, v] of Object.entries(custom)) {
    baseData[k] = v == null ? "" : String(v);
  }

  try {
    doc.render(baseData);
  } catch (error) {
    console.error(
      "[populateAgreementDocx] doc.render failed",
      error instanceof Error ? error.message : error,
      error
    );
    throw error;
  }

  const generated = doc.getZip().generate({
    type: "arraybuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  let result: { value: string };
  try {
    result = await mammoth.convertToHtml({ arrayBuffer: generated });
  } catch (err) {
    console.error(
      "[populateAgreementDocx] mammoth.convertToHtml failed",
      err instanceof Error ? err.message : err,
      err
    );
    throw err;
  }
  assertMammothHtmlIsRealDocument(result.value);
  return { html: result.value };
}

/** Client row fields consumed when merging a Word agreement template. */
export type AgreementClientSnapshotForDocx = {
  full_name: string;
  id_number: string;
  phone?: string | null;
  fee_upfront?: string | number | null;
  fee_success?: string | number | null;
  fee_amount?: number | null;
  total_amount?: number | null;
  payment_status?: string | null;
  agreement_notes?: string | null;
  custom_fields_data?: unknown;
};

function feeLineDocx(
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

function totalAmountLineDocx(
  total: number | null | undefined,
  legacyFee: number | null | undefined
): string {
  if (total != null && !Number.isNaN(Number(total))) {
    return `${Number(total).toLocaleString("he-IL")} ₪`;
  }
  return feeLineDocx(null, legacyFee);
}

/**
 * Single place for portal/admin Word merge: core CRM fields plus every custom
 * field slug (empty string when unset).
 */
export function buildAgreementTemplateData(
  client: AgreementClientSnapshotForDocx,
  customFieldDefinitionSlugs: readonly string[],
  customFieldTypeBySlug?: Readonly<Record<string, string>> | null
): AgreementTemplateData {
  const displayName = displayClientNameFromRow({
    full_name: client.full_name,
    custom_fields_data: client.custom_fields_data,
  });
  const full_name =
    displayName === "ללא שם" ? "" : displayName;
  return {
    full_name,
    id_number: client.id_number ?? "",
    fee_upfront: feeLineDocx(client.fee_upfront, client.fee_amount ?? null),
    fee_success: feeLineDocx(client.fee_success, null),
    date: new Date().toLocaleDateString("he-IL"),
    phone: client.phone?.trim() ?? "",
    agreement_notes: client.agreement_notes?.trim() ?? "",
    total_amount: totalAmountLineDocx(
      client.total_amount ?? null,
      client.fee_amount ?? null
    ),
    payment_status: client.payment_status?.trim() ?? "",
    customPlaceholders: customPlaceholdersForDocx(
      client.custom_fields_data,
      customFieldDefinitionSlugs,
      customFieldTypeBySlug ?? null
    ),
  };
}
