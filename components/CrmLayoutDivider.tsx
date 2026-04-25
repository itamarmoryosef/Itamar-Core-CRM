"use client";

import type { CrmDividerConfig } from "@/lib/crmClientCardLayout";
import { normalizeDividerConfig } from "@/lib/crmClientCardLayout";

type Variant = "client" | "designer" | "preview";

export function CrmLayoutDividerView(props: {
  config: CrmDividerConfig | null | undefined;
  variant?: Variant;
}) {
  const { config, variant = "client" } = props;
  const c = normalizeDividerConfig(config);
  const isMinimal = c.style === "minimal";
  const isDesigner = variant === "designer";

  if (isMinimal) {
    if (!c.title.trim()) {
      return isDesigner ? (
        <span className="text-[9px] text-slate-400">—</span>
      ) : null;
    }
    return (
      <span
        className="text-xs font-medium text-slate-600 dark:text-slate-400"
        style={{ color: c.color_hex }}
      >
        {c.title}
      </span>
    );
  }

  const lineStyle =
    c.style === "dashed"
      ? {
          borderBottomWidth: c.thickness_px,
          borderBottomStyle: "dashed" as const,
          borderBottomColor: c.color_hex,
          height: 0,
        }
      : {
          height: c.thickness_px,
          backgroundColor: c.color_hex,
          borderRadius: 9999,
        };

  return (
    <div
      className="flex min-w-0 items-center gap-2"
      role="separator"
      aria-hidden={!c.title.trim()}
    >
      {c.title.trim() ? (
        <span
          className="shrink-0 text-xs font-medium text-slate-700 dark:text-slate-300"
          style={{ color: c.color_hex }}
        >
          {c.title}
        </span>
      ) : null}
      <div className="min-w-0 flex-1" style={lineStyle} />
    </div>
  );
}
