import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseProjectUrl } from "@/lib/supabaseUrl";
import { getSupabaseAuthCookieOptions } from "@/lib/supabaseSessionCookies";

type BrowserClient = ReturnType<typeof createBrowserClient>;
let _client: BrowserClient | null = null;

function getOrCreateClient(): BrowserClient {
  if (_client) return _client;

  const supabaseUrl = normalizeSupabaseProjectUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "חסרים או שגויים NEXT_PUBLIC_SUPABASE_URL / ANON_KEY. URL חייב להיות בדיוק `https://xxxx.supabase.co` (בלי נתיב או / בסוף). הגדרו ב־.env.local או Vercel."
    );
  }

  const supabaseOrigin = new URL(supabaseUrl).origin;

  function isSupabaseProjectRequest(urlStr: string): boolean {
    try {
      return new URL(urlStr).origin === supabaseOrigin;
    } catch {
      return false;
    }
  }

  function resolveRequestUrl(input: RequestInfo | URL): string | null {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input instanceof Request) return input.url;
    return null;
  }

  const supabaseFetch: typeof fetch = (input, init) => {
    const urlStr = resolveRequestUrl(input);
    if (!urlStr || !isSupabaseProjectRequest(urlStr)) {
      return fetch(input, init);
    }

    const baseHeaders =
      init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const headers = new Headers(baseHeaders);

    if (!headers.has("apikey")) {
      headers.set("apikey", supabaseAnonKey);
    }
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${supabaseAnonKey}`);
    }

    if (input instanceof Request) {
      return fetch(new Request(input, { ...init, headers }));
    }

    return fetch(input, { ...init, headers });
  };

  _client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(),
    global: {
      fetch: supabaseFetch,
    },
  });
  return _client;
}

/**
 * לקוח דפדפן — session cookies עם middleware ל־`/admin`.
 * Lazy: לא יזרוק בזמן `import` (כך `next build` ב־Vercel לפני שמילאו env עבר טכנית, אבל **חייב** להגדיר env בפרודקשן).
 */
export const supabase = new Proxy(
  {} as SupabaseClient,
  {
    get(_target, prop, receiver) {
      const c = getOrCreateClient() as object;
      const v = Reflect.get(c, prop, receiver);
      if (typeof v === "function") {
        return (v as (...a: unknown[]) => unknown).bind(c);
      }
      return v;
    },
  }
) as SupabaseClient;
