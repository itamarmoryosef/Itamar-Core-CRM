"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Appends a page to the agreement PDF with the client's signature image and metadata.
 * Labels use ASCII-only fonts (Helvetica has no Hebrew).
 */
export async function mergeCustomAgreementPdfWithSignature(
  agreementPdfArrayBuffer: ArrayBuffer,
  signaturePngDataUrl: string,
  opts: { idNumber: string; signedAt: Date }
): Promise<Blob> {
  const doc = await PDFDocument.load(agreementPdfArrayBuffer);
  const sigRes = await fetch(signaturePngDataUrl);
  const sigBuf = await sigRes.arrayBuffer();
  const png = await doc.embedPng(new Uint8Array(sigBuf));

  const first = doc.getPage(0);
  const { width, height } = first.getSize();
  const page = doc.addPage([width, height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const margin = 48;
  let y = height - margin;

  page.drawText("Electronic signature / appendix", {
    x: margin,
    y,
    size: 12,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 22;
  page.drawText(`ID: ${opts.idNumber}`, {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });
  y -= 16;
  page.drawText(`Signed at (UTC): ${opts.signedAt.toISOString()}`, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  const maxW = Math.min(width - 2 * margin, 260);
  const scale = maxW / png.width;
  const imgH = png.height * scale;
  const imgX = width - margin - maxW;
  const imgY = margin;

  page.drawImage(png, {
    x: imgX,
    y: imgY,
    width: maxW,
    height: imgH,
  });

  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
