"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  publicBrandPrimary,
  publicBrandSecondary,
  publicBusinessName,
  publicBusinessTagline,
  publicBrandLogoUrl,
} from "@/lib/brandingPublic";

export type ClientBranding = {
  businessName: string;
  tagline: string;
  primary: string;
  secondary: string;
  logoUrl: string;
  loaded: boolean;
};

const defaultFromEnv = (): ClientBranding => ({
  businessName: publicBusinessName(),
  tagline: publicBusinessTagline(),
  primary: publicBrandPrimary(),
  secondary: publicBrandSecondary(),
  logoUrl: publicBrandLogoUrl(),
  loaded: false,
});

const Ctx = createContext<ClientBranding | null>(null);

/**
 * Merges DB `settings` (from `/api/public/branding`) with `NEXT_PUBLIC_*` fallbacks in `brandingPublic`.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [b, setB] = useState<ClientBranding>(defaultFromEnv);
  useEffect(() => {
    const run = () => {
      void fetch("/api/public/branding", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Record<string, string> | null) => {
          if (!j || typeof j !== "object") {
            setB((prev) => ({ ...prev, loaded: true }));
            return;
          }
          setB({
            businessName: String(j.businessName || "").trim() || publicBusinessName(),
            tagline: String(j.tagline || "").trim() || publicBusinessTagline(),
            primary: String(j.primary || "").trim() || publicBrandPrimary(),
            secondary: String(j.secondary || "").trim() || publicBrandSecondary(),
            logoUrl: String(j.logoUrl || "").trim() || publicBrandLogoUrl(),
            loaded: true,
          });
        })
        .catch(() => setB((prev) => ({ ...prev, loaded: true })));
    };
    run();
    if (typeof window !== "undefined") {
      window.addEventListener("crm-branding-updated", run);
      window.addEventListener("alentix-branding-updated", run);
      return () => {
        window.removeEventListener("crm-branding-updated", run);
        window.removeEventListener("alentix-branding-updated", run);
      };
    }
    return undefined;
  }, []);
  return <Ctx.Provider value={b}>{children}</Ctx.Provider>;
}

export function useClientBranding(): ClientBranding {
  return useContext(Ctx) ?? defaultFromEnv();
}
