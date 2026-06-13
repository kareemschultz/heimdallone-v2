import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// The canonical Heimdallone documentation label set (see the Documentation Rule
// in AGENTS.md / CLAUDE.md). Each label maps to a tone so usage is consistent.
const TONES = {
  status:
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
  warn: "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25",
  migration: "bg-blue-500/12 text-blue-700 dark:text-blue-300 ring-blue-500/25",
  role: "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25",
  domain: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 ring-cyan-500/25",
  capability:
    "bg-teal-500/12 text-teal-700 dark:text-teal-300 ring-teal-500/25",
  security: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25",
  neutral: "bg-zinc-500/12 text-zinc-700 dark:text-zinc-300 ring-zinc-500/25",
} as const;

const LABEL_TONE: Record<string, keyof typeof TONES> = {
  Live: "status",
  Preview: "warn",
  Beta: "warn",
  Migration: "migration",
  Admin: "role",
  Manager: "role",
  Employee: "role",
  Auditor: "role",
  Payroll: "domain",
  HR: "domain",
  Finance: "domain",
  Security: "security",
  "Tenant Configurable": "capability",
  "Country Rule": "capability",
  "Effective Dated": "capability",
  "Self-Service": "capability",
  "Requires Setup": "warn",
};

export function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  const label = typeof children === "string" ? children : "";
  const resolved = tone ?? LABEL_TONE[label] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[resolved],
      )}
    >
      {children}
    </span>
  );
}

export function Tags({ children }: { children: ReactNode }) {
  return (
    <span className="not-prose inline-flex flex-wrap gap-1.5">{children}</span>
  );
}
