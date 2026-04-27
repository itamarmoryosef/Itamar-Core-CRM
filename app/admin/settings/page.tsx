"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Clock,
  Download,
  FileText,
  FileType,
  FileUp,
  LayoutGrid,
  Loader2,
  Image,
  MessageCircle,
  Pencil,
  Rows3,
  Save,
  Send,
  Sparkles,
  Tags,
  Trash2,
  Truck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ResponsiveDataTable,
  type ResponsiveColumnDef,
} from "@/components/ui/ResponsiveDataTable";
import { supabase } from "@/lib/supabase";
import {
  CLIENT_CRM_STATUSES_FALLBACK,
  parseBotEnabledClientCrmStatuses,
  parseCustomClientCrmStatuses,
} from "@/lib/clientCrmStatus";
import {
  randomStorageObjectName,
  sanitizeOriginalFilenameForDb,
  timestampedStorageObjectName,
} from "@/lib/storageKey";
import { resolveAdminOrganizationId, setSuperActiveOrganizationId } from "@/lib/orgContextClient";
import type { AdminMeResponse } from "@/app/api/admin/me/route";
import { useAdminSession } from "@/lib/adminSessionContext";
import { checkFeature } from "@/lib/checkFeature";
import { ORG_FEATURE } from "@/lib/orgFeatureCodes";

type DocumentTypeRow = {
  id: string;
  name: string;
  download_link: string | null;
  blank_form_original_filename: string | null;
  created_at: string;
};

const BLANK_FORM_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const BRANDING_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const BRANDING_LOGO_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

/** `input[type=color]` requires #rrggbb; DB may have #RGB or empty. */
function hexForColorPicker(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) {
    return `#${t.slice(1).toLowerCase()}`;
  }
  if (/^#[0-9A-Fa-f]{3}$/i.test(t)) {
    const a = t.slice(1);
    return `#${a[0]!}${a[0]!}${a[1]!}${a[1]!}${a[2]!}${a[2]!}`.toLowerCase();
  }
  const f = fallback.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(f)) {
    return `#${f.slice(1).toLowerCase()}`;
  }
  return "#6366f1";
}

function guessBlankFormContentType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (n.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

type AgreementDocxTemplateRow = {
  id: string;
  name: string;
  original_filename: string | null;
  storage_path: string;
  created_at: string;
};

type LeadProviderRow = {
  id: string;
  name: string;
  phone: string | null;
  commission_percent: number | string;
  created_at: string;
};

type TeamMemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  commission_percentage?: number;
};

type SettingsRubricKey =
  | "branding"
  | "notifications"
  | "reminders"
  | "leads"
  | "docTypes"
  | "templates"
  | "team";

