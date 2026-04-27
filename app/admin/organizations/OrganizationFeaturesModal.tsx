"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Loader2, X } from "lucide-react";

type Feat = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  enabled: boolean;
};

type Props = {
  org: { id: string; name: string; slug: string } | null;
  open: boolean;
  onClose: () => void;
};

export function OrganizationFeaturesModal({ org, open, onClose }: Props) {
  const titleId = useId();
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [features, setFeatures] = useState<Feat[]>([]);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const orgId = org?.id ?? "";

  const loadFeatures = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setErr(null);
    setForbidden(false);
    const res = await fetch(
      `/api/super/organization-features?organizationId=${encodeURIComponent(orgId)}`,
      { credentials: "include" }
    );
    if (res.status === 401 || res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setErr(d.error ?? "שגיאה");
      setLoading(false);
      return;
    }
    const j = (await res.json()) as { features?: Feat[] };
    setFeatures(j.features ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (!open || !org) return;
    void loadFeatures();
  }, [open, org, loadFeatures]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setFeatureLocal = (code: string, enabled: boolean) => {
    setFeatures((prev) =>
      prev.map((f) => (f.code === code ? { ...f, enabled } : f))
    );
  };

  const toggleFeature = async (code: string, next: boolean) => {
    if (!org) return;
    setErr(null);
    setSavingCode(code);
    setFeatureLocal(code, next);
    const res = await fetch("/api/super/organization-features", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: org.id,
        code,
        enabled: next,
      }),
    });
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setErr(d.error ?? "שמירה נכשלה");
      setFeatureLocal(code, !next);
      setSavingCode(null);
      return;
    }
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("crm-organization-features-updated", {
            detail: { organizationId: org.id, code, enabled: next },
          })
        );
      } catch {
        /* */
      }
    }
    setSavingCode(null);
  };

  if (!open || !org) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
        aria-label="סגור"
      />
      <div
        className="relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
          <div className="min-w-0 text-start">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              ניהול יכולות
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {org.name}{" "}
              <code className="text-xs" dir="ltr">
                {org.slug}
              </code>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
          {forbidden ? (
            <p className="px-2 text-sm text-amber-800 dark:text-amber-200">
              אין הרשאה. נדרש <code>is_platform_super = true</code> בפרופיל.
            </p>
          ) : err ? (
            <p
              className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40"
              role="alert"
            >
              {err}
            </p>
          ) : null}

          {loading && !err ? (
            <p className="flex items-center gap-2 px-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              טוען פיצ&apos;רים…
            </p>
          ) : !forbidden ? (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {features.map((f) => {
                const busy = savingCode === f.code;
                return (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 py-2.5 dark:bg-slate-900/40 sm:px-4 sm:py-3"
                  >
                    <div className="min-w-0 text-start">
                      <div className="font-medium">{f.label}</div>
                      <code className="text-xs text-slate-500" dir="ltr">
                        {f.code}
                      </code>
                      {f.description ? (
                        <p className="mt-0.5 text-xs text-neutral-500">{f.description}</p>
                      ) : null}
                    </div>
                    <div
                      className="inline-flex shrink-0 items-center gap-2 [direction:ltr]"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
                      ) : null}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={f.enabled}
                        disabled={busy}
                        onClick={() => void toggleFeature(f.code, !f.enabled)}
                        className={[
                          "inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors",
                          f.enabled
                            ? "justify-end border-violet-600 bg-violet-500"
                            : "justify-start border-slate-300 bg-slate-200 dark:border-slate-500 dark:bg-slate-600",
                          busy ? "cursor-wait opacity-70" : "cursor-pointer",
                        ].join(" ")}
                        aria-label={f.enabled ? "לכבות" : "להדליק"}
                      >
                        <span className="h-5 w-5 rounded-full bg-white shadow" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-3 text-start text-sm dark:border-slate-700">
          <Link
            href={`/admin/organizations/${org.id}`}
            className="text-brand hover:underline"
            onClick={onClose}
          >
            לעריכת שם, slug וייצוא
          </Link>
        </div>
      </div>
    </div>
  );
}
