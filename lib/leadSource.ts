/** מקורות ליד קבועים — תואמים לטופסי לקוח ולסינון דשבורד הכנסות */
export const LEAD_SOURCE_OPTIONS = [
  "פייסבוק",
  "גוגל",
  "המלצה",
  "אורגני",
  "טיקטוק",
  "אחר",
] as const;

export type LeadSourceOption = (typeof LEAD_SOURCE_OPTIONS)[number];

export function isLeadSourceOption(s: string): s is LeadSourceOption {
  return (LEAD_SOURCE_OPTIONS as readonly string[]).includes(s);
}
