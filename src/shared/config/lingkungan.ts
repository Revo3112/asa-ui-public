import { tr } from "@/shared/lib/i18n"
/** Which side of the limit is dangerous: too high (heat, noise) or too low (oxygen). */
export type Direction = "atas" | "bawah"

export type Threshold = { waspada: number; bahaya: number; arah: Direction }

/**
 * Sensor types in display order. Names, units, colors and default thresholds are read
 * from here, so a site can add a type without touching components.
 * `normal` is where a healthy reading sits; the chart's y-axis always covers it and both limits.
 */
export type SensorType = { id: string; label: string; unit: string; decimals: number; color: string; normal: number; threshold: Threshold }

export const sensorTypes: SensorType[] = [
  { id: "suhu", get label() { return tr("Suhu", "Temperature") }, unit: "°C", decimals: 1, color: "var(--chart-1)", normal: 29, threshold: { waspada: 32, bahaya: 35, arah: "atas" } },
  { id: "bising", get label() { return tr("Kebisingan", "Noise") }, unit: "dB", decimals: 0, color: "var(--chart-4)", normal: 78, threshold: { waspada: 85, bahaya: 95, arah: "atas" } },
  { id: "debu", get label() { return tr("Debu PM10", "PM10 dust") }, unit: "µg/m³", decimals: 0, color: "var(--chart-3)", normal: 90, threshold: { waspada: 150, bahaya: 250, arah: "atas" } },
  { id: "co", label: "Gas CO", unit: "ppm", decimals: 1, color: "var(--chart-2)", normal: 8, threshold: { waspada: 25, bahaya: 50, arah: "atas" } },
  { id: "oksigen", get label() { return tr("Oksigen", "Oxygen") }, unit: "%", decimals: 1, color: "var(--chart-5)", normal: 20.8, threshold: { waspada: 19.5, bahaya: 18, arah: "bawah" } },
]

/** A sensor with no reading for this long is shown as stale instead of with its last value. */
export const STALE_MS = 20_000

/** A status may get worse at once, but only gets better after holding this long, so a value hovering on a limit doesn't flicker. */
export const CLEAR_HOLD_MS = 10_000

/** Live charts keep at most this much data. */
export const BUFFER_MS = 60 * 60_000

/**
 * Line colors, one per place in the view: the same zone gets the same color in every chart on the page.
 * Distinct hues, none of them the warning yellow or danger red of the bands.
 */
export const lineColors = ["#2f6fb2", "#2a9d8f", "#8a5cc7", "#c2538a", "#7a8a99", "#4f7f3a", "#1f8fa6", "#6b5bd6"]
