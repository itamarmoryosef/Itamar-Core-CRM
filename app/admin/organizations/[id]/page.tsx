"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Download, FileJson, Loader2, Save } from "lucide-react";
import { setSuperActiveOrganizationId } from "@/lib/orgContextClient";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  branding_settings: unknown;
  created_at: string;
};

type Feat = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  enabled: boolean;
};

export default function AdminOrganizationEditPage() {
  const params = useParams();
  const orgId = typeof params.id === "string" ? params.id : "";

  const [forbidden, setForbidden] = useState(false);
  const [orgLoading, setOrgLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [nameEdit, setNameEdit] = useState("");
  const [slugEdit, setSlugEdit] = useState("");
  const [features, setFeatures] = useState<Feat[]>([]);
  const [featsLoading, setFeatsLoading] = useState(true);
  const [exportingBase, setExportingBase] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);

  const loadFeatures = useCallback(async () => {
    if (!orgId) return;
    setFeatsLoading(true);
    setErr(null);
    const res = await fetch(
      `/api/super/organization-features?organizationId=${encodeURIComponent(orgId)}`,
      { credentials: "include" }
    );
    if (res.status === 401 || res.status === 403) {
      setForbidden(true);
      setFeatsLoading(false);
      return;
    }
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setErr(d.error ?? "שגיאה");
      setFeatsLoading(false);
      return;
    }
    const j = (await res.json()) as { features?: Feat[] };
    setFeatures(j.features ?? []);
    setFeatsLoading(false);
  }, [orgId]);

  const fetchOrg = useCallback(async () => {
    if (!orgId) return;
    setOrgLoading(true);
    setErr(null);
    const res = await fetch("/api/super/organizations", {
      credentials: "include",
    });
    if (res.status === 401 || res.status === 403) {
      setForbidden(true);
      setOrgLoading(false);
      return;
    }
    if (!res.ok) {
      setErr("טעינת ארגונים נכשלה");
      setOrgLoading(false);
      return;
    }
    const j = (await res.json()) as { organizations?: OrgRow[] };
    const row = (j.organizations ?? []).find((o) => o.id === orgId);
    if (!row) {
      setErr("הארגון לא נמצא");
      setOrgLoading(false);
      return;
    }
    setOrg(row);
    setNameEdit(row.name);
    setSlugEdit(row.slug);
    setOrgLoading(false);
    setSuperActiveOrganizationId(orgId);
  }, [orgId]);

  useEffect(() => {
    void fetchOrg();
  }, [fetchOrg]);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  const saveMeta = async () => {
    if (!org) return;
    setSavingMeta(true);
    setErr(null);
    const res = await fetch("/api/super/organizations", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orgId, name: nameEdit, slug: slugEdit }),
    });
    setSavingMeta(false);
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setErr(d.error ?? "שמירה נכשלה");
      return;
    }
    const j = (await res.json()) as { organization?: OrgRow };
    if (j.organization) {
      setOrg(j.organization);
    }
  };

  const setFeatureLocal = (code: string, enabled: boolean) => {
    setFeatures((prev) =>
      prev.map((f) => (f.code === code ? { ...f, enabled } : f))
    );
  };

  const toggleFeature = async (code: string, next: boolean) => {
    setErr(null);
    setSavingCode(code);
    setFeatureLocal(code, next);
    const res = await fetch("/api/super/organization-features", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, code, enabled: next }),
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
            detail: { organizationId: orgId, code, enabled: next },
          })
        );
      } catch {
        /* */
      }
    }
    setSavingCode(null);
  };

  const downloadPost = async (
    path: string,
    filenameHint: string,
    setBusy: (v: boolean) => void
  ) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setErr(d.error ?? "ייצוא נכשל");
        return;
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition");
      let filename = filenameHint;
      const m = /filename="([^"]+)"/.exec(dispo ?? "");
      if (m?.[1]) filename = m[1];
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      setErr("הורדה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  if (!orgId) {
    return <p dir="rtl">מזהה לא תקין</p>;
  }

  if (forbidden) {
    return (
      <div className="text-start" dir="rtl">
        <p>רק <strong>platform super</strong>.</p>
        <Link href="/admin/clients" className="text-brand">
          ללוח
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-start" dir="rtl">
      <div>
        <Link
          href="/admin/organizations"
          className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          חזרה לרשימת ארגונים
        </Link>
        <h1 className="mt-3 text-2xl font-bold">עריכת ארגון</h1>
        {orgLoading ? (
          <p className="mt-1 text-sm text-neutral-500">טוען…</p>
        ) : org ? (
          <p className="mt-1 font-mono text-xs text-slate-500" dir="ltr">
            {org.id}
          </p>
        ) : null}
      </div>

      {err ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {err}
        </p>
      ) : null}

      {org && !orgLoading ? (
        <section className="rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">פרטים</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>שם</span>
              <input
                className="rounded border border-slate-300 bg-white px-2 py-1.5"
                value={nameEdit}
                onChange={(e) => setNameEdit(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm [direction:ltr] text-left">
              <span>slug</span>
              <input
                className="rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm"
                value={slugEdit}
                onChange={(e) =>
                  setSlugEdit(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                  )
                }
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveMeta()}
              disabled={savingMeta}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"
            >
              {savingMeta ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              שמור שם
            </button>
            <button
              type="button"
              onClick={() => setSuperActiveOrganizationId(orgId)}
              className="text-sm text-brand hover:underline"
            >
              הגדר כארגון פעיל
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadPost(
                  "/api/super/organization-export",
                  `org-export-${orgId.slice(0, 8)}.json`,
                  setExportingBase
                )
              }
              disabled={exportingBase}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              title="מבוסס SQL: public.export_org_data_v2"
            >
              {exportingBase ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              ייצוא דאטה לארגון
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadPost(
                  "/api/super/organization-export-full",
                  `org-full-${orgId.slice(0, 8)}.json`,
                  setExportingFull
                )
              }
              disabled={exportingFull}
              className="inline-flex items-center gap-1 text-xs text-amber-800 hover:underline"
            >
              {exportingFull ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileJson className="h-3.5 w-3.5" />
              )}
              ייצוא דאטה מלא
            </button>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-slate-800">פיצ&apos;רים (system_features)</h2>
        <p className="mt-1 text-xs text-neutral-500">
          שינויים בטבלת <code>organization_feature_map</code> — ה-UI מתעדכן מייד, השרת מאשר ברקע.
        </p>
        {featsLoading ? (
          <p className="mt-2 text-sm text-neutral-500">טוען פיצ&apos;רים…</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {features.map((f) => {
              const busy = savingCode === f.code;
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3"
                >
                  <div>
                    <div className="font-medium">{f.label}</div>
                    <code className="text-xs text-slate-500" dir="ltr">
                      {f.code}
                    </code>
                    {f.description ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        {f.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="inline-flex items-center gap-2 [direction:ltr]">
                    {busy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
                    ) : null}
                    <input
                      type="checkbox"
                      role="switch"
                      className="h-6 w-6 cursor-pointer rounded border-slate-300"
                      style={{ accentColor: "var(--primary-brand, #6366f1)" }}
                      checked={f.enabled}
                      disabled={busy}
                      onChange={(e) => void toggleFeature(f.code, e.target.checked)}
                      aria-label={f.enabled ? "פעיל" : "כבוי"}
                    />
                    <span className="text-xs text-neutral-600" dir="rtl">
                      {f.enabled ? "פעיל" : "כבוי"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
