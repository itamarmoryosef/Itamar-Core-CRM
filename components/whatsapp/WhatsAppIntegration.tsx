"use client";

import * as React from "react";
import Link from "next/link";
import {
  MessageCircle,
  QrCode,
  Loader2,
  RefreshCw,
  Smartphone,
  Plus,
  CheckCircle2,
  Trash2,
  BookTemplate,
} from "lucide-react";
import { WhatsAppBridgeStatusBar } from "@/components/whatsapp/WhatsAppBridgeStatusBar";
import { useAdminSession } from "@/lib/adminSessionContext";

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

type ConnectionStatus =
  | "connected"
  | "CONNECTED"
  | "waiting_for_scan"
  | "WAITING_FOR_SCAN"
  | "disconnected"
  | "DISCONNECTED"
  | "connecting"
  | "loading"
  | "error";

type Connection = { id: string; label: string; status: string };

const PHONE_PREFIX = "+972";

function buildWhatsAppUrl(path: string, connectionId: string, params?: Record<string, string>): string {
  const q = new URLSearchParams();
  q.set("tenant", connectionId);
  if (params) Object.entries(params).forEach(([k, v]) => q.set(k, v));
  return `${path}?${q.toString()}`;
}

function getWhatsAppHeaders(connectionId: string): HeadersInit {
  return { "Content-Type": "application/json", "X-Tenant-Id": connectionId };
}

const waTr: Record<string, string> = {
  "whatsapp.default_connection": "ברירת מחדל",
  "whatsapp.service_not_running": "שירות WhatsApp לא נגיש — בדקו ש־WHATSAPP_SERVICE_URL פעיל",
  "whatsapp.new_connection": "חיבור חדש",
  "whatsapp.delete_confirm":
    "האם להסיר את החיבור? החיבור יימחק מהמערכת בלבד (חשבון ה-WhatsApp לא ייפגע).",
  "whatsapp.connected": "מחובר",
  "whatsapp.waiting_for_connection": "מתחבר…",
  "whatsapp.waiting_scan": "ממתין לסריקה",
  "whatsapp.disconnected_label": "מנותק",
  "whatsapp.connection_title": "חיבור WhatsApp",
  "whatsapp.connection_desc": "סריקת QR או צימוד בטלפון (Pairing).",
  "whatsapp.disconnected_hint": "התחל מחדש",
  "whatsapp.disconnected_hint_desc": "רעננו QR או צמדו בטלפון.",
  "whatsapp.scan_qr": "סריקת QR",
  "whatsapp.reset_connection": "איפוס",
  "whatsapp.connections_list": "חיבורים",
  "whatsapp.cannot_delete_default": "לא ניתן למחוק",
  "whatsapp.delete_connection": "מחק חיבור",
  "whatsapp.remove": "הסר",
  "whatsapp.new_connection_name": "שם חיבור",
  "whatsapp.add_connection": "הוסף חיבור",
  "whatsapp.tab_qr_scan": "סריקה",
  "whatsapp.tab_phone_pairing": "Pairing",
  "whatsapp.retry": "נסו שוב",
  "whatsapp.pairing_code_title": "קוד צימוד (Pairing)",
  "whatsapp.pairing_code_phone_label": "מספר (972…)",
  "whatsapp.pairing_generating": "מייצר…",
  "whatsapp.pairing_get_code_button": "צור קוד",
  "whatsapp.pairing_code_enter_code": "הקשו ב-WhatsApp",
  "whatsapp.pairing_code_instructions": "ב-WhatsApp: מכשירים מקושרים → קוד צימוד",
  "whatsapp.message_templates": "הודעות",
  "whatsapp.message_templates_placeholder": "טקסטים מבוססי הקשר בלשונית לקוח ו-API",
};

