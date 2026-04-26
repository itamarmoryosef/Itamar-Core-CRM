const STORAGE_KEY = "crm-super-active-organization-id";
const LEGACY_STORAGE_KEY = "alentix-super-active-organization-id";

export function getSuperActiveOrganizationId(): string | null {
  if (typeof window === "undefined") return null;
  const next = window.localStorage.getItem(STORAGE_KEY);
  if (next) return next;
  const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  return legacy;
}

export function setSuperActiveOrganizationId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* */
  }
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
  try {
    window.dispatchEvent(new Event("crm-active-organization-changed"));
  } catch {
    /* */
  }
}

/**
 * Resolves the organization id to use in admin UI (fields, new client) when
 * the user is a platform super (picks from storage) or a normal org user.
 */
export function resolveAdminOrganizationId(
  me: {
    platformSuper: boolean;
    organizationId: string | null;
  },
  orgs: { id: string }[] | null
): string | null {
  if (!me.platformSuper) return me.organizationId;
  const stored = getSuperActiveOrganizationId();
  if (stored) return stored;
  return orgs?.[0]?.id ?? me.organizationId;
}
