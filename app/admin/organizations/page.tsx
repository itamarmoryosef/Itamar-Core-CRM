"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  ChevronsLeft,
  Download,
  Loader2,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { setSuperActiveOrganizationId } from "@/lib/orgContextClient";
import { OrganizationFeaturesModal } from "./OrganizationFeaturesModal";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  branding_settings: unknown;
  created_at: string;
};

export default function AdminOrganizationsPage() {
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [featuresForOrg, setFeaturesForOrg] = useState<OrgRow | null>(null);
  const [exportingOrgId, setExportingOrgId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/super/organizations", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = (await res.json()) as {
        organizations?: OrgRow[];
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error ?? "שגיאה");
        return;
      }
      setOrgs(data.organizations ?? []);
    } catch {
      setErr("שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadOrgJsonExport = async (o: OrgRow) => {
    setErr(null);
    setExportingOrgId(o.id);
    try {
      const res = await fetch("/api/super/organization-export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: o.id }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? "ייצוא נכשל");
        return;
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition");
      let filename = `org-export-${o.id.slice(0, 8)}.json`;
      const m = /filename="([^"]+)"/.exec(dispo ?? "");
      if (m?.[1]) filename = m[1];
      const text = await blob.text();
      try {
        JSON.parse(text);
      } catch {
        setErr("הקובץ אינו JSON תקין");
        return;
      }
      const u = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = u;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      setErr("הורדה נכשלה");
    } finally {
      setExportingOrgId(null);
    }
  };

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const slug = newSlug.trim().toLowerCase();
    if (!name || !slug) return;
    setCreating(true);
    const res = await fetch("/api/super/organizations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });
    setCreating(false);
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setErr(d.error ?? "יצירה נכשלה");
      return;
    }
    setNewName("");
    setNewSlug("");
    setErr(null);
    const j = (await res.json()) as { organization?: { id: string } };
    void load();
    if (j.organization?.id) {
      window.location.assign(`/admin/organizations/${j.organization.id}`);
    }
  };

  if (forbidden) {
    return (
      <div className="text-start" dir="rtl">
        <p className="text-amber-800 dark:text-amber-200">
          דף זה מיועד ל־<strong>platform super</strong> בלבד. הגדירו ב־Supabase:{" "}
          <code className="[direction:ltr] text-left">is_platform_super = true</code> בפרופיל.
        </p>
        <Link href="/admin/clients" className="mt-4 inline-block text-brand">
          ללוח הלקוחות
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-start" dir="rtl">
      <OrganizationFeaturesModal
        org={
          featuresForOrg
            ? { id: featuresForOrg.id, name: featuresForOrg.name, slug: featuresForOrg.slug }
            : null
        }
        open={featuresForOrg != null}
        onClose={() => setFeaturesForOrg(null)}
      />
      <div>
        <p className="text-xs font-medium text-brand">Platform super</p>
        <h1 className="text-2xl font-bold">ניהול ארגונים</h1>
        <p className="mt-1 text-sm text-neutral-600">
          בחרו ארגון: עריכה, ניהול יכולות, ייצוא JSON (<code className="text-xs">export_org_data_v2</code>),{" "}
          <code className="text-xs">system_features</code> +{" "}
          <code className="text-xs">organization_feature_map</code>.
        </p>
        <Link
          href="/admin/clients"
          className="mt-2 inline-block text-sm text-brand hover:underline"
        >
          ← לוח הלקוחות
        </Link>
      </div>

      {err ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40"
          role="alert"
        >
          {err}
        </p>
      ) : null}

      <form
        onSubmit={(e) => void createOrg(e)}
        className="grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4" />
          ארגון חדש
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>שם</span>
            <input
              className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm [direction:ltr] text-left">
            <span>slug</span>
            <input
              className="rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-slate-600 dark:bg-slate-950"
              value={newSlug}
              onChange={(e) =>
                setNewSlug(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                )
              }
              placeholder="acme"
              required
            />
          </label>
        </div>
        <div>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            יצירה
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-neutral-500">טוען…</p>
      ) : (
        <ul className="space-y-2" aria-label="רשימת ארגונים">
          {orgs.map((o) => (
            <li
              key={o.id}
              className="flex items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700"
            >
              <Link
                href={`/admin/organizations/${o.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start transition hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-neutral-900 dark:text-slate-100">
                    {o.name}
                  </div>
                  <code
                    className="text-xs text-slate-500"
                    dir="ltr"
                  >{`/${o.slug}`}</code>
                </div>
                <div className="shrink-0 text-slate-400" aria-hidden>
                  <span className="text-xs text-slate-400">עריכה</span>{" "}
                  <ChevronsLeft className="inline h-4 w-4" />
                </div>
              </Link>
              <div className="flex shrink-0 flex-col justify-stretch border-s border-slate-100 p-1 sm:flex-row sm:items-stretch">
                <button
                  type="button"
                  onClick={() => {
                    setFeaturesForOrg(o);
                  }}
                  className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-s-none px-2.5 text-xs text-slate-700 transition hover:bg-violet-50 dark:text-slate-200 dark:hover:bg-violet-950/30 sm:px-3"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>ניהול יכולות</span>
                </button>
                <button
                  type="button"
                  onClick={() => void downloadOrgJsonExport(o)}
                  disabled={exportingOrgId === o.id}
                  title="ייצוא JSON (export_org_data_v2)"
                  className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-s-none px-2.5 text-xs text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 sm:px-3"
                >
                  {exportingOrgId === o.id ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="hidden min-[22rem]:inline">Export</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSuperActiveOrganizationId(o.id);
                  }}
                  className="min-h-10 rounded-s-none px-2.5 text-xs text-brand transition hover:bg-slate-50 sm:px-3"
                >
                  <span>ארגון</span> <br className="sm:hidden" />
                  <span>פעיל</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
