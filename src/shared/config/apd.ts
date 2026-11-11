import type { Severity } from "@/shared/config/events"
import { tr } from "@/shared/lib/i18n"

/** APD types in display order. Charts, filters, the table and CCTV highlights read labels, colors and severity from here, so a site can add or drop one without touching components. */
export type ApdType = { id: string; label: string; color: string; severity: Severity }

export const apdTypes: ApdType[] = [
  { id: "helm", get label() { return tr("Helm", "Helmet") }, color: "var(--chart-4)", severity: "tinggi" },
  { id: "rompi", get label() { return tr("Rompi", "Vest") }, color: "var(--warning)", severity: "sedang" },
  { id: "sepatu", get label() { return tr("Sepatu safety", "Safety shoes") }, color: "var(--chart-1)", severity: "sedang" },
  { id: "sarung-tangan", get label() { return tr("Sarung tangan", "Gloves") }, color: "var(--chart-3)", severity: "rendah" },
  { id: "kacamata", get label() { return tr("Kacamata", "Goggles") }, color: "var(--chart-5)", severity: "rendah" },
]

/** Compliance target in percent. At or above it the number is green. */
export const TARGET_KEPATUHAN = 95
/** Points below the target that still count as "close" (yellow); further below is red. */
export const KEPATUHAN_DEKAT = 3

/** Green at target, yellow within `KEPATUHAN_DEKAT` points under it, red below that. */
export const complianceTone = (v: number) => (v >= TARGET_KEPATUHAN ? "success" : v >= TARGET_KEPATUHAN - KEPATUHAN_DEKAT ? "warning" : "danger")