export function WhatsAppIntegration() {
  const adminSession = useAdminSession();
  const t = React.useCallback(
    (key: string, fallback?: string) => waTr[key] ?? fallback ?? key,
    []
  );
  const isRtl = true;
  const [panelTab, setPanelTab] = React.useState<"qr" | "phone">("qr");
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<ConnectionStatus>("loading");
  const [qrImageUrl, setQrImageUrl] = React.useState<string | null>(null);
  const [qrError, setQrError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [showRetry, setShowRetry] = React.useState(false);
  const [newConnectionLabel, setNewConnectionLabel] = React.useState("");
  const [addingConnection, setAddingConnection] = React.useState(false);
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [pairingCode, setPairingCode] = React.useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = React.useState(false);
  const [pairingError, setPairingError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const activeId = selectedId ?? connections[0]?.id ?? "default";

  const fetchConnections = React.useCallback(async () => {
    setConnectionsLoading(true);
    try {
      const res = await fetch("/api/whatsapp/connections");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setConnections(list);
        if (!selectedId && list.length > 0 && !list.some((c: Connection) => c.id === selectedId)) {
          setSelectedId(list[0].id);
        }
        if (list.length === 0) {
          setConnections([{ id: "default", label: t("whatsapp.default_connection") || "ברירת מחדל", status: "disconnected" }]);
          setSelectedId("default");
        }
      }
    } catch {
      setConnections([{ id: "default", label: t("whatsapp.default_connection") || "ברירת מחדל", status: "disconnected" }]);
      setSelectedId("default");
    } finally {
      setConnectionsLoading(false);
    }
  }, [selectedId, t]);

  React.useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const fetchStatus = React.useCallback(async (connId: string) => {
    try {
      const url = buildWhatsAppUrl("/api/whatsapp/status", connId);
      const res = await fetch(url, { headers: getWhatsAppHeaders(connId) });
      const data = (await res.json().catch(() => ({}))) as { status?: string; connected?: boolean };
      const s = (data.status ?? (data.connected ? "CONNECTED" : "WAITING_FOR_SCAN")) as ConnectionStatus;
      setStatus(s);
      setConnections((prev) =>
        prev.map((c) => (c.id === connId ? { ...c, status: s === "CONNECTED" ? "connected" : s === "WAITING_FOR_SCAN" ? "waiting_for_scan" : "disconnected" } : c))
      );
      return s;
    } catch {
      setStatus("error");
      return "error";
    }
  }, []);

  const fetchQr = React.useCallback(
    async (connId: string, forceClear = false) => {
      setRefreshing(true);
      setQrError(null);
      setQrImageUrl(null);
      setShowRetry(false);
      const headers = getWhatsAppHeaders(connId);
      const doOne = async (withClear = false): Promise<{ qrImageUrl?: string | null; qr?: string | null; status?: string; error?: string; cooldownSeconds?: number; message?: string }> => {
        const u = buildWhatsAppUrl("/api/whatsapp/qr", connId, withClear ? { clear: "1" } : undefined);
        const res = await fetch(u, { headers });
        return (await res.json().catch(() => ({}))) as {
          qr?: string | null;
          qrImageUrl?: string | null;
          status?: string;
          error?: string;
          cooldownSeconds?: number;
          message?: string;
        };
      };
      try {
        let data = await doOne(forceClear);
        if (!data.error && data.status !== "CONNECTED" && !(data.qrImageUrl ?? data.qr)) {
          // QR not ready yet – poll (no clear) up to ~45s so we catch it when Baileys emits
          const pollIntervalMs = 2500;
          const pollDeadline = Date.now() + 45000;
          while (Date.now() < pollDeadline) {
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            data = await doOne(false);
            if (data.error || data.status === "CONNECTED" || data.qrImageUrl || data.qr) break;
          }
        }
        if (data.error) {
          setQrError(data.error ?? t("whatsapp.service_not_running"));
          if (data.cooldownSeconds != null) setShowRetry(true);
          return;
        }
        const img = data.qrImageUrl ?? data.qr;
        setQrImageUrl(img ?? null);
        if (img) setQrError(null);
        if (data.status === "CONNECTED") {
          setStatus("CONNECTED");
          fetchConnections();
        }
      } catch {
        setQrImageUrl(null);
        setQrError(t("whatsapp.service_not_running"));
      } finally {
        setRefreshing(false);
      }
    },
    [t, fetchConnections]
  );

  const handleAddConnection = React.useCallback(async () => {
    const label = newConnectionLabel.trim() || t("whatsapp.new_connection") || "חיבור חדש";
    setAddingConnection(true);
    try {
      const res = await fetch("/api/whatsapp/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed");
      const conn = data as { id: string; label: string; status: string };
      setConnections((prev) => [...prev, conn]);
      setSelectedId(conn.id);
      setNewConnectionLabel("");
      void fetchQr(conn.id, false);
    } catch {
      setQrError("Failed to add connection");
    } finally {
      setAddingConnection(false);
    }
  }, [newConnectionLabel, t, fetchQr]);

  const handleSelectConnection = React.useCallback(
    (id: string) => {
      setSelectedId(id);
      setQrImageUrl(null);
      setQrError(null);
      void fetchStatus(id);
    },
    [fetchStatus]
  );

  const handleDeleteConnection = React.useCallback(
    async (conn: Connection) => {
      if (conn.id === "default") return;
      const msg = t("whatsapp.delete_confirm") ?? "האם להסיר את החיבור? החיבור יימחק מהמערכת בלבד (חשבון ה-WhatsApp לא ייפגע).";
      if (!window.confirm(msg)) return;
      setDeletingId(conn.id);
      try {
        const res = await fetch(`/api/whatsapp/connections/${encodeURIComponent(conn.id)}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Failed to delete");
        }
        const wasSelected = selectedId === conn.id;
        await fetchConnections();
        if (wasSelected) {
          const rest = connections.filter((c) => c.id !== conn.id);
          setSelectedId(rest[0]?.id ?? null);
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Failed to delete connection");
      } finally {
        setDeletingId(null);
      }
    },
    [t, selectedId, connections, fetchConnections]
  );

  const handleGetPairingCode = React.useCallback(async () => {
    setPairingError(null);
    setPairingCode(null);
    setPairingLoading(true);
    try {
      const digits = phoneNumber.replace(/\D/g, "");
      const fullNumber = digits.startsWith("972") ? digits : digits.startsWith("0") ? "972" + digits.slice(1) : "972" + digits;
      const res = await fetch(buildWhatsAppUrl("/api/whatsapp/pairing-code", activeId), {
        method: "POST",
        headers: getWhatsAppHeaders(activeId),
        body: JSON.stringify({ phoneNumber: fullNumber }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string | null; error?: string };
      if (!res.ok && (res.status === 502 || res.status === 503)) {
        setPairingError("Bridge temporarily unavailable.");
        return;
      }
      if (data.error) {
        setPairingError(data.error);
        return;
      }
      if (data.code) setPairingCode(data.code);
    } catch {
      setPairingError(t("whatsapp.service_not_running"));
    } finally {
      setPairingLoading(false);
    }
  }, [phoneNumber, t, activeId]);

  const handleRetry = React.useCallback(() => {
    setStatus("loading");
    setQrImageUrl(null);
    setQrError(null);
    setPairingError(null);
    setPairingCode(null);
    setShowRetry(false);
    void fetchStatus(activeId);
    void fetchQr(activeId, true);
  }, [activeId, fetchStatus, fetchQr]);

  React.useEffect(() => {
    if (!activeId) return;
    fetchStatus(activeId);
  }, [activeId, fetchStatus]);

  // Only auto-fetch QR when clearly disconnected (not when waiting for scan), with longer delay to avoid load
  React.useEffect(() => {
    const disconnected = status === "disconnected" || status === "DISCONNECTED" || status === "error";
    if (!disconnected || qrImageUrl || refreshing || !activeId) return;
    const timer = setTimeout(() => void fetchQr(activeId, false), 2000);
    return () => clearTimeout(timer);
  }, [status, qrImageUrl, refreshing, activeId, fetchQr]);

  const statusPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  React.useEffect(() => {
    if (!pairingCode || status === "CONNECTED" || status === "connected" || status === "error") {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
      return;
    }
    statusPollRef.current = setInterval(() => void fetchStatus(activeId), 5000);
    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, [pairingCode, status, activeId, fetchStatus]);

  const isConnected = status === "CONNECTED" || status === "connected";
  const showWaiting = status === "loading" || (refreshing && !qrImageUrl);

  const statusLabel = {
    CONNECTED: t("whatsapp.connected"),
    connected: t("whatsapp.connected"),
    loading: t("whatsapp.waiting_for_connection"),
    connecting: t("whatsapp.waiting_for_connection"),
    WAITING_FOR_SCAN: t("whatsapp.waiting_scan"),
    waiting_for_scan: t("whatsapp.waiting_scan"),
    disconnected: t("whatsapp.disconnected_label"),
    DISCONNECTED: t("whatsapp.disconnected_label"),
    error: t("whatsapp.disconnected_label"),
  }[status] ?? t("whatsapp.disconnected_label");

  const showWhatsappDisabledHint =
    adminSession?.activeOrganization != null &&
    adminSession.activeOrganization.whatsapp_enabled !== true;

  return (
    <div className="space-y-4" dir="rtl">
      {showWhatsappDisabledHint ? (
        <div
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-start text-xs text-slate-700"
          role="note"
        >
          סרגל &quot;סטטוס חיבור ה-Bridge&quot; מוסתר לארגון זה. כדי להציגו, הגדירו ב־
          <code className="mx-1 rounded bg-white px-1 font-mono text-[11px]">branding_settings</code>
          את המפתח <code className="rounded bg-white px-1 font-mono text-[11px]">whatsapp_enabled</code>
          ל־<code className="rounded bg-white px-1 font-mono text-[11px]">true</code> (עדכון ארגון ב-Super או ב-API).
        </div>
      ) : null}
      <WhatsAppBridgeStatusBar />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="relative border-b border-gray-100 px-4 pb-4 pt-5 dark:border-zinc-800 sm:px-6">
          <div className={cn("flex items-start justify-between gap-4", isRtl && "flex-row-reverse")}>
            <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
              <MessageCircle className="h-5 w-5 shrink-0 text-[#25D366]" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">{t("whatsapp.connection_title")}</h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-zinc-400">{t("whatsapp.connection_desc")}</p>
              </div>
            </div>
            <div
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                isConnected
                  ? "border-[#25D366]/40 bg-[#25D366]/10 text-[#128C7E] dark:text-[#25D366]"
                  : status === "disconnected" || status === "DISCONNECTED" || status === "error"
                    ? "border-red-300/60 bg-red-50 text-red-700 dark:border-red-600/40 dark:bg-red-950/30 dark:text-red-400"
                    : "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-600/40 dark:bg-amber-950/30 dark:text-amber-400"
              )}
            >
              {showWaiting ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    isConnected
                      ? "bg-[#25D366]"
                      : status === "disconnected" || status === "DISCONNECTED" || status === "error"
                        ? "bg-red-500"
                        : "bg-amber-500"
                  )}
                />
              )}
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-4 pt-5 sm:px-6">
          {(status === "disconnected" || status === "DISCONNECTED" || status === "error") && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {t("whatsapp.disconnected_label")} – {t("whatsapp.disconnected_hint")}
              </p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t("whatsapp.disconnected_hint_desc")}</p>
              <button
                type="button"
                onClick={() => void fetchQr(activeId, true)}
                disabled={refreshing}
                className="mt-3 inline-flex h-8 items-center justify-center gap-2 rounded-md bg-[#25D366] px-3 text-sm font-medium text-white hover:bg-[#20BD5A] disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t("whatsapp.scan_qr")} / {t("whatsapp.reset_connection")}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{t("whatsapp.connections_list") || "חיבורי WhatsApp"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ניתן להוסיף מספר חיבורי וואטסאפ (מספרי טלפון) ולשייך כל חיבור לסוכנים בהגדרות משתמשים.
            </p>
            <div className={cn("flex flex-wrap gap-2", isRtl && "flex-row-reverse")}>
              {connectionsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <>
                  {connections.map((c) => (
                    <div key={c.id} className={cn("flex items-center gap-0.5 rounded-lg border border-transparent", isRtl && "flex-row-reverse")}>
                      <button
                        type="button"
                        onClick={() => handleSelectConnection(c.id)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
                          selectedId === c.id
                            ? "border-[#25D366] bg-[#25D366] text-white shadow-sm hover:bg-[#20BD5A]"
                            : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        )}
                      >
                        {c.status === "connected" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                        {c.label || c.id}
                      </button>
                      <button
                        type="button"
                        onClick={() => c.id !== "default" && void handleDeleteConnection(c)}
                        disabled={deletingId !== null || c.id === "default"}
                        title={c.id === "default" ? t("whatsapp.cannot_delete_default") : t("whatsapp.delete_connection")}
                        aria-label={c.id === "default" ? t("whatsapp.cannot_delete_default") : t("whatsapp.delete_connection")}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/20"
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        <span className="text-xs">{c.id === "default" ? t("whatsapp.remove") : t("whatsapp.delete_connection")}</span>
                      </button>
                    </div>
                  ))}
                  <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                    <input
                      placeholder={t("whatsapp.new_connection_name") || "שם חיבור חדש"}
                      value={newConnectionLabel}
                      onChange={(e) => setNewConnectionLabel(e.target.value)}
                      className="h-9 w-40 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddConnection}
                      disabled={addingConnection}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#25D366] px-3 text-sm font-medium text-white hover:bg-[#20BD5A] disabled:opacity-50"
                    >
                      {addingConnection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {t("whatsapp.add_connection") || "הוסף חיבור"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="w-full" dir="rtl">
            <div
              className={cn(
                "inline-flex w-full max-w-2xl gap-0 rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-zinc-700 dark:bg-zinc-800/80",
                isRtl && "flex-row-reverse"
              )}
            >
              <button
                type="button"
                onClick={() => setPanelTab("qr")}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                  panelTab === "qr"
                    ? "bg-white text-[#128C7E] shadow-sm dark:bg-zinc-800 dark:text-[#25D366]"
                    : "text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-zinc-700/50",
                  isRtl && "flex-row-reverse"
                )}
              >
                <QrCode className="h-4 w-4 shrink-0" />
                {t("whatsapp.tab_qr_scan")}
              </button>
              <button
                type="button"
                onClick={() => setPanelTab("phone")}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                  panelTab === "phone"
                    ? "bg-white text-[#128C7E] shadow-sm dark:bg-zinc-800 dark:text-[#25D366]"
                    : "text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-zinc-700/50",
                  isRtl && "flex-row-reverse"
                )}
              >
                <Smartphone className="h-4 w-4 shrink-0" />
                {t("whatsapp.tab_phone_pairing")}
              </button>
            </div>

            {panelTab === "qr" && (
              <div className="mt-5 space-y-4">
                {!isConnected && (
                  <div className={cn("flex flex-wrap gap-2", isRtl && "flex-row-reverse")}>
                    <button
                      type="button"
                      onClick={() => void fetchQr(activeId, false)}
                      disabled={refreshing}
                      className={cn(
                        "inline-flex h-10 min-w-0 items-center gap-2 rounded-md bg-[#25D366] px-4 text-sm font-medium text-white hover:bg-[#20BD5A] sm:w-auto disabled:opacity-50",
                        isRtl && "flex-row-reverse"
                      )}
                    >
                      {refreshing ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                      {t("whatsapp.scan_qr")}
                    </button>
                    {showRetry && (
                      <button
                        type="button"
                        onClick={handleRetry}
                        disabled={refreshing}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      >
                        <RefreshCw className="h-5 w-5" />
                        {t("whatsapp.retry")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void fetchQr(activeId, true)}
                      disabled={refreshing}
                      className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-50 dark:hover:bg-amber-950/30"
                    >
                      <RefreshCw className="h-5 w-5" />
                      {t("whatsapp.reset_connection")}
                    </button>
                  </div>
                )}

                <div className="rounded-lg border border-gray-200/80 bg-gray-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/30">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                    {t("whatsapp.scan_qr")} – {connections.find((c) => c.id === activeId)?.label ?? activeId}
                  </p>
                  {qrImageUrl && !qrError ? (
                    <div className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URL or remote QR */}
                      <img src={qrImageUrl} alt="QR Code" className="h-52 w-52 object-contain" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void fetchQr(activeId, false)}
                      disabled={refreshing}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-[#25D366]/50 bg-white px-4 text-sm font-medium text-[#128C7E] hover:bg-[#25D366]/10"
                    >
                      {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      {t("whatsapp.scan_qr")}
                    </button>
                  )}
                </div>

                {qrError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    <p>{qrError}</p>
                    {showRetry && (
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                      >
                        <RefreshCw className="h-4 w-4" />
                        {t("whatsapp.retry")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {panelTab === "phone" && (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-gray-200/80 bg-gray-50/30 p-5 dark:border-zinc-800 dark:bg-zinc-900/30">
                  <div className={cn("mb-3 flex items-center gap-2", isRtl && "flex-row-reverse")}>
                    <Smartphone className="h-5 w-5 text-[#128C7E]" />
                    <span className="font-medium text-gray-900 dark:text-zinc-100">{t("whatsapp.pairing_code_title")}</span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="pairing-phone"
                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-zinc-300"
                      >
                        {t("whatsapp.pairing_code_phone_label")}
                      </label>
                      <div
                        className="flex overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-[#25D366]/50 dark:border-zinc-700 dark:bg-zinc-900"
                        dir="ltr"
                      >
                        <span className="flex items-center border-e border-gray-300 bg-gray-100 px-4 text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {PHONE_PREFIX}
                        </span>
                        <input
                          id="pairing-phone"
                          type="tel"
                          placeholder="501234567"
                          value={phoneNumber.replace(/\D/g, "")}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                          className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 text-slate-900 focus-visible:outline-none dark:text-zinc-100"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGetPairingCode}
                      disabled={pairingLoading || !phoneNumber.replace(/\D/g, "").trim()}
                      className={cn(
                        "inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-2.5 text-base font-medium text-white hover:bg-[#20BD5A] disabled:opacity-50",
                        isRtl && "flex-row-reverse"
                      )}
                    >
                      {pairingLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                          {t("whatsapp.pairing_generating")}
                        </>
                      ) : (
                        <>
                          <Smartphone className="h-5 w-5 shrink-0" />
                          {t("whatsapp.pairing_get_code_button")}
                        </>
                      )}
                    </button>

                    {pairingError && <p className="text-sm text-red-600 dark:text-red-400">{pairingError}</p>}

                    {pairingCode && (
                      <div className="rounded-xl border border-[#25D366]/30 bg-[#DCF8C6]/30 p-4 dark:border-[#25D366]/20 dark:bg-[#25D366]/10">
                        <p className="mb-2 text-sm font-medium text-[#128C7E] dark:text-[#25D366]">
                          {t("whatsapp.pairing_code_enter_code")}
                        </p>
                        <p className="font-mono text-2xl tracking-[0.4em] text-[#128C7E] dark:text-[#25D366]" dir="ltr">
                          {pairingCode}
                        </p>
                        <p className="mt-3 text-xs text-gray-500 dark:text-zinc-400">{t("whatsapp.pairing_code_instructions")}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-white to-emerald-50/30 p-5 dark:border-emerald-900/40 dark:from-zinc-900/50 dark:to-emerald-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-start">
                <p className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                  <BookTemplate className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  {t("whatsapp.message_templates")}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {t("whatsapp.message_templates_placeholder")} — ניהול בדף
                  מרכזי: תבניות מוכנות, שיוך לשלב CRM, ומזוג מכרטיס הלקוח.
                </p>
              </div>
              <Link
                href="/admin/settings/messages"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#16a34a] px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-[#15803d] dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <BookTemplate className="h-4 w-4" />
                לעורך תבניות
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
