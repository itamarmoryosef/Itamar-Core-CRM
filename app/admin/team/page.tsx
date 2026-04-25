"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2, UserPlus } from "lucide-react";

type TeamMember = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

export default function AdminTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoadError(null);
    setForbidden(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/team", { credentials: "include" });
      const data = (await res.json()) as {
        members?: TeamMember[];
        error?: string;
      };
      if (res.status === 403) {
        setForbidden(true);
        setMembers([]);
        return;
      }
      if (!res.ok) {
        setLoadError(data.error ?? "טעינה נכשלה");
        setMembers([]);
        return;
      }
      setMembers(data.members ?? []);
    } catch {
      setLoadError("שגיאת רשת");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormMsg(null);
    setFormBusy(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormMsg(data.error ?? "שמירה נכשלה");
        return;
      }
      setEmail("");
      setPassword("");
      setFormMsg("חבר הצוות נוצר (משתמש Auth + שורה ב־profiles).");
      void loadMembers();
    } catch {
      setFormMsg("שגיאת רשת");
    } finally {
      setFormBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("למחוק את המשתמש מ-Auth? הפרופיל יימחק אוטומטית (CASCADE).")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/team?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        window.alert(data.error ?? "מחיקה נכשלה");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch {
      window.alert("שגיאת רשת");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("he-IL", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  const roleBadgeClass = (role: string) => {
    if (role === "admin") {
      return "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200";
    }
    return "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200";
  };

  if (forbidden) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-start dark:border-amber-900 dark:bg-amber-950/40">
          <h1 className="text-lg font-semibold text-amber-950 dark:text-amber-100">
            אין גישה לניהול צוות
          </h1>
          <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">
            רק משתמשים עם{" "}
            <code className="rounded bg-amber-200/80 px-1 text-xs dark:bg-amber-900">
              role = &apos;admin&apos;
            </code>{" "}
            בטבלת{" "}
            <code className="rounded bg-amber-200/80 px-1 text-xs dark:bg-amber-900">
              profiles
            </code>{" "}
            יכולים לנהל צוות. בקשו ממנהל להגדיר את הפרופיל שלכם, או הריצו את
            הסקריפט ב־Supabase (ראו{" "}
            <code className="text-xs">profiles_team.sql</code>).
          </p>
          <Link
            href="/admin"
            className="mt-4 inline-block text-sm font-medium text-amber-950 underline dark:text-amber-100"
          >
            חזרה ללוח הבקרה
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-1 border-b border-neutral-200 pb-6 dark:border-neutral-700">
        <p className="text-start text-sm text-neutral-500 dark:text-neutral-400">
          ניהול צוות
        </p>
        <h1 className="text-start text-xl font-bold text-neutral-900 dark:text-neutral-50">
          ניהול צוות
        </h1>
        <p className="text-start text-sm text-neutral-600 dark:text-neutral-400">
          רשימה מטבלת <code className="rounded bg-neutral-200 px-1 text-xs dark:bg-neutral-800">profiles</code>
          . יצירת משתמש דרך Auth Admin + upsert לפרופיל (תפקיד ברירת מחדל: staff).
        </p>
      </header>

      <section
        className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900/40"
        aria-labelledby="add-team-h"
      >
        <h2
          id="add-team-h"
          className="text-start text-lg font-semibold text-neutral-900 dark:text-neutral-100"
        >
          הוסף חבר צוות
        </h2>
        <form
          onSubmit={(ev) => void handleAdd(ev)}
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <label className="grid gap-1.5 text-start text-sm sm:col-span-1">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              אימייל
            </span>
            <input
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
          <label className="grid gap-1.5 text-start text-sm sm:col-span-1">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              סיסמה
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={formBusy}
              className="inline-flex h-9 min-h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {formBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
              {formBusy ? "יוצר…" : "הוסף חבר"}
            </button>
            {formMsg ? (
              <p className="mt-2 text-start text-sm text-neutral-700 dark:text-neutral-300">
                {formMsg}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section aria-labelledby="team-list-h">
        <h2
          id="team-list-h"
          className="text-start text-lg font-semibold text-neutral-900 dark:text-neutral-100"
        >
          חברי צוות
        </h2>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען…
          </div>
        ) : loadError ? (
          <p className="mt-4 text-start text-sm text-red-600" role="alert">
            {loadError}
          </p>
        ) : members.length === 0 ? (
          <p className="mt-4 text-start text-sm text-neutral-600 dark:text-neutral-400">
            אין רשומות ב־profiles. הריצו את הסקריפט SQL והגדירו מנהל ראשון.
          </p>
        ) : (
          <>
            <ul className="mt-4 space-y-3 md:hidden" role="list">
              {members.map((m) => (
                <li
                  key={`m-${m.id}`}
                  className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50"
                >
                  <dl className="space-y-2 text-start text-sm">
                    <div>
                      <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        אימייל
                      </dt>
                      <dd
                        className="break-all font-medium text-neutral-900 dark:text-neutral-100"
                        dir="ltr"
                      >
                        {m.email || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        תפקיד
                      </dt>
                      <dd>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadgeClass(m.role)}`}
                        >
                          {m.role}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        נוצר
                      </dt>
                      <dd className="text-neutral-700 dark:text-neutral-300">
                        {formatDate(m.created_at)}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => void handleDelete(m.id)}
                    disabled={deletingId === m.id}
                    className="mt-4 flex h-9 min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                  >
                    {deletingId === m.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                    מחק משתמש
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden md:block">
              <p className="mb-2 text-start text-xs text-neutral-500 dark:text-neutral-400">
                גלילה אופקית במסכים צרים
              </p>
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
                <table className="w-full min-w-[420px] border-collapse text-start text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/60">
                      <th className="px-4 py-3 font-semibold text-neutral-800 dark:text-neutral-200">
                        אימייל
                      </th>
                      <th className="px-4 py-3 font-semibold text-neutral-800 dark:text-neutral-200">
                        תפקיד
                      </th>
                      <th className="px-4 py-3 font-semibold text-neutral-800 dark:text-neutral-200">
                        נוצר
                      </th>
                      <th className="w-28 px-4 py-3 font-semibold text-neutral-800 dark:text-neutral-200">
                        פעולות
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-neutral-100 dark:border-neutral-800"
                      >
                        <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                          {m.email || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadgeClass(m.role)}`}
                          >
                            {m.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                          {formatDate(m.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void handleDelete(m.id)}
                            disabled={deletingId === m.id}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                          >
                            {deletingId === m.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            )}
                            מחק
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
