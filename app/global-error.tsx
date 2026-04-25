"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-white font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-lg font-semibold">משהו השתבש</h1>
          <p className="max-w-md text-sm text-neutral-600">
            {error?.message
              ? String(error.message)
              : "אירעה שגיאה קריטית. נסה לרענן את הדף."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
