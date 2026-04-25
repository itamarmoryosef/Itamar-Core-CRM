"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";

type SignaturePadProps = {
  onSave: (dataUrl: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
};

export function SignaturePad({
  onSave,
  onCancel,
  disabled = false,
}: SignaturePadProps) {
  const router = useRouter();
  const padRef = useRef<SignatureCanvas>(null);
  const [hint, setHint] = useState<string | null>(null);

  const clear = () => {
    padRef.current?.clear();
    setHint(null);
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.back();
  };

  const save = () => {
    if (disabled) return;
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setHint("חובה לחתום באזור החתימה לפני השמירה.");
      return;
    }
    setHint(null);
    const dataUrl = pad.toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div
        className="relative w-full overflow-hidden rounded-xl border-2 border-neutral-300 bg-white shadow-sm dark:border-neutral-600 dark:bg-neutral-900"
        style={{ touchAction: "none" }}
      >
        <SignatureCanvas
          ref={padRef}
          clearOnResize={false}
          penColor="#111827"
          canvasProps={{
            className:
              "block h-44 w-full max-w-full touch-none sm:h-52 md:h-56",
            style: { width: "100%", touchAction: "none" },
          }}
        />
      </div>

      {hint ? (
        <p className="text-start text-sm text-amber-700 dark:text-amber-400">
          {hint}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3">
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="h-9 min-h-9 min-w-[5.5rem] rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
        >
          נקה
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={disabled}
          className="h-9 min-h-9 min-w-[5.5rem] rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="h-9 min-h-9 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          אישור ושליחה
        </button>
      </div>
    </div>
  );
}
