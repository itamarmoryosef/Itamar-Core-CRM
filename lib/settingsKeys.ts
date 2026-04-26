export const SETTING_KEY_ADMIN_NOTIFICATION_PHONE = "admin_notification_phone";

/** Base URL for embedded Grow payment page (query params appended per client). */
export const SETTING_KEY_GROW_PAYMENT_BASE_URL = "grow_payment_base_url";

/** Newline-delimited CRM statuses for admin UI selectors. */
export const SETTING_KEY_CLIENT_CRM_STATUSES = "client_crm_statuses";

/** Newline-delimited CRM statuses where bot reminders are allowed. */
export const SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUSES =
  "client_crm_bot_enabled_statuses";

/**
 * JSON array of `client_statuses.id` (UUID) — bot/automated reminders
 * (preferred over label list when set).
 */
export const SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUS_IDS =
  "client_crm_bot_enabled_status_ids";

/** Display name (portals, PDF, WhatsApp) — overrides env when set. */
export const SETTING_KEY_BRANDING_BUSINESS_NAME = "branding_business_name";
export const SETTING_KEY_BRANDING_TAGLINE = "branding_tagline";
export const SETTING_KEY_BRANDING_PRIMARY = "branding_primary";
export const SETTING_KEY_BRANDING_SECONDARY = "branding_secondary";
export const SETTING_KEY_BRANDING_LOGO_URL = "branding_logo_url";
