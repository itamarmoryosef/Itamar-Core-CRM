"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveAdminOrganizationId } from "@/lib/orgContextClient";

export type UseFeaturesState =
  | "idle"
  | "loading"
  | "ready"
  | "no_auth"
  | "no_org"
  | "not_installed"
  | "error";

type ProfileRow = {
  organization_id?: string | null;
  is_platform_super?: boolean;
};

/**
 * שולף מ־Supabase (דפדפן, anon+RLS) את הפיצ'רים הפעילים לארגון הנוכחי:
 * `system_features` + `organization_feature_map` (רשומת enabled=false = כבוי, ללא שורה = דלוק).
 * Super: ארגון נקבע מ־localStorage / רשימת `organizations` כמו בממשק האדמין.
 */
export function useFeatures(): {
  hasFeature: (code: string) => boolean;
  enabledCodes: string[] | null;
  state: UseFeaturesState;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [enabledSet, setEnabledSet] = useState<Set<string> | null>(null);
  const [enabledCodes, setEnabledCodes] = useState<string[] | null>(null);
  const [state, setState] = useState<UseFeaturesState>("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    setEnabledSet(null);
    setEnabledCodes(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState("no_auth");
      return;
    }

    let prof: ProfileRow | null = null;
    {
      const { data, error: pErr } = await supabase
        .from("profiles")
        .select("organization_id, is_platform_super")
        .eq("id", user.id)
        .maybeSingle();
      if (pErr) {
        const m = pErr.message?.toLowerCase() ?? "";
        if (m.includes("is_platform_super") || m.includes("column")) {
          const { data: d2, error: p2 } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("id", user.id)
            .maybeSingle();
          if (p2) {
            setState("error");
            setError(p2.message);
            return;
          }
          prof = { ...((d2 ?? null) as ProfileRow), is_platform_super: false };
        } else {
          setState("error");
          setError(pErr.message);
          return;
        }
      } else {
        prof = (data ?? null) as ProfileRow | null;
      }
    }

    const profOrg = prof?.organization_id?.trim() ?? null;
    const platformSuper = prof?.is_platform_super === true;

    let orgId: string | null;
    if (platformSuper) {
      const { data: orgsList, error: oE } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .order("name", { ascending: true });
      if (oE) {
        setState("error");
        setError(oE.message);
        return;
      }
      const list = (orgsList ?? []) as { id: string }[];
      orgId = resolveAdminOrganizationId(
        { platformSuper, organizationId: profOrg },
        list
      );
    } else {
      orgId = profOrg;
    }

    if (!orgId) {
      setState("no_org");
      return;
    }

    const { data: catalog, error: cErr } = await supabase
      .from("system_features")
      .select("id, code, sort_order")
      .order("sort_order", { ascending: true });

    if (cErr) {
      const m = cErr.message?.toLowerCase() ?? "";
      if (/relation|does not exist|schema/.test(m)) {
        setState("not_installed");
        setError(null);
        return;
      }
      setState("error");
      setError(cErr.message);
      return;
    }

    const { data: mapRows, error: mErr } = await supabase
      .from("organization_feature_map")
      .select("system_feature_id, enabled")
      .eq("organization_id", orgId);

    if (mErr) {
      const m = mErr.message?.toLowerCase() ?? "";
      if (/relation|does not exist|schema/.test(m)) {
        setState("not_installed");
        return;
      }
      setState("error");
      setError(mErr.message);
      return;
    }

    const flagMap = new Map(
      (mapRows ?? []).map(
        (r) =>
          [r.system_feature_id as string, (r as { enabled: boolean }).enabled] as const
      )
    );
    const codes: string[] = [];
    for (const row of catalog ?? []) {
      const r = row as { id: string; code: string };
      const e = flagMap.get(r.id);
      if (e === false) {
        continue;
      }
      codes.push(r.code);
    }
    setEnabledCodes(codes);
    setEnabledSet(new Set(codes));
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const b = () => {
      void load();
    };
    window.addEventListener("crm-active-organization-changed", b);
    window.addEventListener("storage", b);
    window.addEventListener("crm-organization-features-updated", b);
    return () => {
      window.removeEventListener("crm-active-organization-changed", b);
      window.removeEventListener("storage", b);
      window.removeEventListener("crm-organization-features-updated", b);
    };
  }, [load]);

  const hasFeature = useCallback(
    (code: string) => {
      if (state === "loading" || state === "idle") {
        return true;
      }
      if (state === "not_installed") {
        return true;
      }
      if (state === "no_auth" || state === "error") {
        return false;
      }
      if (state === "no_org") {
        return false;
      }
      if (enabledSet == null) {
        return true;
      }
      return enabledSet.has(code);
    },
    [state, enabledSet]
  );

  return { hasFeature, enabledCodes, state, error, refetch: load };
}
