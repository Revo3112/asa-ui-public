import { tr } from "@/shared/lib/i18n"
/** Event types, severity and the status flow, shared by every page that shows events. */

export type EventType = "ppe" | "kamera" | "lingkungan" | "ert"
export type Severity = "kritis" | "tinggi" | "sedang" | "rendah"
export type EventStatus = "open" | "acknowledged" | "closed"

export const eventTypes: Record<EventType, string> = {
  ppe: "PPE",
  get kamera() { return tr("Kamera offline", "Camera offline") },
  get lingkungan() { return tr("Lingkungan", "Environment") },
  ert: "ERT",
}

/**
 * Four levels, most severe first. Kritis and Tinggi share the danger color, so Kritis is the solid
 * chip and the rest keep the default look; the label always says which, color is never the only cue.
 */
export const severityMeta = {
  kritis: { get label() { return tr("Kritis", "Critical") }, color: "danger", variant: "primary", rank: 0 },
  tinggi: { get label() { return tr("Tinggi", "High") }, color: "danger", variant: undefined, rank: 1 },
  sedang: { get label() { return tr("Sedang", "Medium") }, color: "warning", variant: undefined, rank: 2 },
  rendah: { get label() { return tr("Rendah", "Low") }, color: "accent", variant: undefined, rank: 3 },
} as const

/** Kritis and Tinggi: the levels that raise a toast and count as "unhandled" while waiting. */
export const isUrgent = (s: Severity) => severityMeta[s].rank <= severityMeta.tinggi.rank

export const eventStatus = {
  open: { label: "Open", color: "danger" },
  acknowledged: { label: "Acknowledged", color: "warning" },
  closed: { label: "Closed", color: "success" },
} as const

/** Open → Acknowledged → Closed, one step at a time. Closed is final: there is no reopen. */
export const nextStep: Partial<Record<EventStatus, { status: EventStatus; label: string }>> = {
  open: { status: "acknowledged", label: "Acknowledge" },
  acknowledged: { status: "closed", label: "Close" },
}
