"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AdminMeResponse } from "@/app/api/admin/me/route";
import {
  AdminSessionProvider,
  type AdminActiveOrganization,
  type AdminSessionValue,
} from "@/lib/adminSessionContext";
import {
  parseOrganizationBranding,
  DEFAULT_PRODUCT_DISPLAY_NAME,
} from "@/lib/orgBranding";
import { resolveAdminOrganizationId } from "@/lib/orgContextClient";

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

/** UUID `client_statuses` + בוט (מסך ייעודי) */
const CRM_STATUSES_NAV = {
  href: "/admin/settings/statuses",
  label: "ניהול סטטוסים",
  match: (p: string) => p.startsWith("/admin/settings/statuses"),
} as const;

const SETTINGS_NAV = {
  href: "/admin/settings",
  label: "הגדרות ותצורה",
  match: (p: string) =>
    p === "/admin/settings" ||
    (p.startsWith("/admin/settings/") &&
      !p.startsWith("/admin/settings/statuses")),
  title:
    "תזכורות, מיתוג, סוגי מסמכים, תבניות — לא כולל מסך סטטוסי ה־CRM",
} as const;

const TEAM_NAV = {
  href: "/admin/team",
  label: "ניהול צוות",
  match: (p: string) => p.startsWith("/admin/team"),
} as const;

const SUPER_ORGS_NAV = {
  href: "/admin/super/organizations",
  label: "ארגונים (Super)",
  match: (p: string) => p.startsWith("/admin/super"),
} as const;

type SuperOrgRow = {
  id: string;
  name: string;
  slug: string;
  branding_settings?: unknown;
};

function navLinkClass(pathname: string, active: boolean, compact = false) {
  const size = compact ? "text-xs" : "text-sm";
  return `flex min-h-8 items-center rounded-lg px-2 py-1.5 ${size} font-medium transition-colors ${
    active
      ? "bg-brand text-white shadow-sm"
      : "text-neutral-600 hover:bg-slate-100 hover:text-neutral-900"
  }`;
}

