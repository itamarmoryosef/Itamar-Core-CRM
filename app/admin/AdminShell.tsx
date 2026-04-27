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
import { ORG_FEATURE } from "@/lib/orgFeatureCodes";
import { checkFeature } from "@/lib/checkFeature";

const MAIN_NAV = {
  href: "/admin/clients",
  label: "לוח בקרה",
  match: (p: string) => p === "/admin" || p.startsWith("/admin/clients"),
} as const;

const DASHBOARD_NAV = {
  href: "/admin/dashboard",
  label: "דשבורד",
  match: (p: string) => p.startsWith("/admin/dashboard"),
} as const;

const REVENUE_NAV = {
  href: "/admin/revenue",
  label: "סיכום הכנסות",
  match: (p: string) => p.startsWith("/admin/revenue"),
} as const;

/** כל מסכי /admin/settings כולל דפים מקוננים (סטטוסים, שדות, פריסה, וכו׳) */
const SETTINGS_NAV = {
  href: "/admin/settings",
  label: "הגדרות ותצורה",
  match: (p: string) => p === "/admin/settings" || p.startsWith("/admin/settings/"),
  title: "הגדרות, מיתוג, CRM, מסמכים, צוות, ולידים",
} as const;

const TEAM_NAV = {
  href: "/admin/team",
  label: "ניהול צוות",
  match: (p: string) => p.startsWith("/admin/team"),
} as const;

const SUPER_ORGS_NAV = {
  href: "/admin/organizations",
  label: "ארגונים (Super)",
  match: (p: string) =>
    p.startsWith("/admin/organizations") || p.startsWith("/admin/super"),
} as const;

type SuperOrgRow = {
  id: string;
  name: string;
  slug: string;
  branding_settings?: unknown;
};

function navLinkClass(pathname: string, active: boolean, compact = false) {
  const size = compact ? "text-xs" : "text-sm";
  return `flex min-h-8 items-center rounded-xl px-2.5 py-1.5 ${size} font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-1 ${
    active
      ? "bg-brand text-white shadow-md shadow-slate-900/10"
      : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900"
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
  const [enabledFeatureCodes, setEnabledFeatureCodes] = useState<string[] | null>(null);

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
    window.addEventListener("crm-organization-features-updated", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("crm-branding-updated", bump);
      window.removeEventListener("crm-active-organization-changed", bump);
      window.removeEventListener("crm-organization-features-updated", bump);
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

  useEffect(() => {
    const orgId = activeOrganization?.id;
    if (!orgId) {
      setEnabledFeatureCodes(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/admin/features?organizationId=${encodeURIComponent(orgId)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        if (!cancelled) {
          setEnabledFeatureCodes(null);
        }
        return;
      }
      const j = (await res.json()) as {
        enabledCodes?: string[] | null;
        error?: string;
      };
      if (cancelled) return;
      setEnabledFeatureCodes(
        j.enabledCodes === null || j.enabledCodes === undefined
          ? null
          : j.enabledCodes
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id, tick]);

  const displayName =
    activeOrganization?.brand_name?.trim() || DEFAULT_PRODUCT_DISPLAY_NAME;
  const logoUrl = activeOrganization?.logo_url?.trim() || null;
  const primaryHex =
    activeOrganization?.primary_color?.trim() || "#6366f1";

  const showDashboardNav =
    checkFeature(enabledFeatureCodes, ORG_FEATURE.revenue) ||
    checkFeature(enabledFeatureCodes, ORG_FEATURE.dashboard);
  const settingsMainNavActive = SETTINGS_NAV.match(pathname);

  const sessionValue: AdminSessionValue = useMemo(
    () => ({
      me,
      activeOrganization,
      enabledFeatureCodes,
      refresh: () => setTick((n) => n + 1),
    }),
    [me, activeOrganization, enabledFeatureCodes]
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
        className="admin-air min-h-screen text-sm"
        style={
          {
            colorScheme: "light",
            ["--primary-brand" as string]: primaryHex,
          } as CSSProperties
        }
      >
        <header className="admin-hero-elevate sticky top-0 z-30 border-b border-slate-200/60 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-5 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 text-slate-800 shadow-sm transition-colors hover:bg-slate-50/90 md:hidden"
                aria-expanded={mobileNavOpen}
                aria-controls="admin-mobile-nav"
                aria-label="פתח תפריט ניווט"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-5 w-5 shrink-0" aria-hidden />
              </button>
              <Link
                href="/admin/clients"
                className="admin-subpanel-elevate flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-slate-200/70 bg-white/90 px-2.5 py-1 shadow-sm transition-shadow hover:shadow-md"
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
                <span className="hidden max-w-[10rem] truncate text-start text-sm font-semibold text-slate-900 sm:inline md:max-w-[14rem]">
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
                {showDashboardNav ? (
                <Link
                  href={DASHBOARD_NAV.href}
                  className={navLinkClass(
                    pathname,
                    DASHBOARD_NAV.match(pathname)
                  )}
                >
                  {DASHBOARD_NAV.label}
                </Link>
                ) : null}
                {checkFeature(enabledFeatureCodes, ORG_FEATURE.revenue) ? (
                <Link
                href={REVENUE_NAV.href}
                className={navLinkClass(pathname, REVENUE_NAV.match(pathname))}
              >
                {REVENUE_NAV.label}
              </Link>
              ) : null}
              {checkFeature(enabledFeatureCodes, ORG_FEATURE.settings) ? (
              <Link
                href={SETTINGS_NAV.href}
                title={SETTINGS_NAV.title}
                className={navLinkClass(pathname, settingsMainNavActive)}
              >
                {SETTINGS_NAV.label}
              </Link>
              ) : null}
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
                {showTeamNav && checkFeature(enabledFeatureCodes, ORG_FEATURE.team) ? (
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
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50/90"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">התנתק</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 lg:px-6 lg:py-5">
          <div className="admin-hero-elevate rounded-2xl border border-slate-200/50 bg-white/95 p-5 shadow-slate-900/5 sm:p-6">
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
              className="admin-hero-elevate fixed inset-y-0 start-0 z-50 flex w-[min(100%,15rem)] flex-col border-e border-slate-200/60 bg-white/95 shadow-xl backdrop-blur-sm supports-[backdrop-filter]:bg-white/90"
            >
              <div className="flex items-center justify-between border-b border-slate-200/60 px-3 py-2.5">
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
                {showDashboardNav ? (
                <Link
                  href={DASHBOARD_NAV.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={navLinkClass(
                    pathname,
                    DASHBOARD_NAV.match(pathname),
                    true
                  )}
                >
                  {DASHBOARD_NAV.label}
                </Link>
                ) : null}
                {checkFeature(enabledFeatureCodes, ORG_FEATURE.revenue) ? (
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
                ) : null}
                {checkFeature(enabledFeatureCodes, ORG_FEATURE.settings) ? (
                <Link
                  href={SETTINGS_NAV.href}
                  title={SETTINGS_NAV.title}
                  onClick={() => setMobileNavOpen(false)}
                  className={navLinkClass(pathname, settingsMainNavActive, true)}
                >
                  {SETTINGS_NAV.label}
                </Link>
                ) : null}
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
                {showTeamNav && checkFeature(enabledFeatureCodes, ORG_FEATURE.team) ? (
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
