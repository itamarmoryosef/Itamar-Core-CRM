"use client";

import { pdf } from "@react-pdf/renderer";
import { TemplateSignedDeclarationPdfDocument } from "@/components/pdf/TemplateSignedDeclarationPdfDocument";
import type { PdfStructuredRow } from "@/lib/agreementFormTemplateLayout";
import { agreementHtmlToParagraphs } from "@/lib/agreementHtmlToParagraphs";
import { ensureDeclarationPdfFonts } from "@/lib/buildDeclarationPdf";
import { publicBusinessName, publicBusinessTagline } from "@/lib/brandingPublic";

/**
 * PDF חתום עם בלוק "פרטים מהטופס" (תבנית signature_templates בלבד).
 * נפרד מ־{@link buildSignedDeclarationPdf} כדי לא לשנות התנהגות חתימות legacy.
 */
export async function buildTemplateSignedDeclarationPdf(opts: {
  agreementHtml: string;
  signatureDataUrl: string;
  signedAt?: Date;
  agreementNotes?: string | null;
  structuredRows: PdfStructuredRow[];
  brandName?: string;
  brandTagline?: string;
}): Promise<Blob | null> {
  const html = opts.agreementHtml?.trim() ?? "";
  const sig = opts.signatureDataUrl?.trim() ?? "";
  if (!html || !sig) {
    console.warn(
      "[buildTemplateSignedDeclarationPdf] skipped: missing agreementHtml or signature image"
    );
    return null;
  }

  await ensureDeclarationPdfFonts();

  const paragraphs = agreementHtmlToParagraphs(html);
  const signedAt = opts.signedAt ?? new Date();

  const doc = (
    <TemplateSignedDeclarationPdfDocument
      paragraphs={paragraphs}
      signatureDataUrl={sig}
      signedAt={signedAt}
      agreementNotes={opts.agreementNotes}
      structuredRows={opts.structuredRows}
      brandName={opts.brandName ?? publicBusinessName()}
      brandTagline={opts.brandTagline ?? publicBusinessTagline()}
    />
  );

  return pdf(doc).toBlob();
}
