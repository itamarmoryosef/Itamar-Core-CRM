import { useAdminSession } from "@/lib/adminSessionContext";
import type { OrgFeatureCode } from "@/lib/orgFeatureCodes";

/**
 * Returns whether `featureCode` is enabled for the org.
 * When `enabledCodes` is null/undefined (still loading or API unavailable), returns true
 * so the UI does not flash-hidden and lock users out.
 */
export function checkFeature(
  enabledCodes: string[] | null | undefined,
  featureCode: OrgFeatureCode | string
): boolean {
  if (enabledCodes == null) {
    return true;
  }
  return enabledCodes.includes(featureCode);
}

/** Curried over current admin session: `check("revenue")` */
export function useCheckFeature() {
  const s = useAdminSession();
  const enabledCodes = s?.enabledFeatureCodes ?? null;
  return (featureCode: string) => checkFeature(enabledCodes, featureCode);
}
