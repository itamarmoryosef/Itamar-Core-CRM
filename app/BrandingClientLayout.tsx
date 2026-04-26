"use client";

import { BrandingProvider } from "@/components/branding/BrandingRoot";

export function BrandingClientLayout({ children }: { children: React.ReactNode }) {
  return <BrandingProvider>{children}</BrandingProvider>;
}
