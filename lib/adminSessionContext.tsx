"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminMeResponse } from "@/app/api/admin/me/route";
import type { ParsedOrgBranding } from "@/lib/orgBranding";

export type AdminActiveOrganization = ParsedOrgBranding & {
  id: string;
  name: string;
  slug: string;
};

export type AdminSessionValue = {
  me: AdminMeResponse | null;
  /** Effective org for shell branding + feature flags (super = active selection). */
  activeOrganization: AdminActiveOrganization | null;
  refresh: () => void;
};

const Ctx = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({
  value,
  children,
}: {
  value: AdminSessionValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminSession(): AdminSessionValue | null {
  return useContext(Ctx);
}
