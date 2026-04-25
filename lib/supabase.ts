import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
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

/**
 * PostgREST requires the `apikey` header on every request. Some environments or
 * fetch paths omit it; ensure it (and a Bearer fallback) are always present for
 * our project origin.
 */
const supabaseFetch: typeof fetch = (input, init) => {
  const urlStr = resolveRequestUrl(input);
  if (!urlStr || !isSupabaseProjectRequest(urlStr)) {
    return fetch(input, init);
  }

  const baseHeaders =
    init?.headers ??
    (input instanceof Request ? input.headers : undefined);
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

/** Browser client — session cookies sync with `middleware.ts` for `/admin` protection. */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: supabaseFetch,
  },
});
