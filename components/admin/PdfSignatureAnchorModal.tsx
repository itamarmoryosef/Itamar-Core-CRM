"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { downloadDocumentsUploadBlob } from "@/lib/documentsUploadStorage";
import {
  parseSignatureAnchor,
  type SignatureAnchorNorm,
} from "@/lib/signatureAnchor";

/** Minimal row shape — avoid importing DocRow from ClientDocumentManager (circular). */
type AnchorDocTarget = {
  id: string;
  storage_path: string | null;
  file_url: string | null;
};

type DragState =
  | null
  | { mode: "down"; sx: number; sy: number; cx: number; cy: number };

function clampRect(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number
): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, Math.min(sx, cx));
  const y = Math.max(0, Math.min(sy, cy));
  const w = Math.min(Math.abs(cx - sx), maxW - x);
  const h = Math.min(Math.abs(cy - sy), maxH - y);
  return { x, y, w, h };
}

function normFromPx(
  r: { x: number; y: number; w: number; h: number },
  cw: number,
  ch: number
): SignatureAnchorNorm["rect"] {
  return {
    x: r.x / cw,
    y: r.y / ch,
    w: r.w / cw,
    h: r.h / ch,
  };
}

function pxFromNorm(
  rect: SignatureAnchorNorm["rect"],
  cw: number,
  ch: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: rect.x * cw,
    y: rect.y * ch,
    w: rect.w * cw,
    h: rect.h * ch,
  };
}

