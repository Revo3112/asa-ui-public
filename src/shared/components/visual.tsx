/**
 * Small visual pieces that replace sentences on the dashboard: an icon tile, a thin bar, a
 * two-bar comparison, fact chips and an owner badge. Colours follow the status tones only, so red
 * still means danger whatever brand colour the client picks.
 */
import type { LucideIcon } from "lucide-react"
import { UserRound } from "lucide-react"

import { locale } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"

export type Tone = "danger" | "warning" | "accent" | "success" | "default"

const tile: Record<Tone, string> = {
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/15 text-warning-ink",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  default: "bg-default text-muted",
}
/** `default` is the "compared against" bar: lighter than any tone, still 3:1 on its track. */
const fill: Record<Tone, string> = { danger: "bg-danger", warning: "bg-warning", accent: "bg-accent", success: "bg-success", default: "bg-muted/70" }
export const toneText: Record<Tone, string> = { danger: "text-danger", warning: "text-warning-ink", accent: "text-foreground", success: "text-success", default: "text-foreground" }

export function IconTile({ icon: Icon, tone = "default", size = "md", className }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl", size === "sm" ? "size-7" : "size-9", tile[tone], className)} aria-hidden>
      <Icon className={size === "sm" ? "size-3.5" : "size-4.5"} />
    </span>
  )
}

/** A thin filled track. `marker` draws a tick at a threshold, in the same units as value. */
export function MiniBar({ value, max, tone = "accent", marker, className }: { value: number; max: number; tone?: Tone; marker?: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-default", className)} aria-hidden>
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill[tone])} style={{ width: `${pct}%` }} />
      {marker !== undefined && max > 0 && <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${Math.min(100, (marker / max) * 100)}%` }} />}
    </div>
  )
}

/** Two values as bars on one scale, labelled, so "33% vs 18%" reads at a glance. */
export function CompareBars({ a, b, aLabel, bLabel, format, tone = "danger" }: { a: number; b: number; aLabel: string; bLabel: string; format?: "pct"; tone?: Tone }) {
  const max = Math.max(a, b, format === "pct" ? 0 : 1) || 1
  const fmt = (v: number) => (format === "pct" ? `${Math.round(v * 100)}%` : v.toLocaleString(locale(), { maximumFractionDigits: 1 }))
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-muted">{aLabel}</span>
      <MiniBar value={a} max={max} tone={tone} />
      <span className="font-medium tabular-nums">{fmt(a)}</span>
      <span className="text-muted">{bLabel}</span>
      <MiniBar value={b} max={max} tone="default" />
      <span className="tabular-nums text-muted">{fmt(b)}</span>
    </div>
  )
}

export function FactChips({ facts, className }: { facts: string[]; className?: string }) {
  if (!facts.length) return null
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {facts.map((f) => (
        <li key={f} className="rounded-md bg-default px-2 py-0.5 text-xs">
          {f}
        </li>
      ))}
    </ul>
  )
}

const initials = (name: string) =>
  name
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")

/** A role or person as an avatar circle plus the name. */
export function OwnerBadge({ name, className }: { name: string; className?: string }) {
  const short = initials(name)
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted", className)}>
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-[10px] font-semibold text-on-ink" aria-hidden>
        {short || <UserRound className="size-3" />}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}
