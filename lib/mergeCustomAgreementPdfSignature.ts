"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { SignatureAnchorNorm } from "@/lib/signatureAnchor";

/**
 * Merges client signature PNG into an agreement PDF.
 * - If `signatureAnchor` is set: draws on that page inside the normalized rect (fit, centered).
 * - Otherwise: appends a legacy appendix page (existing behavior).
 */
export async function mergeCustomAgreementPdfWithSignature(
  agreementPdfArrayBuffer: ArrayBuffer,
  signaturePngDataUrl: string,
  opts: {
    idNumber: string;
    signedAt: Date;
    signatureAnchor?: SignatureAnchorNorm | null;
  }
): Promise<Blob> {
  const doc = await PDFDocument.load(agreementPdfArrayBuffer);
  const sigRes = await fetch(signaturePngDataUrl);
  const sigBuf = await sigRes.arrayBuffer();
  const png = await doc.embedPng(new Uint8Array(sigBuf));

  const anchor = opts.signatureAnchor ?? null;
  const useInPlace =
    anchor &&
    anchor.rect.w > 0 &&
    anchor.rect.h > 0 &&
    doc.getPageCount() > 0;

  if (useInPlace) {
    const pageIdx = Math.max(
      0,
      Math.min(anchor!.pageIndex, doc.getPageCount() - 1)
    );
    const page = doc.getPage(pageIdx);
    const { width: pw, height: ph } = page.getSize();
    const { x: nx, y: ny, w: nw, h: nh } = anchor!.rect;
    const boxW = nw * pw;
    const boxH = nh * ph;
    const boxX = nx * pw;
    const boxBottomY = (1 - ny - nh) * ph;

    const imgAspect = png.width / png.height;
    const boxAspect = boxW / Math.max(boxH, 0.0001);
    let drawW: number;
    let drawH: number;
    if (imgAspect > boxAspect) {
      drawW = boxW;
      drawH = boxW / imgAspect;
    } else {
      drawH = boxH;
      drawW = boxH * imgAspect;
    }
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxBottomY + (boxH - drawH) / 2;

    page.drawImage(png, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    });
  } else {
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
  }

  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
