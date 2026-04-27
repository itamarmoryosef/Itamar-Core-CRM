"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

const cardBase =
  "group flex h-full min-h-[10.5rem] flex-col rounded-2xl border border-slate-200/90 bg-white p-5 text-start shadow-sm transition hover:border-slate-300/90 hover:shadow-md dark:border-zinc-700/90 dark:bg-zinc-900/50 dark:hover:border-zinc-600/90";

const btnPrimary =
  "mt-auto inline-flex w-full items-center justify-center rounded-xl bg-[#16a34a] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition group-hover:bg-[#15803d] dark:bg-emerald-600 dark:hover:bg-emerald-500";

type PropsBase = {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName?: string;
  cta: string;
};

type Props =
  | (PropsBase & { href: string; onPick?: never })
  | (PropsBase & { onPick: () => void; href?: never });

export function SettingsModuleCard(p: Props) {
  const Icon = p.icon;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-start text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">
          {p.title}
        </h3>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300">
          <Icon
            className={p.iconClassName ?? "h-5 w-5"}
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </div>
      <p className="mt-2 grow text-start text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[13px]">
        {p.description}
      </p>
    </>
  );

  if (p.onPick) {
    return (
      <button type="button" onClick={p.onPick} className={cardBase}>
        {body}
        <span className={btnPrimary}>{p.cta}</span>
      </button>
    );
  }

  return (
    <Link href={p.href} className={cardBase}>
      {body}
      <span className={btnPrimary}>{p.cta}</span>
    </Link>
  );
}
