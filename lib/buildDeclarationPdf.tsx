"use client";

import { pdf, Font } from "@react-pdf/renderer";
import { AgreementPreviewPdfDocument } from "@/components/pdf/AgreementPreviewPdfDocument";
import { SignedDeclarationPdfDocument } from "@/components/pdf/SignedDeclarationPdfDocument";
import { agreementHtmlToParagraphs } from "@/lib/agreementHtmlToParagraphs";
import { PUBLIC_PRODUCTION_ORIGIN } from "@/lib/appUrls";
import { publicBusinessName, publicBusinessTagline } from "@/lib/brandingPublic";

let fontsReady: Promise<void> | null = null;

function fontSrcUrl(): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "").trim() ||
          (process.env.NODE_ENV === "production"
            ? PUBLIC_PRODUCTION_ORIGIN.replace(/\/$/, "")
            : ""));
  if (!origin) {
    throw new Error(
      "לא ניתן לטעון גופן PDF: חסר מקור (פתחו את האפליקציה בדפדפן או הגדירו NEXT_PUBLIC_SITE_URL)."
    );
  }
  return `${origin}/fonts/Heebo-Variable.ttf`;
}

/**
 * רישום גופן Heebo (קובץ משתנים מ־Google Fonts, OFL) מ־`/public/fonts`.
 * נקרא פעם אחת לפני יצירת PDF.
 */
export function ensureDeclarationPdfFonts(): Promise<void> {
  if (fontsReady) return fontsReady;

  fontsReady = (async () => {
    const src = fontSrcUrl();
    Font.registerHyphenationCallback((word) => [word]);
    Font.register({
      family: "Heebo",
      fonts: [
        { src, fontWeight: 400 },
        { src, fontWeight: 700 },
      ],
    });
  })();

  return fontsReady;
}

/**
 * יוצר PDF אמיתי (טקסט ניתן לסימון) באמצעות `@react-pdf/renderer`.
 * מותאם לדפדפן בלבד.
 */
export async function buildSignedDeclarationPdf(opts: {
  agreementHtml: string;
  signatureDataUrl: string;
  signedAt?: Date;
  /** From `clients.agreement_notes` — office notes shown before signature in PDF */
  agreementNotes?: string | null;
  brandName?: string;
  brandTagline?: string;
}): Promise<Blob | null> {
  const html = opts.agreementHtml?.trim() ?? "";
  const sig = opts.signatureDataUrl?.trim() ?? "";
  if (!html || !sig) {
    console.warn(
      "[buildSignedDeclarationPdf] skipped: missing agreementHtml or signature image"
    );
    return null;
  }

  await ensureDeclarationPdfFonts();

  const paragraphs = agreementHtmlToParagraphs(html);
  const signedAt = opts.signedAt ?? new Date();

  const doc = (
    <SignedDeclarationPdfDocument
      paragraphs={paragraphs}
      signatureDataUrl={sig}
      signedAt={signedAt}
      agreementNotes={opts.agreementNotes}
      brandName={opts.brandName ?? publicBusinessName()}
      brandTagline={opts.brandTagline ?? publicBusinessTagline()}
    />
  );

  return pdf(doc).toBlob();
}

/** PDF לתצוגה בפורטל לפני חתימה — תוכן זהה לחתימה (ממילוי Word + mammoth), בלי תמונת חתימה. */
export async function buildAgreementPreviewPdf(opts: {
  fullName: string;
  idNumber: string;
  agreementHtml: string;
  agreementNotes?: string | null;
  brandName?: string;
  brandTagline?: string;
}): Promise<Blob> {
  await ensureDeclarationPdfFonts();

  const paragraphs = agreementHtmlToParagraphs(opts.agreementHtml);
  const doc = (
    <AgreementPreviewPdfDocument
      fullName={opts.fullName}
      idNumber={opts.idNumber}
      paragraphs={paragraphs}
      agreementNotes={opts.agreementNotes}
      brandName={opts.brandName ?? publicBusinessName()}
      brandTagline={opts.brandTagline ?? publicBusinessTagline()}
    />
  );

  return pdf(doc).toBlob();
}