function isAllowedBlankFormFile(file: File): boolean {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf") || n.endsWith(".docx") || n.endsWith(".doc")) {
    return true;
  }
  const t = file.type;
  return (
    t === "application/pdf" ||
    t === "application/msword" ||
    t ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export default function AdminSettingsPage() {
  const [phone, setPhone] = useState("");
  const [growPaymentBaseUrl, setGrowPaymentBaseUrl] = useState("");
  const [crmStatusesText, setCrmStatusesText] = useState(
    CLIENT_CRM_STATUSES_FALLBACK.join("\n")
  );
  const [newCrmStatus, setNewCrmStatus] = useState("");
  const [botEnabledStatuses, setBotEnabledStatuses] = useState<string[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(true);
  const [phoneLoadError, setPhoneLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [documentTypes, setDocumentTypes] = useState<DocumentTypeRow[]>([]);
  const [dtLoading, setDtLoading] = useState(true);
  const [dtError, setDtError] = useState<string | null>(null);
  const [dtMsg, setDtMsg] = useState<string | null>(null);
  const [dtBusy, setDtBusy] = useState(false);
  const [deletingDtId, setDeletingDtId] = useState<string | null>(null);
  const [newDocTypeFile, setNewDocTypeFile] = useState<File | null>(null);
  const [newDocTypeFileKey, setNewDocTypeFileKey] = useState(0);
  const [dtFileUploadingId, setDtFileUploadingId] = useState<string | null>(
    null
  );

  const [templateMsg, setTemplateMsg] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [agreementTemplates, setAgreementTemplates] = useState<
    AgreementDocxTemplateRow[]
  >([]);
  const [templateInfoLoading, setTemplateInfoLoading] = useState(true);
  const [templateInfoError, setTemplateInfoError] = useState<string | null>(
    null
  );
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(
    null
  );

  const [leadProviders, setLeadProviders] = useState<LeadProviderRow[]>([]);
  const [leadProvidersLoading, setLeadProvidersLoading] = useState(true);
  const [leadProvidersError, setLeadProvidersError] = useState<string | null>(
    null
  );
  const [leadProviderBusy, setLeadProviderBusy] = useState(false);
  const [deletingLeadProviderId, setDeletingLeadProviderId] = useState<
    string | null
  >(null);

  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamForbidden, setTeamForbidden] = useState(false);
  const [editUser, setEditUser] = useState<TeamMemberRow | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "staff">("staff");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editCommissionPct, setEditCommissionPct] = useState("");
  const [teamSaveBusy, setTeamSaveBusy] = useState(false);
  const [activeRubric, setActiveRubric] =
    useState<SettingsRubricKey>("branding");

  const adminSess = useAdminSession();
  const enabledFeatureCodes = adminSess?.enabledFeatureCodes ?? null;
  const rubricButtons = useMemo((): [SettingsRubricKey, string][] => {
    const all: [SettingsRubricKey, string][] = [
      ["branding", "מיתוג"],
      ["notifications", "התראות"],
      ["reminders", "תזכורות"],
      ["leads", "ספקי לידים"],
      ["docTypes", "סוגי מסמכים"],
      ["templates", "תבניות וקודים"],
      ["team", "ניהול צוות"],
    ];
    return all.filter(
      ([k]) => k !== "leads" || checkFeature(enabledFeatureCodes, ORG_FEATURE.leadProviders)
    );
  }, [enabledFeatureCodes]);

  const [brandBusinessName, setBrandBusinessName] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [brandPrimary, setBrandPrimary] = useState("");
  const [brandSecondary, setBrandSecondary] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandSaving, setBrandSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [brandingFileInputKey, setBrandingFileInputKey] = useState(0);

  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [meLoadDone, setMeLoadDone] = useState(false);

  /** לינקים יחידים — אין כפל עם הכותרת; ניווט הועבר מ־AdminShell לכאן */
  const settingsHubItems = useMemo((): {
    href: string;
    label: string;
    hint: string;
    icon: LucideIcon;
  }[] => {
    const items: {
      href: string;
      label: string;
      hint: string;
      icon: LucideIcon;
    }[] = [
      {
        href: "/admin/settings/statuses",
        label: "ניהול סטטוסים",
        hint: "מזהי UUID, צבע, בוט, is_active",
        icon: Tags,
      },
      {
        href: "/admin/settings/fields",
        label: "שדות מותאמים",
        hint: "קבוצות, סוגי שדות, ייבוא Word",
        icon: Rows3,
      },
      {
        href: "/admin/settings/layout",
        label: "פריסת כרטיס לקוח",
        hint: "רשת, שורות, מחיצות, שדות ליבה",
        icon: LayoutGrid,
      },
      {
        href: "/admin/settings/templates",
        label: "מבנה טפסי הסכם (פורטל)",
        hint: "רשת שדות בטפסי פורטל",
        icon: FileType,
      },
    ];
    if (checkFeature(enabledFeatureCodes, ORG_FEATURE.leadProviders)) {
      items.push({
        href: "/admin/settings#leads",
        label: "ספקי לידים",
        hint: "אחוזי עמלה, אנשי קשר",
        icon: Truck,
      });
    }
    items.push({
      href: "/admin/settings/whatsapp",
      label: "חיבור WhatsApp",
      hint: "שירות נפרד, QR, pairing",
      icon: MessageCircle,
    });
    if (
      me?.teamAdmin === true &&
      checkFeature(enabledFeatureCodes, ORG_FEATURE.team)
    ) {
      items.push({
        href: "/admin/team",
        label: "הזמנת חברי צוות",
        hint: "יצירת משתמש + סיסמה ראשונית",
        icon: UserPlus,
      });
    }
    return items;
  }, [enabledFeatureCodes, me?.teamAdmin]);
  const [allOrgs, setAllOrgs] = useState<
    { id: string; name: string; slug: string }[] | null
  >(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    void (async () => {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (!res.ok) {
        if (!c) setMeLoadDone(true);
        return;
      }
      const data = (await res.json()) as AdminMeResponse;
      if (c) return;
      setMe(data);
      if (data.platformSuper) {
        const ores = await fetch("/api/super/organizations", { credentials: "include" });
        if (ores.ok) {
          const oj = (await ores.json()) as {
            organizations: { id: string; name: string; slug: string }[];
          };
          setAllOrgs(oj.organizations);
          setActiveOrgId(
            resolveAdminOrganizationId(
              { platformSuper: true, organizationId: data.organizationId },
              oj.organizations
            ) ?? data.organizationId
          );
        } else {
          setAllOrgs([]);
          setActiveOrgId(data.organizationId);
        }
      } else {
        setAllOrgs(null);
        setActiveOrgId(data.organizationId);
      }
      setMeLoadDone(true);
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash?.replace(/^#/, "");
    if (
      h === "branding" ||
      h === "notifications" ||
      h === "reminders" ||
      h === "leads" ||
      h === "docTypes" ||
      h === "templates" ||
      h === "team"
    ) {
      setActiveRubric(h);
      return;
    }
    const saved = window.localStorage.getItem("admin-settings-active-rubric");
    if (
      saved === "branding" ||
      saved === "notifications" ||
      saved === "reminders" ||
      saved === "leads" ||
      saved === "docTypes" ||
      saved === "templates" ||
      saved === "team"
    ) {
      setActiveRubric(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("admin-settings-active-rubric", activeRubric);
  }, [activeRubric]);

  useEffect(() => {
    if (
      activeRubric === "leads" &&
      !checkFeature(enabledFeatureCodes, ORG_FEATURE.leadProviders)
    ) {
      setActiveRubric("branding");
    }
  }, [activeRubric, enabledFeatureCodes]);

  function agreementTemplatePublicUrl(storagePath: string): string {
    const { data } = supabase.storage
      .from("documents-templates")
      .getPublicUrl(storagePath);
    return data.publicUrl;
  }

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [reminderTriggerBusy, setReminderTriggerBusy] = useState(false);

  const runRemindersNow = async () => {
    setReminderTriggerBusy(true);
    try {
      const res = await fetch("/api/admin/trigger-reminders", {
        method: "POST",
        credentials: "include",
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setToast({
          type: "error",
          message:
            typeof data.error === "string"
              ? data.error
              : "הפעלת תזכורות נכשלה",
        });
        return;
      }
      const sched = data.scheduledProcessed ?? 0;
      const manual = data.manualClientProcessed ?? 0;
      const auto = data.processed ?? 0;
      setToast({
        type: "success",
        message: `תזכורות הורצו מהשרת: מתוזמנות ${String(sched)}, ידני (מועד בלקוח) ${String(manual)}, אוטומטי מסמכים ${String(auto)}.`,
      });
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setReminderTriggerBusy(false);
    }
  };

  const loadSettingsPhone = useCallback(async () => {
    setPhoneLoadError(null);
    setPhoneLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      const data = (await res.json()) as {
        admin_notification_phone?: string;
        grow_payment_base_url?: string;
        client_crm_statuses?: string[];
        client_crm_bot_enabled_statuses?: string[];
        branding_business_name?: string;
        branding_tagline?: string;
        branding_primary?: string;
        branding_secondary?: string;
        branding_logo_url?: string;
        error?: string;
      };
      if (!res.ok) {
        setPhoneLoadError(data.error ?? "טעינה נכשלה");
        return;
      }
      setPhone(data.admin_notification_phone ?? "");
      setGrowPaymentBaseUrl(data.grow_payment_base_url ?? "");
      const statuses = parseCustomClientCrmStatuses(
        Array.isArray(data.client_crm_statuses)
          ? data.client_crm_statuses.join("\n")
          : ""
      );
      setCrmStatusesText(statuses.join("\n"));
      const botStatuses = parseBotEnabledClientCrmStatuses(
        Array.isArray(data.client_crm_bot_enabled_statuses)
          ? data.client_crm_bot_enabled_statuses.join("\n")
          : "",
        statuses
      );
      setBotEnabledStatuses(botStatuses);
      setBrandBusinessName(data.branding_business_name ?? "");
      setBrandTagline(data.branding_tagline ?? "");
      setBrandPrimary(data.branding_primary ?? "");
      setBrandSecondary(data.branding_secondary ?? "");
      setBrandLogoUrl(data.branding_logo_url ?? "");
    } catch {
      setPhoneLoadError("שגיאת רשת");
    } finally {
      setPhoneLoading(false);
    }
  }, []);

  const loadAgreementDocxTemplates = useCallback(async () => {
    setTemplateInfoLoading(true);
    setTemplateInfoError(null);
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, original_filename, storage_path, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    setTemplateInfoLoading(false);
    if (error) {
      setAgreementTemplates([]);
      setTemplateInfoError(error.message);
      setToast({
        type: "error",
        message: `טעינת תבניות נכשלה: ${error.message}`,
      });
      return;
    }
    const rows = (data ?? []) as AgreementDocxTemplateRow[];
    setAgreementTemplates(rows.filter((r) => r.storage_path?.trim()));
  }, []);

  useEffect(() => {
    void loadAgreementDocxTemplates();
  }, [loadAgreementDocxTemplates]);

  const loadDocumentTypes = useCallback(async () => {
    setDtLoading(true);
    setDtError(null);
    const { data, error } = await supabase
      .from("document_types")
      .select(
        "id, name, download_link, blank_form_original_filename, created_at"
      )
      .order("created_at", { ascending: true });

    setDtLoading(false);
    if (error) {
      setDtError(error.message);
      setDocumentTypes([]);
      return;
    }
    setDocumentTypes((data ?? []) as DocumentTypeRow[]);
  }, []);

  useEffect(() => {
    void loadSettingsPhone();
  }, [loadSettingsPhone]);

  useEffect(() => {
    void loadDocumentTypes();
  }, [loadDocumentTypes]);

  const loadLeadProviders = useCallback(async () => {
    if (!meLoadDone) return;
    setLeadProvidersLoading(true);
    setLeadProvidersError(null);
    const { loadLeadProviderRows } = await import(
      "@/lib/leadProvidersClientQuery"
    );
    const { data, error } = await loadLeadProviderRows(supabase, {
      organizationId: activeOrgId,
    });
    setLeadProvidersLoading(false);
    if (error) {
      setLeadProviders([]);
      setLeadProvidersError(error.message);
      return;
    }
    setLeadProviders(data as LeadProviderRow[]);
  }, [activeOrgId, meLoadDone]);

  useEffect(() => {
    void loadLeadProviders();
  }, [loadLeadProviders]);

  const loadTeamMembers = useCallback(async () => {
    setTeamError(null);
    setTeamForbidden(false);
    setTeamLoading(true);
    try {
      const res = await fetch("/api/admin/team", { credentials: "include" });
      const data = (await res.json()) as {
        members?: TeamMemberRow[];
        error?: string;
      };
      if (res.status === 403) {
        setTeamForbidden(true);
        setTeamMembers([]);
        return;
      }
      if (!res.ok) {
        setTeamError(data.error ?? "טעינת משתמשים נכשלה");
        setTeamMembers([]);
        return;
      }
      setTeamMembers(data.members ?? []);
    } catch {
      setTeamError("שגיאת רשת");
      setTeamMembers([]);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeamMembers();
  }, [loadTeamMembers]);

  const crmStatusesList = useMemo(
    () => parseCustomClientCrmStatuses(crmStatusesText),
    [crmStatusesText]
  );

  const setCrmStatusesList = useCallback((list: string[]) => {
    setCrmStatusesText(list.join("\n"));
  }, []);

  useEffect(() => {
    setBotEnabledStatuses((prev) =>
      parseBotEnabledClientCrmStatuses(prev.join("\n"), crmStatusesList)
    );
  }, [crmStatusesList]);

  const addCustomStatus = () => {
    const candidate = newCrmStatus.trim();
    if (!candidate) return;
    if (crmStatusesList.includes(candidate)) {
      setNewCrmStatus("");
      return;
    }
    setCrmStatusesList([...crmStatusesList, candidate]);
    setNewCrmStatus("");
  };

  const removeCustomStatus = (statusToRemove: string) => {
    const next = crmStatusesList.filter((s) => s !== statusToRemove);
    setCrmStatusesList(next);
    setBotEnabledStatuses((prev) => prev.filter((s) => s !== statusToRemove));
  };

  const openEditUser = (m: TeamMemberRow) => {
    setEditUser(m);
    setEditFullName(m.full_name?.trim() ?? "");
    setEditEmail(m.email?.trim() ?? "");
    setEditRole(m.role === "admin" ? "admin" : "staff");
    setEditNewPassword("");
    const cp = Number(m.commission_percentage);
    setEditCommissionPct(Number.isFinite(cp) ? String(cp) : "0");
  };

  const closeEditUser = () => {
    setEditUser(null);
    setEditNewPassword("");
    setEditCommissionPct("");
  };

  const handleSaveTeamUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editUser) return;
    const pctRaw = editCommissionPct.trim().replace(",", ".");
    const commission_percentage =
      pctRaw === "" ? 0 : Number(pctRaw);
    if (!Number.isFinite(commission_percentage) || commission_percentage < 0 || commission_percentage > 100) {
      setToast({
        type: "error",
        message: "אחוז עמלה חייב להיות מספר בין 0 ל־100.",
      });
      return;
    }
    setTeamSaveBusy(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editUser.id,
          full_name: editFullName,
          email: editEmail.trim(),
          role: editRole,
          commission_percentage,
          new_password: editNewPassword.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error ?? "שמירה נכשלה",
        });
        return;
      }
      setToast({ type: "success", message: "המשתמש עודכן." });
      closeEditUser();
      void loadTeamMembers();
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setTeamSaveBusy(false);
    }
  };

  const handleAddLeadProvider = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("lp_name") ?? "").trim();
    const phone = String(fd.get("lp_phone") ?? "").trim() || null;
    const pctRaw = String(fd.get("lp_commission") ?? "").trim();
    const commission_percent = pctRaw === "" ? 0 : Number(pctRaw.replace(",", "."));
    if (!name) {
      setToast({ type: "error", message: "יש להזין שם ספק." });
      return;
    }
    if (!Number.isFinite(commission_percent) || commission_percent < 0 || commission_percent > 100) {
      setToast({
        type: "error",
        message: "אחוז עמלה חייב להיות מספר בין 0 ל־100.",
      });
      return;
    }
    if (!activeOrgId) {
      setToast({ type: "error", message: "לא הוגדר ארגון. רענן או בחר ארגון." });
      return;
    }
    setLeadProviderBusy(true);
    const { error: insErr } = await supabase.from("lead_providers").insert({
      name,
      phone,
      commission_percent,
      organization_id: activeOrgId,
    });
    setLeadProviderBusy(false);
    if (insErr) {
      setToast({
        type: "error",
        message:
          insErr.code === "23505"
            ? "כבר קיים ספק בשם הזה."
            : insErr.message,
      });
      return;
    }
    form.reset();
    setToast({ type: "success", message: "הספק נוסף." });
    void loadLeadProviders();
  };

  const handleDeleteLeadProvider = async (row: LeadProviderRow) => {
    if (
      !window.confirm(
        `למחוק את הספק "${row.name}"? רשומות לקוחות קיימות ימשיכו לשמור את שם הספק כטקסט.`
      )
    ) {
      return;
    }
    setDeletingLeadProviderId(row.id);
    const { error: delErr } = await supabase
      .from("lead_providers")
      .delete()
      .eq("id", row.id);
    setDeletingLeadProviderId(null);
    if (delErr) {
      setToast({ type: "error", message: delErr.message });
      return;
    }
    setToast({ type: "success", message: "הספק נמחק." });
    void loadLeadProviders();
  };

  const saveBrandingToApi = useCallback(
    async (opts?: { overrideLogoUrl?: string }) => {
      const logo = opts?.overrideLogoUrl ?? brandLogoUrl;
      setBrandSaving(true);
      try {
        const res = await fetch("/api/admin/settings", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branding_business_name: brandBusinessName,
            branding_tagline: brandTagline,
            branding_primary: brandPrimary,
            branding_secondary: brandSecondary,
            branding_logo_url: logo,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setToast({ type: "error", message: data.error ?? "שמירת מיתוג נכשלה" });
          return;
        }
        if (opts?.overrideLogoUrl !== undefined) {
          setBrandLogoUrl(opts.overrideLogoUrl);
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("crm-branding-updated"));
          window.dispatchEvent(new Event("alentix-branding-updated"));
        }
        setToast({ type: "success", message: "המיתוג נשמור. הממשקים הפתוחים יתעדכנו בלי רענון מלא." });
      } catch {
        setToast({ type: "error", message: "שגיאת רשת" });
      } finally {
        setBrandSaving(false);
      }
    },
    [brandBusinessName, brandTagline, brandPrimary, brandSecondary, brandLogoUrl]
  );

  const handleSaveBranding = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void saveBrandingToApi();
  };

  const handleBrandingLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setBrandingFileInputKey((k) => k + 1);
    if (!file) return;
    if (!activeOrgId) {
      setToast({ type: "error", message: "יש לבחור/לזהות ארגון (חוסר organization_id)." });
      return;
    }
    const mime = (file.type || "").toLowerCase();
    const extOk = /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
    if (mime && !BRANDING_LOGO_MIME.has(mime) && !extOk) {
      setToast({ type: "error", message: "פורמט: PNG, JPEG, WebP, GIF או SVG בלבד." });
      return;
    }
    if (!mime && !extOk) {
      setToast({ type: "error", message: "בחרו קובץ תמונה (למשל .png או .svg)." });
      return;
    }
    if (file.size > BRANDING_LOGO_MAX_BYTES) {
      setToast({ type: "error", message: "הקובץ גדול מדי (מקסימום 2MB)." });
      return;
    }
    setLogoUploading(true);
    try {
      const object = randomStorageObjectName(file.name);
      const path = `branding/${activeOrgId}/${object}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: mime
            ? file.type
            : "application/octet-stream",
        });
      if (upErr) {
        if (
          upErr.message?.toLowerCase().includes("bucket") ||
          upErr.message?.toLowerCase().includes("not found")
        ) {
          setToast({
            type: "error",
            message: `${upErr.message} — ב-Supabase הריצו את migrations/add_branding_storage_bucket.sql`,
          });
        } else {
          setToast({ type: "error", message: upErr.message });
        }
        return;
      }
      const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      if (!publicUrl) {
        setToast({ type: "error", message: "לא התקבל URL ציבורי ללוגו" });
        return;
      }
      await saveBrandingToApi({ overrideLogoUrl: publicUrl });
    } catch {
      setToast({ type: "error", message: "העלאה נכשלה" });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSavePhone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_notification_phone: phone.trim(),
          grow_payment_base_url: growPaymentBaseUrl.trim(),
          client_crm_statuses: crmStatusesText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          client_crm_bot_enabled_statuses: botEnabledStatuses,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error ?? "שמירה נכשלה",
        });
        return;
      }
      setToast({ type: "success", message: "ההגדרות נשמרו בהצלחה." });
    } catch {
      setToast({ type: "error", message: "שגיאת רשת" });
    } finally {
      setSaving(false);
    }
  };

  const uploadBlankFormAndSaveLink = async (
    documentTypeId: string,
    file: File
  ): Promise<{ ok: true; publicUrl: string } | { ok: false; message: string }> => {
    if (!isAllowedBlankFormFile(file)) {
      return {
        ok: false,
        message: "ניתן להעלות קבצי PDF או Word בלבד (.pdf, .doc, .docx).",
      };
    }

    const objectName = timestampedStorageObjectName(file.name);
    const path = `document-types/${documentTypeId}/${objectName}`;
    const contentType = guessBlankFormContentType(file);

    const { error: upErr } = await supabase.storage
      .from("templates")
      .upload(path, file, {
        contentType,
        upsert: false,
      });

    if (upErr) {
      return {
        ok: false,
        message: `העלאה נכשלה: ${upErr.message}. ודאו שקיים באקט׳ Storage בשם templates והרשאות מתאימות.`,
      };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("templates").getPublicUrl(path);

    const { error: dbErr } = await supabase
      .from("document_types")
      .update({
        download_link: publicUrl,
        blank_form_original_filename: file.name,
      })
      .eq("id", documentTypeId);

    if (dbErr) {
      return {
        ok: false,
        message: `הקובץ הועלה אך עדכון הקישור נכשל: ${dbErr.message}`,
      };
    }

    return { ok: true, publicUrl };
  };

  const handleAddDocumentType = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDtMsg(null);
    setDtBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("dt_name") ?? "").trim();

    if (!name) {
      setDtMsg("יש להזין שם למסמך.");
      setDtBusy(false);
      return;
    }

    if (newDocTypeFile && !isAllowedBlankFormFile(newDocTypeFile)) {
      setDtMsg("ניתן לצרף קבצי PDF או Word בלבד (.pdf, .doc, .docx).");
      setDtBusy(false);
      return;
    }

    const { data: inserted, error } = await supabase
      .from("document_types")
      .insert({ name, download_link: null })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      setDtBusy(false);
      setDtMsg(`שגיאה: ${error?.message ?? "לא נוצרה רשומה"}`);
      return;
    }

    const newId = inserted.id as string;

    if (newDocTypeFile) {
      const result = await uploadBlankFormAndSaveLink(newId, newDocTypeFile);
      setDtBusy(false);
      if (!result.ok) {
        setToast({ type: "error", message: result.message });
        setDtMsg("סוג המסמך נוסף ללא קובץ טופס — ניתן להעלות קובץ מהטבלה.");
        form.reset();
        setNewDocTypeFile(null);
        setNewDocTypeFileKey((k) => k + 1);
        void loadDocumentTypes();
        return;
      }
      setToast({ type: "success", message: "סוג המסמך נוסף והטופס הועלה." });
      form.reset();
      setNewDocTypeFile(null);
      setNewDocTypeFileKey((k) => k + 1);
      void loadDocumentTypes();
      return;
    }

    setDtBusy(false);
    form.reset();
    setNewDocTypeFile(null);
    setNewDocTypeFileKey((k) => k + 1);
    setDtMsg("סוג המסמך נוסף.");
    void loadDocumentTypes();
  };

  const handleExistingDocTypeBlankForm = async (
    documentTypeId: string,
    fileList: FileList | null
  ) => {
    const file = fileList?.[0];
    if (!file) return;

    setDtFileUploadingId(documentTypeId);
    const result = await uploadBlankFormAndSaveLink(documentTypeId, file);
    setDtFileUploadingId(null);

    if (!result.ok) {
      setToast({ type: "error", message: result.message });
      return;
    }
    setToast({ type: "success", message: "הקובץ הועלה והקישור עודכן." });
    void loadDocumentTypes();
  };

  const handleDeleteDocumentType = async (id: string) => {
    setDtMsg(null);
    setDeletingDtId(id);
    const { error } = await supabase.from("document_types").delete().eq("id", id);
    setDeletingDtId(null);
    if (error) {
      setDtMsg(`מחיקה נכשלה: ${error.message}`);
      return;
    }
    setDtMsg("הסוג נמחק.");
    void loadDocumentTypes();
  };

  const handleTemplateUpload = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".docx")) {
        setTemplateMsg("יש להעלות קובץ ‎.docx בלבד.");
        return;
      }

      setTemplateMsg(null);
      setTemplateBusy(true);

      const path = `active/${crypto.randomUUID()}.docx`;

      const { error: upErr } = await supabase.storage
        .from("documents-templates")
        .upload(path, file, {
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: false,
        });

      if (upErr) {
        setTemplateMsg(
          `העלאה נכשלה: ${upErr.message}. ודאו שקיים באקט׳ documents-templates והרשאות.`
        );
        setTemplateBusy(false);
        return;
      }

      const safeOriginal = sanitizeOriginalFilenameForDb(file.name).replace(
        /\s+/g,
        "_"
      );
      const withExt =
        safeOriginal.toLowerCase().endsWith(".docx") && safeOriginal.length > 0
          ? safeOriginal
          : safeOriginal
            ? `${safeOriginal.replace(/\.docx$/i, "")}.docx`
            : "";
      const templateName = withExt || "תבנית הסכם פעילה.docx";

      const { error: insErr } = await supabase.from("templates").insert({
        name: templateName,
        storage_path: path,
        original_filename: templateName,
        is_active: true,
      });

      setTemplateBusy(false);
      if (insErr) {
        setTemplateMsg(`שמירת רשומה נכשלה: ${insErr.message}`);
        return;
      }
      setTemplateMsg("התבנית נוספה לרשימה (התבניות הקודמות נשארות במערכת).");
      void loadAgreementDocxTemplates();
    },
    [loadAgreementDocxTemplates]
  );

  const handleDeleteAgreementTemplate = async (row: AgreementDocxTemplateRow) => {
    if (
      !window.confirm(
        `למחוק את התבנית "${row.original_filename?.trim() || row.name}" מהמערכת? פעולה זו תמחק גם את הקובץ באחסון.`
      )
    ) {
      return;
    }
    setDeletingTemplateId(row.id);
    setTemplateMsg(null);
    try {
      const p = row.storage_path?.trim();
      const { error: delErr } = await supabase
        .from("templates")
        .delete()
        .eq("id", row.id);
      if (delErr) {
        setTemplateMsg(`מחיקת רשומה נכשלה: ${delErr.message}`);
        return;
      }
      if (p) {
        const { error: rmErr } = await supabase.storage
          .from("documents-templates")
          .remove([p]);
        if (rmErr) {
          setTemplateMsg(
            `הרשומה הוסרה; מחיקת הקובץ באחסון נכשלה: ${rmErr.message}`
          );
        }
      }
      setToast({ type: "success", message: "התבנית נמחקה." });
      void loadAgreementDocxTemplates();
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const cardClass =
    "rounded-xl border border-slate-100 bg-white p-5 shadow-sm";
  const btnPrimary =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:pointer-events-none disabled:opacity-50";
  const btnSecondary =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50";
  const embedCodes = [
    { code: "[[full_name]]", label: "שם מלא" },
    { code: "[[id_number]]", label: "תעודת זהות" },
    { code: "[[fee_upfront]]", label: "תשלום לפני" },
    { code: "[[fee_success]]", label: "תשלום אחרי" },
    { code: "[[date]]", label: "תאריך" },
  ] as const;
  const leadProviderColumns = useMemo(
    (): ResponsiveColumnDef<LeadProviderRow>[] => [
      {
        id: "name",
        header: "שם",
        cell: (row) => row.name,
        tdClassName: "font-medium text-neutral-900 dark:text-neutral-100",
      },
      {
        id: "phone",
        header: "טלפון",
        cell: (row) => (
          <span dir="ltr">{row.phone?.trim() || "—"}</span>
        ),
        tdClassName: "text-neutral-700 dark:text-neutral-300",
      },
      {
        id: "commission",
        header: "%",
        cell: (row) => {
          const pct = Number(row.commission_percent);
          return Number.isFinite(pct)
            ? pct.toLocaleString("he-IL", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })
            : "—";
        },
        tdClassName: "tabular-nums text-neutral-800 dark:text-neutral-200",
      },
    ],
    []
  );

  const teamMemberColumns = useMemo(
    (): ResponsiveColumnDef<TeamMemberRow>[] => [
      {
        id: "full_name",
        header: "שם מלא",
        cell: (m) => m.full_name?.trim() || "—",
        tdClassName: "font-medium text-neutral-900 dark:text-neutral-100",
      },
      {
        id: "email",
        header: "אימייל",
        cell: (m) => (
          <span dir="ltr">{m.email || "—"}</span>
        ),
        tdClassName: "text-neutral-700 dark:text-neutral-300",
      },
      {
        id: "role",
        header: "תפקיד",
        cell: (m) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              m.role === "admin"
                ? "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200"
                : "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
            }`}
          >
            {m.role === "admin" ? "מנהל" : "צוות"}
          </span>
        ),
      },
      {
        id: "commission_pct",
        header: "עמלה %",
        cell: (m) => {
          const n = Number(m.commission_percentage);
          return Number.isFinite(n)
            ? `${n.toLocaleString("he-IL", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}%`
            : "—";
        },
        tdClassName: "tabular-nums text-neutral-800 dark:text-neutral-200",
      },
      {
        id: "created",
        header: "נוצר",
        cell: (m) => {
          try {
            return new Date(m.created_at).toLocaleDateString("he-IL");
          } catch {
            return m.created_at;
          }
        },
        tdClassName: "text-neutral-600 dark:text-neutral-400",
      },
    ],
    []
  );

  return (
    <div className="space-y-6" dir="rtl">
        {toast ? (
          <div
            role="status"
            className={`fixed start-4 top-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        <header className="border-b border-slate-200/80 pb-5">
          <p className="text-start text-xs font-medium uppercase tracking-wide text-slate-500">
            ניהול
          </p>
          <h1 className="mt-1 text-start text-xl font-bold tracking-tight text-slate-900">
            הגדרות מערכת
          </h1>
          <p className="mt-1.5 text-start text-sm text-slate-600">
            דפים מובנים (למעלה) ואז — הגדרות כלליות באותו דף (לשוניות). אין
            כפל עם תפריט העל.
          </p>
        </header>

        <section
          className="rounded-2xl border border-slate-200/70 bg-slate-50/40 p-4 sm:p-5"
          aria-label="הגדרות — דפים ייעודיים"
        >
          <h2 className="text-start text-sm font-semibold text-slate-800">
            דפי הגדרה (מבנה CRM, מסמכים, חיבורים)
          </h2>
          <p className="mt-0.5 text-start text-xs text-slate-600">
            בחרו אזור — מעבר ישיר, ללא כפילויות.
          </p>
          <ul className="mt-3 grid list-none gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {settingsHubItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    className="group flex h-full min-h-[4.25rem] flex-col justify-between gap-1 rounded-xl border border-slate-200/80 bg-white p-3.5 text-start shadow-sm transition hover:border-slate-300/90 hover:shadow admin-subpanel-elevate"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm font-semibold text-slate-900 group-hover:text-brand">
                        {item.label}
                      </span>
                      <span className="shrink-0 rounded-lg border border-slate-100 bg-slate-50 p-1.5 text-slate-600 group-hover:text-brand">
                        <Icon
                          className="h-4 w-4"
                          aria-hidden
                        />
                      </span>
                    </span>
                    <span className="line-clamp-2 text-start text-xs text-slate-500">
                      {item.hint}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="settings-rubrics-heading" className="space-y-2">
          <div>
            <h2
              id="settings-rubrics-heading"
              className="text-start text-sm font-semibold text-slate-800"
            >
              הגדרות כלליות (לשוניות)
            </h2>
            <p className="text-start text-xs text-slate-500">
              מיתוג, התראות, תזכורות, סוגי מסמכים, תבניות Word, לידים (אם
              הופעל) וניהול צוות (עריכה מלאה).
            </p>
          </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {rubricButtons.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveRubric(key);
                  if (typeof window !== "undefined") {
                    window.location.hash = key;
                  }
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  activeRubric === key
                    ? "bg-brand text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-neutral-700 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {activeRubric === "branding" ? (
            <section
              id="branding"
              className={cardClass + " lg:col-span-2"}
              aria-labelledby="branding-h"
            >
              <div className="flex items-center gap-2">
                <Sparkles
                  className="h-5 w-5 shrink-0 text-brand"
                  aria-hidden
                />
                <h2
                  id="branding-h"
                  className="text-start text-base font-semibold text-neutral-900"
                >
                  מותג ומראה
                </h2>
              </div>
              <p className="mt-2 text-start text-sm text-neutral-600">
                הערכים כאן נשמרים במסד (טבלת <code className="rounded bg-neutral-100 px-1">settings</code>
                ) ומוצגים בפורטל הלקוח, ב־PDF ובהודעות WhatsApp. אם שדה ריק — נעשה שימוש ב־<code className="rounded bg-neutral-100 px-1">NEXT_PUBLIC_*</code> מההטמעה.
              </p>
              <form
                onSubmit={(e) => void handleSaveBranding(e)}
                className="mt-4 grid gap-4 sm:grid-cols-2"
              >
                <label className="grid gap-1.5 text-start text-sm sm:col-span-2">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">שם עסק / מותג</span>
                  <input
                    type="text"
                    value={brandBusinessName}
                    onChange={(e) => setBrandBusinessName(e.target.value)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    placeholder="שם העסק"
                    autoComplete="organization"
                  />
                </label>
                <label className="grid gap-1.5 text-start text-sm sm:col-span-2">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">שורת משנה (תת־כותרת)</span>
                  <input
                    type="text"
                    value={brandTagline}
                    onChange={(e) => setBrandTagline(e.target.value)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <div className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">צבע ראשי</span>
                  <div
                    className="flex flex-wrap items-center gap-2 [direction:ltr] sm:max-w-sm"
                    dir="ltr"
                  >
                    <input
                      type="color"
                      value={hexForColorPicker(brandPrimary, "#0f172a")}
                      onChange={(e) => setBrandPrimary(e.target.value.toLowerCase())}
                      className="h-10 w-12 shrink-0 cursor-pointer rounded border border-neutral-300 bg-white p-0.5 dark:border-neutral-600"
                      title="בחירת צבע"
                      aria-label="בחירת צבע ראשי"
                    />
                    <input
                      type="text"
                      value={brandPrimary}
                      onChange={(e) => setBrandPrimary(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-neutral-50/80 px-2.5 py-1.5 font-mono text-xs text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                      placeholder="#0f172a"
                      spellCheck={false}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">צבע משני</span>
                  <div
                    className="flex flex-wrap items-center gap-2 [direction:ltr] sm:max-w-sm"
                    dir="ltr"
                  >
                    <input
                      type="color"
                      value={hexForColorPicker(brandSecondary, "#2563eb")}
                      onChange={(e) => setBrandSecondary(e.target.value.toLowerCase())}
                      className="h-10 w-12 shrink-0 cursor-pointer rounded border border-neutral-300 bg-white p-0.5 dark:border-neutral-600"
                      title="בחירת צבע"
                      aria-label="בחירת צבע משני"
                    />
                    <input
                      type="text"
                      value={brandSecondary}
                      onChange={(e) => setBrandSecondary(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-neutral-50/80 px-2.5 py-1.5 font-mono text-xs text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                      placeholder="#2563eb"
                      spellCheck={false}
                    />
                  </div>
                </div>
                <p className="text-start text-xs text-neutral-500 dark:text-neutral-400 sm:col-span-2">
                  צבעים: בוחרים בלוח הצבע; שדה ה־# לעריכה מדויקת או הדבקה ממדריך מותג — אופציונלי.
                </p>
                <div className="grid gap-2 text-start text-sm sm:col-span-2">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    לוגו
                  </span>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    מומלץ: העלאת קובץ (נשמר ב-Supabase Storage, נגיש ב־URL ציבורי). לחלופין אפשר להשאיר/להזין
                    URL חיצוני (CDN, אתר) — מערכת הקוד הישנה הייתה URL בלבד כי אין אחסון בלי שירות
                    (כעת: bucket <code className="rounded bg-neutral-100 px-0.5 dark:bg-neutral-800">branding</code>).
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      key={brandingFileInputKey}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
                      id="branding-logo-upload"
                      className="sr-only"
                      onChange={(e) => void handleBrandingLogoFile(e)}
                      disabled={logoUploading}
                    />
                    <label
                      htmlFor="branding-logo-upload"
                      className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {logoUploading ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Image className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      העלאת לוגו
                    </label>
                    {brandLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user preview of arbitrary tenant URL
                      <img
                        src={brandLogoUrl}
                        alt="תצוגה מקדימה"
                        className="h-10 max-w-[10rem] object-contain"
                      />
                    ) : null}
                  </div>
                </div>
                <label className="grid gap-1.5 text-start text-sm sm:col-span-2">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">או: URL ללוגו (אופציונלי)</span>
                  <input
                    type="url"
                    dir="ltr"
                    value={brandLogoUrl}
                    onChange={(e) => setBrandLogoUrl(e.target.value)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    placeholder="https://…/logo.png"
                    autoComplete="off"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={brandSaving || logoUploading}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {brandSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    שמור מיתוג
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {activeRubric === "notifications" ? (
          <section id="notifications" className={cardClass} aria-labelledby="notif-phone-h">
            <div className="flex items-center gap-2">
              <Bell
                className="h-5 w-5 shrink-0 text-brand"
                aria-hidden
              />
              <h2
                id="notif-phone-h"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
              >
                התראות
              </h2>
            </div>

            {phoneLoading ? (
              <div className="mt-6 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <span className="text-sm">טוען…</span>
              </div>
            ) : phoneLoadError ? (
              <p
                className="mt-4 text-start text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {phoneLoadError}
              </p>
            ) : (
              <form
                onSubmit={(ev) => void handleSavePhone(ev)}
                className="mt-6 space-y-4"
              >
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    מספר טלפון לקבלת עדכונים (סיום העלאת מסמכים)
                  </span>
                  <input
                    type="tel"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder="0501234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    נשמר ב־<code className="rounded bg-neutral-200/80 px-1 dark:bg-neutral-800">settings.admin_notification_phone</code>
                    — שליחה ב-WhatsApp (שירות ה-Bridge) כשלקוח מסיים העלאות או שליחת בקשה מלאה בפורטל.
                  </span>
                </label>
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    קישור בסיס Grow (אופציונלי)
                  </span>
                  <input
                    type="url"
                    dir="ltr"
                    placeholder="https://…"
                    value={growPaymentBaseUrl}
                    onChange={(e) => setGrowPaymentBaseUrl(e.target.value)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>
                <div className="rounded-xl border border-brand-soft bg-brand-soft p-4 text-start">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    שלבי ה־CRM (מזהי UUID)
                  </h3>
                  <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                    מקור האמת לתצוגה ולכרטיס לקוח: טבלת{" "}
                    <code className="rounded bg-white/90 px-1 font-mono text-[11px] dark:bg-neutral-900/90">client_statuses</code>
                    . ניתן לנהל צבעים, סדר, בוט ו־<code className="font-mono">is_active</code>{" "}
                    במסך הייעודי.
                  </p>
                  <Link
                    href="/admin/settings/statuses"
                    className="mt-3 inline-flex w-full min-h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90"
                  >
                    <Tags className="h-4 w-4 shrink-0" aria-hidden />
                    ניהול סטטוסים ובוט
                  </Link>
                </div>
                <label className="grid gap-1.5 text-start text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    סטטוסי לקוח לבחירה (שורה לכל סטטוס)
                  </span>
                  <textarea
                    rows={7}
                    value={crmStatusesText}
                    onChange={(e) => setCrmStatusesText(e.target.value)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    ניתן להוסיף/לערוך סטטוסים חופשי. סטטוסים מערכתיים קריטיים
                    לחתימה נשמרים אוטומטית.
                  </span>
                </label>
                <fieldset className="grid gap-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-700 dark:bg-neutral-950/40">
                  <legend className="px-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    בניית סטטוסים
                  </legend>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={newCrmStatus}
                      onChange={(e) => setNewCrmStatus(e.target.value)}
                      placeholder="הכנס סטטוס חדש"
                      className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={addCustomStatus}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-brand-soft bg-brand-soft px-3 text-sm font-semibold text-neutral-900 hover:bg-brand-soft"
                    >
                      הוסף סטטוס
                    </button>
                  </div>
                  <div className="grid gap-2">
                    {crmStatusesList.map((status) => (
                      <div
                        key={`status-row-${status}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                          {status}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCustomStatus(status)}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                        >
                          הסר
                        </button>
                      </div>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="grid gap-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-700 dark:bg-neutral-950/40">
                  <legend className="px-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    שליחת הודעות בוט לפי סטטוס (V)
                  </legend>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    רק סטטוסים שמסומנים כאן יקבלו תזכורות בוט אוטומטיות.
                  </p>
                  <div className="grid gap-2">
                    {crmStatusesList.map((status) => {
                      const checked = botEnabledStatuses.includes(status);
                      return (
                        <label
                          key={status}
                          className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                        >
                          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                            {status}
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextChecked = e.target.checked;
                              setBotEnabledStatuses((prev) => {
                                if (nextChecked) {
                                  return prev.includes(status)
                                    ? prev
                                    : [...prev, status];
                                }
                                return prev.filter((s) => s !== status);
                              });
                            }}
                            className="h-4 w-4 rounded border-neutral-400 text-brand ring-brand focus:ring-2"
                            aria-label={`שליחת בוט לסטטוס ${status}`}
                          />
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <button type="submit" disabled={saving} className={btnPrimary}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      שומר…
                    </>
                  ) : (
                    "שמור"
                  )}
                </button>
              </form>
            )}
          </section>
          ) : null}

          {activeRubric === "reminders" ? (
          <section className={cardClass} aria-labelledby="cron-reminders-h">
            <div className="flex items-center gap-2">
              <Clock
                className="h-5 w-5 shrink-0 text-brand"
                aria-hidden
              />
              <h2
                id="cron-reminders-h"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
              >
                תזכורות WhatsApp (קרון)
              </h2>
            </div>
            <p className="mt-3 text-start text-sm text-neutral-600 dark:text-neutral-400">
              תזכורות מתוזמנות ותזכורת ידנית לפי מועד בלקוח נשלחות כשהקרון רץ
              ב־Vercel. אם משהו לא יוצא, אפשר להריץ את אותו תהליך מיד מהכפתור
              (דורש שירות WhatsApp, WHATSAPP_SERVICE_URL/TOKEN, ו־SUPABASE_SERVICE_ROLE_KEY בשרת).
            </p>
            <button
              type="button"
              disabled={reminderTriggerBusy}
              onClick={() => void runRemindersNow()}
              className="mt-4 inline-flex h-9 min-h-9 items-center gap-2 rounded-lg bg-brand px-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {reminderTriggerBusy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4 shrink-0" aria-hidden />
              )}
              הרץ תזכורות עכשיו
            </button>
          </section>
          ) : null}

          {activeRubric === "leads" ? (
          <section className={cardClass} aria-labelledby="lead-providers-h">
            <div className="flex items-center gap-2">
              <Users
                className="h-5 w-5 shrink-0 text-brand"
                aria-hidden
              />
              <h2
                id="lead-providers-h"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
              >
                ספקי לידים
              </h2>
            </div>

            {me?.platformSuper && (allOrgs?.length ?? 0) > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                <label className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-amber-950 dark:text-amber-100">
                    ארגון
                  </span>
                  <select
                    className="min-w-[12rem] rounded border border-amber-300 bg-white px-2 py-1 text-sm dark:border-amber-700 dark:bg-slate-900"
                    value={activeOrgId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setActiveOrgId(v || null);
                      setSuperActiveOrganizationId(v || null);
                    }}
                  >
                    {(allOrgs ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.slug})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : me && me.organization && !me.platformSuper ? (
              <p className="mt-2 text-start text-sm text-neutral-500">
                ארגון: {me.organization.name} ({me.organization.slug})
              </p>
            ) : null}

            {leadProvidersLoading ? (
              <div className="mt-6 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <span className="text-sm">טוען…</span>
              </div>
            ) : leadProvidersError ? (
              <p
                className="mt-4 text-start text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {leadProvidersError}
              </p>
            ) : (
              <>
                <form
                  onSubmit={(ev) => void handleAddLeadProvider(ev)}
                  className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 dark:border-neutral-700 dark:bg-neutral-950/40"
                >
                  <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-start text-sm">
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      שם
                    </span>
                    <input
                      name="lp_name"
                      required
                      autoComplete="organization"
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>
                  <label className="flex min-w-[7rem] flex-1 flex-col gap-1 text-start text-sm">
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      טלפון
                    </span>
                    <input
                      name="lp_phone"
                      type="tel"
                      dir="ltr"
                      autoComplete="tel"
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>
                  <label className="flex w-24 flex-col gap-1 text-start text-sm">
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      עמלה %
                    </span>
                    <input
                      name="lp_commission"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      defaultValue={0}
                      dir="ltr"
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={leadProviderBusy}
                    className={`${btnPrimary} shrink-0`}
                  >
                    {leadProviderBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    הוסף
                  </button>
                </form>

                <ResponsiveDataTable
                  className="mt-4"
                  columns={leadProviderColumns}
                  data={leadProviders}
                  rowKey={(row) => row.id}
                  minTableWidth="480px"
                  emptyMessage="אין רשומות"
                  actionsHeader="מחיקה"
                  actionsThClassName="px-4 py-3 text-center font-semibold text-neutral-800 dark:text-neutral-200"
                  actionsTdClassName="px-4 py-3 text-center align-middle"
                  actions={(row) => (
                    <button
                      type="button"
                      aria-label="מחק ספק"
                      disabled={deletingLeadProviderId !== null}
                      onClick={() => void handleDeleteLeadProvider(row)}
                      className="inline-flex rounded-lg border border-red-200 bg-red-50 p-2 text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                    >
                      {deletingLeadProviderId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  )}
                />
              </>
            )}
          </section>
          ) : null}

          {activeRubric === "docTypes" ? (
          <section className={cardClass} aria-labelledby="doc-types-h">
            <div className="flex items-center gap-2">
              <FileText
                className="h-5 w-5 shrink-0 text-brand"
                aria-hidden
              />
              <h2
                id="doc-types-h"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
              >
                סוגי מסמכים
              </h2>
            </div>

            {dtLoading ? (
              <div className="mt-6 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <span className="text-sm">טוען…</span>
              </div>
            ) : dtError ? (
              <p className="mt-4 text-start text-sm text-red-600" role="alert">
                {dtError}
              </p>
            ) : (
              <>
                <form
                  onSubmit={(ev) => void handleAddDocumentType(ev)}
                  className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 dark:border-neutral-700 dark:bg-neutral-950/40"
                >
                  <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-start text-sm">
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      שם סוג
                    </span>
                    <input
                      name="dt_name"
                      required
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>
                  <div className="flex min-w-[10rem] flex-1 flex-col gap-1 text-start text-sm">
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      טופס ריק
                    </span>
                    <label className="inline-flex cursor-pointer">
                      <span
                        className={`inline-flex w-full items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 ${dtBusy ? "opacity-60" : ""}`}
                      >
                        {dtBusy ? (
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <FileUp className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        <span className="min-w-0 truncate">
                          {newDocTypeFile
                            ? newDocTypeFile.name
                            : "בחירת קובץ"}
                        </span>
                      </span>
                      <input
                        key={newDocTypeFileKey}
                        type="file"
                        accept={BLANK_FORM_ACCEPT}
                        className="sr-only"
                        disabled={dtBusy}
                        onChange={(ev) => {
                          const f = ev.target.files?.[0] ?? null;
                          setNewDocTypeFile(f);
                        }}
                      />
                    </label>
                    {newDocTypeFile ? (
                      <button
                        type="button"
                        disabled={dtBusy}
                        onClick={() => {
                          setNewDocTypeFile(null);
                          setNewDocTypeFileKey((k) => k + 1);
                        }}
                        className="text-start text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                      >
                        הסר קובץ
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    disabled={dtBusy}
                    className={`${btnPrimary} shrink-0`}
                  >
                    {dtBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    הוסף
                  </button>
                </form>

                {dtMsg ? (
                  <p className="mt-3 text-start text-sm text-neutral-600 dark:text-neutral-400">
                    {dtMsg}
                  </p>
                ) : null}

                <ul className="mt-4 divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:divide-neutral-800 dark:border-neutral-700">
                  {documentTypes.length === 0 ? (
                    <li className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                      רשימה ריקה
                    </li>
                  ) : (
                    documentTypes.map((dt) => {
                      const hasBlank = Boolean(dt.download_link?.trim());
                      return (
                        <li
                          key={dt.id}
                          className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:gap-4"
                        >
                          <span
                            title={
                              hasBlank
                                ? "טופס ריק מצורף"
                                : "אין טופס ריק"
                            }
                            className="inline-flex shrink-0"
                          >
                            <FileText
                              className={`h-5 w-5 ${hasBlank ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-300 dark:text-neutral-600"}`}
                              aria-hidden
                            />
                          </span>
                          <div className="min-w-0 flex-1 text-start">
                            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                              {dt.name}
                            </p>
                            {dt.blank_form_original_filename?.trim() ? (
                              <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                                {dt.blank_form_original_filename}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {hasBlank && dt.download_link ? (
                              <a
                                href={dt.download_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${btnSecondary} !px-2.5 !py-1.5 text-xs`}
                                title="הורדה"
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden />
                              </a>
                            ) : null}
                            <input
                              type="file"
                              id={`dt-blank-${dt.id}`}
                              accept={BLANK_FORM_ACCEPT}
                              className="sr-only"
                              disabled={dtFileUploadingId === dt.id}
                              onChange={(ev) => {
                                void handleExistingDocTypeBlankForm(
                                  dt.id,
                                  ev.target.files
                                );
                                ev.target.value = "";
                              }}
                            />
                            <label
                              htmlFor={`dt-blank-${dt.id}`}
                              className={`${btnSecondary} !cursor-pointer !px-2.5 !py-1.5 text-xs ${dtFileUploadingId === dt.id ? "pointer-events-none opacity-50" : ""}`}
                            >
                              {dtFileUploadingId === dt.id ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <FileUp className="h-3.5 w-3.5" aria-hidden />
                              )}
                              <span className="sr-only sm:not-sr-only sm:inline">
                                {hasBlank ? "החלף" : "העלה"}
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                void handleDeleteDocumentType(dt.id)
                              }
                              disabled={deletingDtId === dt.id}
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                              aria-label="מחק סוג"
                            >
                              {deletingDtId === dt.id ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden
                                />
                              )}
                            </button>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </>
            )}
          </section>
          ) : null}

          {activeRubric === "templates" ? (
            <>
          <section className={cardClass} aria-labelledby="templates-upload-shortcut-h">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-start">
                <h2
                  id="templates-upload-shortcut-h"
                  className="text-base font-semibold text-neutral-900 dark:text-neutral-100"
                >
                  הוספת תבניות חתימה
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  כרגע קיימות {agreementTemplates.length} תבניות Word לחתימה. לחיצה על
                  הכפתור תפתח בחירת קובץ ‎.docx חדש.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById(
                    "agreement-template-upload-input"
                  ) as HTMLInputElement | null;
                  input?.click();
                }}
                className={`${btnPrimary} shrink-0`}
              >
                <FileUp className="h-4 w-4" aria-hidden />
                הוסף תבנית Word
              </button>
            </div>
          </section>

          <section
            className={`${cardClass} lg:col-span-2`}
            aria-labelledby="template-h"
          >
            <div className="flex flex-wrap items-center gap-2">
              <FileType
                className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400"
                aria-hidden
              />
              <h2
                id="template-h"
                className="text-start text-base font-bold text-neutral-900 dark:text-neutral-100"
              >
                תבניות Word
              </h2>
            </div>

            {templateInfoLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                טוען…
              </div>
            ) : templateInfoError ? (
              <p
                className="mt-3 text-start text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {templateInfoError}
              </p>
            ) : (
              <>
                {agreementTemplates.length > 0 ? (
                  <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-sm">
                    {agreementTemplates.map((t, idx) => {
                      const pub = agreementTemplatePublicUrl(t.storage_path);
                      const label =
                        t.original_filename?.trim() ||
                        t.name?.trim() ||
                        "תבנית .docx";
                      const downloadName =
                        t.original_filename?.trim() ||
                        ((t.name ?? "").toLowerCase().endsWith(".docx")
                          ? (t.name ?? "template.docx")
                          : `${(t.name ?? "template").replace(/\.docx$/i, "")}.docx`);
                      const versionNum = agreementTemplates.length - idx;
                      return (
                        <li
                          key={t.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-neutral-50/50 px-2 py-1.5 dark:border-neutral-800 dark:bg-neutral-950/40"
                        >
                          <span className="text-xs tabular-nums text-neutral-500">
                            v{versionNum}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-neutral-800 dark:text-neutral-200">
                            {label}
                          </span>
                          {idx === 0 ? (
                            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-200">
                              פעיל
                            </span>
                          ) : null}
                          <a
                            href={pub}
                            download={downloadName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${btnSecondary} !px-2 !py-1 text-xs`}
                            title="הורדה"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                          </a>
                          <button
                            type="button"
                            disabled={
                              deletingTemplateId !== null || templateBusy
                            }
                            onClick={() => void handleDeleteAgreementTemplate(t)}
                            className="rounded border border-red-200 bg-red-50 p-1 text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                            aria-label="מחק"
                          >
                            {deletingTemplateId === t.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-3 text-start text-sm text-neutral-500 dark:text-neutral-400">
                    אין תבניות
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-neutral-700 dark:bg-neutral-950/50">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    ‎.docx
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start text-xs text-neutral-500 dark:text-neutral-400">
                    {agreementTemplates[0]?.original_filename?.trim() ||
                      agreementTemplates[0]?.name?.trim() ||
                      "לא הועלה קובץ"}
                  </span>
                  <label
                    className={`${btnPrimary} !inline-flex !cursor-pointer !items-center !gap-1.5 !px-3 !py-1.5 !text-xs`}
                  >
                    {templateBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span>
                      {templateBusy
                        ? "מעלה…"
                        : agreementTemplates.length > 0
                          ? "החלף"
                          : "העלה"}
                    </span>
                    <input
                      id="agreement-template-upload-input"
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      disabled={templateBusy || deletingTemplateId !== null}
                      onChange={(e) => {
                        void handleTemplateUpload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </>
            )}
            {templateMsg ? (
              <p className="mt-3 text-start text-sm text-neutral-600 dark:text-neutral-400">
                {templateMsg}
              </p>
            ) : null}
          </section>

          <section className={cardClass} aria-labelledby="embed-codes-h">
            <div className="flex items-center gap-2">
              <FileType
                className="h-5 w-5 shrink-0 text-brand"
                aria-hidden
              />
              <h2
                id="embed-codes-h"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
              >
                קודים לשתילה
              </h2>
            </div>
            <p className="mt-2 text-start text-sm text-neutral-600 dark:text-neutral-400">
              קודים קבועים לשדות המובנים בתבניות Word. מומלץ להשתמש בפורמט:
              <code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
                [[...]]
              </code>
            </p>
            <ul className="mt-4 space-y-2">
              {embedCodes.map((item) => (
                <li
                  key={item.code}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950/40"
                >
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {item.label}
                  </span>
                  <code
                    dir="ltr"
                    className="rounded bg-white px-2 py-1 text-xs font-semibold text-brand"
                  >
                    {item.code}
                  </code>
                </li>
              ))}
            </ul>
          </section>

            </>
          ) : null}

          {activeRubric === "team" ? (
          <section
            className={`${cardClass} relative lg:col-span-2`}
            aria-labelledby="team-users-h"
          >
            <div className="flex items-center gap-2">
              <Users
                className="h-5 w-5 shrink-0 text-brand"
                aria-hidden
              />
              <h2
                id="team-users-h"
                className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"
              >
                ניהול צוות
              </h2>
            </div>
            <p className="mt-2 text-start text-sm text-neutral-600 dark:text-neutral-400">
              עריכת פרטים, תפקיד, אחוז עמלה וסיסמה — מתוך עמודת הפעולות בטבלה.
            </p>

            {teamLoading ? (
              <div className="mt-6 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <span className="text-sm">טוען משתמשים…</span>
              </div>
            ) : teamForbidden ? (
              <p
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-start text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                role="status"
              >
                אין הרשאה — נדרש תפקיד{" "}
                <code className="rounded bg-amber-200/80 px-1 text-xs dark:bg-amber-900">
                  admin
                </code>{" "}
                בפרופיל.
              </p>
            ) : teamError ? (
              <p
                className="mt-4 text-start text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {teamError}
              </p>
            ) : (
              <>
                <ResponsiveDataTable
                  className="mt-6"
                  columns={teamMemberColumns}
                  data={teamMembers}
                  rowKey={(m) => m.id}
                  minTableWidth="640px"
                  emptyMessage="אין משתמשים"
                  actionsHeader="פעולות"
                  actionsThClassName="w-14 px-3 py-3 text-center font-semibold text-neutral-800 dark:text-neutral-200"
                  actionsTdClassName="w-14 px-3 py-3 text-center align-middle"
                  actions={(m) => (
                    <button
                      type="button"
                      onClick={() => openEditUser(m)}
                      className="inline-flex h-9 min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-brand-soft bg-brand-soft px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:opacity-95 md:w-auto md:min-w-9 md:px-0"
                      aria-label={`עריכת ${m.full_name?.trim() || m.email}`}
                      title="עריכה"
                    >
                      <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="md:sr-only">עריכה</span>
                    </button>
                  )}
                />
                <p className="mt-4 text-start text-sm text-neutral-600 dark:text-neutral-400">
                  <Link
                    href="/admin/team"
                    className="font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    הוספת חבר צוות חדש
                  </Link>
                  — יצירת משתמש וסיסמה ראשונית בדף נפרד.
                </p>
              </>
            )}

            {editUser ? (
              <div className="fixed inset-0 z-[60]">
                <button
                  type="button"
                  aria-label="סגור"
                  className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                  onClick={() => !teamSaveBusy && closeEditUser()}
                />
                <div className="relative z-10 flex min-h-full items-center justify-center p-4">
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="edit-user-title"
                    className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <div className="border-b border-slate-100 bg-gradient-to-l from-brand-soft to-white px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2
                            id="edit-user-title"
                            className="text-start text-lg font-semibold text-neutral-900 dark:text-neutral-50"
                          >
                            עריכת משתמש
                          </h2>
                          <p className="mt-0.5 text-start text-xs text-neutral-600 dark:text-neutral-400">
                            עדכון שם, אימייל, תפקיד, אחוז עמלה וסיסמה
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={teamSaveBusy}
                          onClick={() => closeEditUser()}
                          className="shrink-0 rounded-xl p-2 text-neutral-500 transition hover:bg-white/80 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                          aria-label="סגור"
                        >
                          <X className="h-5 w-5 shrink-0" aria-hidden />
                        </button>
                      </div>
                    </div>
                    <form
                      onSubmit={(ev) => void handleSaveTeamUser(ev)}
                      className="space-y-4 px-5 py-5"
                    >
                      <label className="grid gap-1.5 text-start text-sm">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          שם מלא
                        </span>
                        <input
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          autoComplete="name"
                          className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-brand-soft focus:outline-none focus:ring-2 ring-brand dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                        />
                      </label>
                      <label className="grid gap-1.5 text-start text-sm">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          אימייל
                        </span>
                        <input
                          type="email"
                          dir="ltr"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          autoComplete="email"
                          required
                          className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-brand-soft focus:outline-none focus:ring-2 ring-brand dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                        />
                      </label>
                      <label className="grid gap-1.5 text-start text-sm">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          תפקיד
                        </span>
                        <select
                          value={editRole}
                          onChange={(e) =>
                            setEditRole(
                              e.target.value === "admin" ? "admin" : "staff"
                            )
                          }
                          className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-brand-soft focus:outline-none focus:ring-2 ring-brand dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                        >
                          <option value="staff">צוות</option>
                          <option value="admin">מנהל</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-start text-sm">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          אחוז עמלה (סוכן)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          dir="ltr"
                          value={editCommissionPct}
                          onChange={(e) => setEditCommissionPct(e.target.value)}
                          className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-brand-soft focus:outline-none focus:ring-2 ring-brand dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                        />
                      </label>
                      <label className="grid gap-1.5 text-start text-sm">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          סיסמה חדשה (אופציונלי)
                        </span>
                        <input
                          type="password"
                          dir="ltr"
                          autoComplete="new-password"
                          value={editNewPassword}
                          onChange={(e) => setEditNewPassword(e.target.value)}
                          placeholder="השאר ריק אם אין שינוי"
                          className="rounded-lg border border-neutral-300 bg-neutral-50/80 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-brand-soft focus:outline-none focus:ring-2 ring-brand dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                        <button
                          type="button"
                          disabled={teamSaveBusy}
                          onClick={() => closeEditUser()}
                          className={btnSecondary}
                        >
                          ביטול
                        </button>
                        <button
                          type="submit"
                          disabled={teamSaveBusy}
                          className={btnPrimary}
                        >
                          {teamSaveBusy ? (
                            <Loader2
                              className="h-4 w-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Save className="h-4 w-4 shrink-0" aria-hidden />
                          )}
                          שמור
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
          ) : null}
        </div>
    </div>
  );
}
