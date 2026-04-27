import type { CookieOptions } from "@supabase/ssr";

/**
 * Consistent session cookie flags for browser + server Supabase clients.
 * OWASP: restrict scope, SameSite against CSRF, Secure in production (HTTPS).
 */
export function getSupabaseAuthCookieOptions(): CookieOptions {
  const secure = process.env.NODE_ENV === "production";
  return {
    path: "/",
    sameSite: "lax",
    secure,
  };
}
