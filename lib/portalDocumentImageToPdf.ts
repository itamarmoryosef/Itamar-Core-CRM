"use client";

import {
  PDFDocument,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from "pdf-lib";

/** ISO A4 portrait in PDF points (72 dpi). */
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

/**
 * Client-uploaded checklist files: treat common raster types as images to wrap in PDF.
 * PDFs pass through unchanged (caller should not call conversion).
 */
export function isRasterImageFileForPortalUpload(file: File): boolean {
  const t = (file.type ?? "").toLowerCase();
  if (t.startsWith("image/") && t !== "image/svg+xml") return true;
  const n = file.name.toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(n);
}

async function rasterFileToPngBytes(file: File): Promise<Uint8Array> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(
      "לא ניתן לקרוא את תמונת המסמך. נסו PNG או JPEG, או העלו PDF."
    );
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas לא זמין");
    }
    ctx.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) {
      throw new Error("המרת תמונה ל-PDF נכשלה");
    }
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bmp.close();
  }
}

/**
 * One A4 portrait page: image only, zero margins. Uniform scale (object-fit: cover)
 * so the page is fully covered with no letterboxing; aspect ratio preserved (no stretch).
 */
export async function convertPortalDocumentImageToPdf(file: File): Promise<Blob> {
  if (!isRasterImageFileForPortalUpload(file)) {
    throw new Error("convertPortalDocumentImageToPdf: not a raster image file");
  }

  const pngBytes = await rasterFileToPngBytes(file);
  const pdfDoc = await PDFDocument.create();
  const png = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);

  const iw = png.width;
  const ih = png.height;
  const scale = Math.max(A4_WIDTH_PT / iw, A4_HEIGHT_PT / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const drawX = (A4_WIDTH_PT - drawW) / 2;
  const drawY = (A4_HEIGHT_PT - drawH) / 2;

  page.pushOperators(
    pushGraphicsState(),
    rectangle(0, 0, A4_WIDTH_PT, A4_HEIGHT_PT),
    clip(),
    endPath()
  );

  page.drawImage(png, {
    x: drawX,
    y: drawY,
    width: drawW,
    height: drawH,
  });

  page.pushOperators(popGraphicsState());

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
