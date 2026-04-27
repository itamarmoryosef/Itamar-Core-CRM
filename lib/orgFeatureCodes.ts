/**
 * Feature codes in `public.system_features.code` (see migrations/add_system_features_and_export_v2.sql).
 * Use with checkFeature() / useOrgFeatures() to show or hide admin UI.
 */
export const ORG_FEATURE = {
  revenue: "revenue",
  /** דשבורד /admin/dashboard (או revenue — שניהם פותחים לפי בקשה) */
  dashboard: "dashboard",
  statuses: "statuses",
  customFields: "custom_fields",
  settings: "settings",
  team: "team",
  /** מסכי ספקי לידים (טאב "ספקי לידים" בהגדרות) */
  leadProviders: "lead_providers",
} as const;

export type OrgFeatureCode = (typeof ORG_FEATURE)[keyof typeof ORG_FEATURE];
