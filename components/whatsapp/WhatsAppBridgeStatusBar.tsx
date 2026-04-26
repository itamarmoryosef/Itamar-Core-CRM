"use client";

import * as React from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useAdminSession } from "@/lib/adminSessionContext";

type HealthJson = {
  configured: boolean;
  reachable: boolean;
  error?: string;
  message?: string;
  status?: number;
  path?: string;
  bodyPreview?: string;
};

export function WhatsAppBridgeStatusBar() {
  const session = useAdminSession();
  const [state, setState] = React.useState<
    "loading" | { ok: true; json: HealthJson } | { ok: false; message: string }
  >("loading");

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/whatsapp-bridge/health", {
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as HealthJson;
        if (cancelled) return;
        if (res.status === 401) {
          setState({ ok: false, message: "נדרשת התחברות" });
          return;
        }
        if (!res.ok) {
          setState({
            ok: true,
            json: {
              configured: false,
              reachable: false,
              error: "whatservice_not_configured",
              message: "health_request_failed",
            },
          });
          return;
        }
        setState({ ok: true, json });
      } catch (e) {
        if (cancelled) return;
        setState({
          ok: false,
          message: e instanceof Error ? e.message : "בדיקת ה-Bridge נכשלה",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (session?.activeOrganization?.whatsapp_enabled !== true) {
    return null;
  }

  if (state === "loading") {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
        בודק חיבור לשירות ה-WhatsApp (Bridge)…
      </div>
    );
  }
  if (!state.ok) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        role="status"
      >
        <XCircle className="h-4 w-4 shrink-0" aria-hidden />
        {state.message}
      </div>
    );
  }

  const { json } = state;
  const notConfigured = json.configured === false;
  const down = json.configured === true && !json.reachable;
  const up = json.configured === true && json.reachable;

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        notConfigured
          ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          : down
            ? "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        {notConfigured ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ) : down ? (
          <XCircle className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="font-medium">
          {notConfigured
            ? "הגדרות ה-Bridge חסרות (503)"
            : down
              ? "ה-Bridge אינו נגיש מהשרת"
              : "ה-Bridge מגיב (מקוון)"}
        </span>
      </div>
      {notConfigured ? (
        <p className="mt-1 text-xs opacity-90">
          הוסיפו <code className="rounded bg-black/5 px-1 font-mono dark:bg-white/10">WHATSAPP_SERVICE_URL</code>{" "}
          ו-
          <code className="rounded bg-black/5 px-1 font-mono dark:bg-white/10">WHATSAPP_SERVICE_TOKEN</code>{" "}
          (משתנים בשרת Next / Vercel, לא בדפדפן) והפעילו מחדש.
        </p>
      ) : up && json.status != null ? (
        <p className="mt-1 text-xs opacity-90">
          HTTP {json.status}
          {json.path != null && json.path !== "" ? ` · ${json.path}` : ""}
        </p>
      ) : down ? (
        <p className="mt-1 text-xs opacity-90">{json.message ?? json.error ?? "השרת אינו מגיע ל-Bridge (רשת / DNS / חומת אש)."}</p>
      ) : null}
    </div>
  );
}
