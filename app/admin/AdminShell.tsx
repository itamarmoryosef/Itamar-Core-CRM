"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

const MAIN_NAV = {
  href: "/admin/clients",
  label: "לוח בקרה",
  match: (p: string) => p === "/admin" || p.startsWith("/admin/clients"),
} as const;

const REVENUE_NAV = {
  href: "/admin/revenue",
  label: "סיכום הכנסות",
  match: (p: string) => p.startsWith("/admin/revenue"),
} as const;

const SETTINGS_NAV = {
  href: "/admin/settings",
  label: "הגדרות ותצורה",
  match: (p: string) => p.startsWith("/admin/settings"),
  title:
    "כולל תבניות הסכם Word (.docx) וסוגי מסמכים — גללו למטה בדף",
} as const;

const TEAM_NAV = {
  href: "/admin/team",
  label: "ניהול צוות",
  match: (p: string) => p.startsWith("/admin/team"),
} as const;

function navLinkClass(pathname: string, active: boolean, compact = false) {
  const size = compact ? "text-xs" : "text-sm";
  return `flex min-h-8 items-center rounded-lg px-2 py-1.5 ${size} font-medium transition-colors ${
    active
      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
  }`;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showTeamNav, setShowTeamNav] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return { teamAdmin: false };
        return (await res.json()) as { teamAdmin?: boolean };
      })
      .then((data) => {
        if (!cancelled) setShowTeamNav(data.teamAdmin === true);
      })
      .catch(() => {
        if (!cancelled) setShowTeamNav(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-sm dark:bg-neutral-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-5 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-neutral-800 md:hidden dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              aria-expanded={mobileNavOpen}
              aria-controls="admin-mobile-nav"
              aria-label="פתח תפריט ניווט"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="h-5 w-5 shrink-0" aria-hidden />
            </button>
            <nav
              className="hidden flex-wrap items-center gap-1.5 md:flex sm:gap-2"
              aria-label="אזור ניהול"
            >
              <Link
                href={MAIN_NAV.href}
                className={navLinkClass(pathname, MAIN_NAV.match(pathname))}
              >
                {MAIN_NAV.label}
              </Link>
              <Link
                href={REVENUE_NAV.href}
                className={navLinkClass(pathname, REVENUE_NAV.match(pathname))}
              >
                {REVENUE_NAV.label}
              </Link>
              <Link
                href={SETTINGS_NAV.href}
                title={SETTINGS_NAV.title}
                className={navLinkClass(
                  pathname,
                  SETTINGS_NAV.match(pathname)
                )}
              >
                {SETTINGS_NAV.label}
              </Link>
              {showTeamNav ? (
                <Link
                  href={TEAM_NAV.href}
                  className={navLinkClass(pathname, TEAM_NAV.match(pathname))}
                >
                  {TEAM_NAV.label}
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">התנתק</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 lg:px-6 lg:py-4">
        <div className="rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          {children}
        </div>
      </main>

      {mobileNavOpen ? (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="סגור תפריט"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            id="admin-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="תפריט ניווט"
            className="fixed inset-y-0 start-0 z-50 flex w-[min(100%,15rem)] flex-col border-e border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              <span className="text-start text-xs font-semibold text-slate-900 dark:text-slate-100">
                ניווט
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="סגור"
              >
                <X className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </div>
            <nav
              className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
              aria-label="אזור ניהול"
            >
              <Link
                href={MAIN_NAV.href}
                onClick={() => setMobileNavOpen(false)}
                className={navLinkClass(
                  pathname,
                  MAIN_NAV.match(pathname),
                  true
                )}
              >
                {MAIN_NAV.label}
              </Link>
              <Link
                href={REVENUE_NAV.href}
                onClick={() => setMobileNavOpen(false)}
                className={navLinkClass(
                  pathname,
                  REVENUE_NAV.match(pathname),
                  true
                )}
              >
                {REVENUE_NAV.label}
              </Link>
              <Link
                href={SETTINGS_NAV.href}
                title={SETTINGS_NAV.title}
                onClick={() => setMobileNavOpen(false)}
                className={navLinkClass(
                  pathname,
                  SETTINGS_NAV.match(pathname),
                  true
                )}
              >
                {SETTINGS_NAV.label}
              </Link>
              {showTeamNav ? (
                <Link
                  href={TEAM_NAV.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={navLinkClass(
                    pathname,
                    TEAM_NAV.match(pathname),
                    true
                  )}
                >
                  {TEAM_NAV.label}
                </Link>
              ) : null}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
