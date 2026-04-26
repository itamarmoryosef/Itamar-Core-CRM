"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Plus, Save } from "lucide-react";
import { setSuperActiveOrganizationId } from "@/lib/orgContextClient";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  branding_settings: unknown;
  created_at: string;
};

export default function SuperOrganizationsPage() {
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { name: string; slug: string }>>({});

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/super/organizations", { credentials: "include" });
      if (res.status === 401) {
        setForbidden(true);
        return;
      }
      if (res.status === 403) {
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
      setEdits((prev) => {
        const n = { ...prev };
        for (const o of data.organizations ?? []) {
          if (!n[o.id]) n[o.id] = { name: o.name, slug: o.slug };
        }
        return n;
      });
    } catch {
      setErr("שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    void load();
  };

  const saveRow = async (o: OrgRow) => {
    const e = edits[o.id] ?? { name: o.name, slug: o.slug };
    setSavingId(o.id);
    const res = await fetch("/api/super/organizations", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, name: e.name, slug: e.slug }),
    });
    setSavingId(null);
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setErr(d.error ?? "שמירה נכשלה");
      return;
    }
    setErr(null);
    void load();
  };

  if (forbidden) {
    return (
      <div className="text-start" dir="rtl">
        <p className="text-amber-800 dark:text-amber-200">אין הרשאת platform super. הגדירו ב-Supabase:</p>
        <code className="mt-2 block text-xs [direction:ltr] text-left">
          update public.profiles set is_platform_super = true where id = &apos;…&apos;;
        </code>
        <Link href="/admin/clients" className="mt-4 inline-block text-brand">
          ללוח הלקוחות
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-start" dir="rtl">
      <div>
        <p className="text-xs font-medium text-brand">Super</p>
        <h1 className="text-2xl font-bold">ניהול ארגונים</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          כל ארגון מקבל slug ייחודי. כתובת אפליקטיבית לדוגמה:{" "}
          <code className="rounded bg-neutral-200 px-1 text-xs dark:bg-neutral-800">/org/your-slug/…</code>{" "}
          (ניתן לשלב עם middleware בהמשך).
        </p>
        <Link
          href="/admin/clients"
          className="mt-2 inline-block text-sm text-brand hover:underline"
        >
          ← חזרה
        </Link>
      </div>

      {err ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40" role="alert">
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
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
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
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            יצירה
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-neutral-500">טוען…</p>
      ) : (
        <div className="space-y-3">
          {orgs.map((o) => (
            <div
              key={o.id}
              className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="text-xs text-neutral-500" title="org id">
                  {o.id}
                </code>
                <button
                  type="button"
                  className="text-xs text-brand hover:underline"
                  onClick={() => {
                    setSuperActiveOrganizationId(o.id);
                    alert("נבחר כארגון פעיל בבאים (הגדרות שדות/לקוח).");
                  }}
                >
                  שמור כארגון פעיל (לעבודה)
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>שם</span>
                  <input
                    className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600"
                    value={edits[o.id]?.name ?? o.name}
                    onChange={(e) =>
                      setEdits((p) => ({
                        ...p,
                        [o.id]: { ...p[o.id], name: e.target.value, slug: p[o.id]?.slug ?? o.slug },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm [direction:ltr] text-left">
                  <span>slug</span>
                  <input
                    className="font-mono text-sm"
                    value={edits[o.id]?.slug ?? o.slug}
                    onChange={(e) =>
                      setEdits((p) => ({
                        ...p,
                        [o.id]: {
                          name: p[o.id]?.name ?? o.name,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => void saveRow(o)}
                  disabled={savingId === o.id}
                  className="inline-flex items-center gap-1 text-sm text-brand"
                >
                  {savingId === o.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  שמור
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