function rowToActive(row: SuperOrgRow): AdminActiveOrganization | null {
  const parsed = parseOrganizationBranding({
    name: row.name,
    branding_settings: row.branding_settings,
  });
  if (!parsed) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ...parsed,
  };
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showTeamNav, setShowTeamNav] = useState(false);
  const [showSuperNav, setShowSuperNav] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [superOrgs, setSuperOrgs] = useState<SuperOrgRow[] | null>(null);
  const [tick, setTick] = useState(0);

  const loadSession = useCallback(async () => {
    const res = await fetch("/api/admin/me", { credentials: "include" });
    if (!res.ok) {
      setMe(null);
      setSuperOrgs(null);
      return;
    }
    const data = (await res.json()) as AdminMeResponse;
    setMe(data);
    setShowTeamNav(data.teamAdmin === true);
    setShowSuperNav(data.platformSuper === true);
    if (data.platformSuper) {
      const ores = await fetch("/api/super/organizations", {
        credentials: "include",
      });
      if (ores.ok) {
        const oj = (await ores.json()) as { organizations?: SuperOrgRow[] };
        setSuperOrgs(oj.organizations ?? []);
      } else {
        setSuperOrgs([]);
      }
    } else {
      setSuperOrgs(null);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSession();
    });
  }, [loadSession, tick]);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("crm-branding-updated", bump);
    window.addEventListener("crm-active-organization-changed", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("crm-branding-updated", bump);
      window.removeEventListener("crm-active-organization-changed", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const activeOrganization = useMemo((): AdminActiveOrganization | null => {
    if (!me) return null;
    if (me.platformSuper && (superOrgs?.length ?? 0) > 0) {
      const list = superOrgs!;
      const resolvedId = resolveAdminOrganizationId(
        { platformSuper: true, organizationId: me.organizationId },
        list
      );
      const row =
        (resolvedId ? list.find((o) => o.id === resolvedId) : null) ??
        list[0];
      if (row) {
        const fromRow = rowToActive(row);
        if (fromRow) return fromRow;
      }
    }
    if (me.organization) {
      return {
        id: me.organization.id,
        name: me.organization.name,
        slug: me.organization.slug,
        brand_name: me.organization.brand_name,
        logo_url: me.organization.logo_url,
        primary_color: me.organization.primary_color,
        whatsapp_enabled: me.organization.whatsapp_enabled,
      };
    }
    return null;
  }, [me, superOrgs]);

  const displayName =
    activeOrganization?.brand_name?.trim() || DEFAULT_PRODUCT_DISPLAY_NAME;
  const logoUrl = activeOrganization?.logo_url?.trim() || null;
  const primaryHex =
    activeOrganization?.primary_color?.trim() || "#6366f1";

  const sessionValue: AdminSessionValue = useMemo(
    () => ({
      me,
      activeOrganization,
      refresh: () => setTick((n) => n + 1),
    }),
    [me, activeOrganization]
  );

  useEffect(() => {
    queueMicrotask(() => {
      setMobileNavOpen(false);
    });
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
    <AdminSessionProvider value={sessionValue}>
      <div
        className="admin-air min-h-screen bg-[#F8FAFC] text-sm text-neutral-900"
        style={
          {
            colorScheme: "light",
            ["--primary-brand" as string]: primaryHex,
          } as CSSProperties
        }
      >
        <header className="sticky top-0 z-30 border-b border-slate-100 bg-white shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-5 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white text-neutral-800 shadow-sm md:hidden"
                aria-expanded={mobileNavOpen}
                aria-controls="admin-mobile-nav"
                aria-label="פתח תפריט ניווט"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-5 w-5 shrink-0" aria-hidden />
              </button>
              <Link
                href="/admin/clients"
                className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg border border-slate-100 bg-white px-2 py-1 shadow-sm"
              >
                {logoUrl ? (
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary tenant URLs */}
                    <img
                      src={logoUrl}
                      alt=""
                      className="max-h-8 max-w-8 object-contain"
                    />
                  </span>
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                    <LayoutDashboard className="h-4 w-4" aria-hidden />
                  </span>
                )}
                <span className="hidden max-w-[10rem] truncate text-start text-sm font-semibold text-neutral-900 sm:inline md:max-w-[14rem]">
                  {displayName}
                </span>
              </Link>
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
                href={CRM_STATUSES_NAV.href}
                className={navLinkClass(
                  pathname,
                  CRM_STATUSES_NAV.match(pathname)
                )}
              >
                {CRM_STATUSES_NAV.label}
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
              {showSuperNav ? (
                  <Link
                    href={SUPER_ORGS_NAV.href}
                    className={navLinkClass(
                      pathname,
                      SUPER_ORGS_NAV.match(pathname)
                    )}
                  >
                    {SUPER_ORGS_NAV.label}
                  </Link>
                ) : null}
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
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-100 bg-white px-2.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-slate-50"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">התנתק</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 lg:px-6 lg:py-4">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
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
              className="fixed inset-y-0 start-0 z-50 flex w-[min(100%,15rem)] flex-col border-e border-slate-100 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-start text-xs font-semibold text-slate-900">
                  ניווט
                </span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
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
                  href={CRM_STATUSES_NAV.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={navLinkClass(
                    pathname,
                    CRM_STATUSES_NAV.match(pathname),
                    true
                  )}
                >
                  {CRM_STATUSES_NAV.label}
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
                {showSuperNav ? (
                  <Link
                    href={SUPER_ORGS_NAV.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={navLinkClass(
                      pathname,
                      SUPER_ORGS_NAV.match(pathname),
                      true
                    )}
                  >
                    {SUPER_ORGS_NAV.label}
                  </Link>
                ) : null}
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
    </AdminSessionProvider>
  );
}