export function PdfSignatureAnchorModal(props: {
  open: boolean;
  doc: AnchorDocTarget | null;
  clientId: string;
  initialAnchor: unknown;
  onClose: () => void;
  onSaved: () => void;
  setToast: (t: {
    type: "success" | "error";
    message: string;
  }) => void;
}) {
  const { open, doc, clientId, initialAnchor, onClose, onSaved, setToast } =
    props;

  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const dragRef = useRef<DragState>(null);

  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [commitPx, setCommitPx] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [, bump] = useState(0);
  const commitPxRef = useRef<typeof commitPx>(null);
  commitPxRef.current = commitPx;

  const redrawOverlay = useCallback(
    (
      canvasW: number,
      canvasH: number,
      dragArg: DragState,
      commit: typeof commitPx
    ) => {
      const c = overlayRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvasW, canvasH);
      const drawBox = (x: number, y: number, w: number, h: number) => {
        ctx.strokeStyle = "rgba(99, 102, 241, 0.95)";
        ctx.fillStyle = "rgba(99, 102, 241, 0.12)";
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      };
      if (commit && commit.w >= 4 && commit.h >= 4) {
        drawBox(commit.x, commit.y, commit.w, commit.h);
      }
      if (dragArg && dragArg.mode === "down") {
        const r = clampRect(
          dragArg.sx,
          dragArg.sy,
          dragArg.cx,
          dragArg.cy,
          canvasW,
          canvasH
        );
        if (r.w >= 4 && r.h >= 4) drawBox(r.x, r.y, r.w, r.h);
      }
    },
    []
  );

  const paintPage = useCallback(
    async (num: number, anchorForPage: SignatureAnchorNorm | null) => {
      const pdf = pdfDocRef.current;
      const pdfCanvas = pdfCanvasRef.current;
      const overlay = overlayRef.current;
      if (!pdf || !pdfCanvas || !overlay) return;
      setRendering(true);
      try {
        const page = await pdf.getPage(num);
        const scale = 1.35;
        const viewport = page.getViewport({ scale });
        const w = viewport.width;
        const h = viewport.height;
        pdfCanvas.width = w;
        pdfCanvas.height = h;
        overlay.width = w;
        overlay.height = h;
        const pctx = pdfCanvas.getContext("2d");
        if (!pctx) return;
        await page.render({ canvasContext: pctx, viewport }).promise;

        let nextCommit: typeof commitPx = null;
        if (
          anchorForPage &&
          anchorForPage.pageIndex === num - 1
        ) {
          nextCommit = pxFromNorm(anchorForPage.rect, w, h);
        }
        setCommitPx(nextCommit);
        redrawOverlay(w, h, null, nextCommit);
      } finally {
        setRendering(false);
      }
    },
    [redrawOverlay]
  );

  useEffect(() => {
    if (!open || !doc) return;
    let cancelled = false;
    setLoadErr(null);
    setBusy(true);
    setNumPages(0);
    setPageNum(1);
    setCommitPx(null);
    dragRef.current = null;
    pdfDocRef.current = null;

    void (async () => {
      try {
        const { data: blob, error } = await downloadDocumentsUploadBlob(
          supabase,
          doc.storage_path,
          doc.file_url
        );
        if (error || !blob) {
          throw new Error(error?.message ?? "הורדת PDF נכשלה");
        }
        const buf = await blob.arrayBuffer();
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        const np = pdf.numPages;
        setNumPages(np);
        const parsed = parseSignatureAnchor(initialAnchor);
        const startPage =
          parsed && parsed.pageIndex >= 0 && parsed.pageIndex < np
            ? parsed.pageIndex + 1
            : 1;
        setPageNum(startPage);
        setBusy(false);
      } catch (e) {
        if (cancelled) return;
        setBusy(false);
        setLoadErr(e instanceof Error ? e.message : "טעינת PDF נכשלה");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, doc?.id, doc?.storage_path, doc?.file_url, initialAnchor]);

  useEffect(() => {
    if (!open || busy || loadErr || !pdfDocRef.current || numPages < 1) return;
    const parsed = parseSignatureAnchor(initialAnchor);
    void paintPage(pageNum, parsed);
  }, [open, busy, loadErr, pageNum, numPages, initialAnchor, paintPage]);

  const onOverlayMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = overlayRef.current;
    if (!c || rendering) return;
    const r = c.getBoundingClientRect();
    const scaleX = c.width / Math.max(r.width, 1);
    const scaleY = c.height / Math.max(r.height, 1);
    const x = (e.clientX - r.left) * scaleX;
    const y = (e.clientY - r.top) * scaleY;
    dragRef.current = { mode: "down", sx: x, sy: y, cx: x, cy: y };
    bump((n) => n + 1);
    redrawOverlay(c.width, c.height, dragRef.current, commitPxRef.current);
  };

  const onOverlayMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = overlayRef.current;
    const d = dragRef.current;
    if (!c || !d || d.mode !== "down") return;
    const r = c.getBoundingClientRect();
    const scaleX = c.width / Math.max(r.width, 1);
    const scaleY = c.height / Math.max(r.height, 1);
    const x = (e.clientX - r.left) * scaleX;
    const y = (e.clientY - r.top) * scaleY;
    dragRef.current = { ...d, cx: x, cy: y };
    redrawOverlay(c.width, c.height, dragRef.current, commitPxRef.current);
    bump((n) => n + 1);
  };

  const finishDrag = () => {
    const c = overlayRef.current;
    const d = dragRef.current;
    dragRef.current = null;
    bump((n) => n + 1);
    if (!c || !d || d.mode !== "down") {
      if (c) redrawOverlay(c.width, c.height, null, commitPxRef.current);
      return;
    }
    const r = clampRect(d.sx, d.sy, d.cx, d.cy, c.width, c.height);
    if (r.w >= 8 && r.h >= 8) {
      setCommitPx(r);
      redrawOverlay(c.width, c.height, null, r);
    } else {
      redrawOverlay(c.width, c.height, null, commitPxRef.current);
    }
  };

  const handleSave = async () => {
    if (!doc) return;
    const c = overlayRef.current;
    if (!c || !commitPx || commitPx.w < 8 || commitPx.h < 8) {
      setToast({ type: "error", message: "גררו מלבן לאזור החתימה." });
      return;
    }
    const norm = normFromPx(commitPx, c.width, c.height);
    if (norm.w < 0.02 || norm.h < 0.02) {
      setToast({ type: "error", message: "אזור קטן מדי — נסו שוב." });
      return;
    }
    const payload: SignatureAnchorNorm = {
      pageIndex: pageNum - 1,
      rect: norm,
    };
    setSaving(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({ signature_anchor: payload })
        .eq("id", doc.id)
        .eq("client_id", clientId);
      if (error) throw error;
      setToast({ type: "success", message: "מיקום החתימה נשמר." });
      onSaved();
      onClose();
    } catch (e) {
      setToast({
        type: "error",
        message: e instanceof Error ? e.message : "שמירה נכשלה",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!doc) return;
    if (
      !window.confirm(
        "למחוק את מיקום החתימה? (החתימה בפורטל תשוב להדביק עמוד נספח כבעבר)"
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({ signature_anchor: null })
        .eq("id", doc.id)
        .eq("client_id", clientId);
      if (error) throw error;
      setCommitPx(null);
      setToast({ type: "success", message: "מיקום החתימה הוסר." });
      onSaved();
      onClose();
    } catch (e) {
      setToast({
        type: "error",
        message: e instanceof Error ? e.message : "פעולה נכשלה",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open || !doc) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sig-anchor-title"
        className="relative z-10 flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        dir="rtl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Crosshair className="h-5 w-5 text-indigo-600" aria-hidden />
            <h2
              id="sig-anchor-title"
              className="text-start text-base font-semibold text-slate-900 dark:text-slate-50"
            >
              מיקום חתימה על PDF
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-start text-sm text-slate-600 dark:text-slate-400">
            בחרו עמוד, ואז גררו מלבן על האזור שבו תופיע חתימת הלקוח. אם לא תוגדר
            תיבה — המערכת תמשיך כמו היום (עמוד נספח עם החתימה).
          </p>

          {busy ? (
            <div className="flex items-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              טוען PDF…
            </div>
          ) : loadErr ? (
            <p className="py-8 text-center text-sm text-red-600" role="alert">
              {loadErr}
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pageNum <= 1 || rendering}
                  onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600"
                >
                  עמוד קודם
                </button>
                <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                  עמוד {pageNum} / {numPages || "—"}
                </span>
                <button
                  type="button"
                  disabled={pageNum >= numPages || rendering || numPages < 1}
                  onClick={() =>
                    setPageNum((p) => Math.min(numPages || p, p + 1))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600"
                >
                  עמוד הבא
                </button>
                {rendering ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : null}
              </div>

              <div className="relative mt-3 inline-block max-w-full overflow-auto rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-950">
                <canvas ref={pdfCanvasRef} className="block max-h-[70dvh]" />
                <canvas
                  ref={overlayRef}
                  className="absolute left-0 top-0 block max-h-[70dvh] cursor-crosshair touch-none"
                  onMouseDown={onOverlayMouseDown}
                  onMouseMove={onOverlayMouseMove}
                  onMouseUp={finishDrag}
                  onMouseLeave={finishDrag}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={saving || busy || !!loadErr}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" />
            הסר מיקום
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || busy || !!loadErr}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {saving ? "שומר…" : "שמור מיקום"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
