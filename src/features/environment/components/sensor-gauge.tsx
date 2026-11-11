import { Chip } from "@heroui/react"

import { Gauge, GaugeHub, GaugeNeedle, GaugeZones, type Zone } from "@/shared/charts/gauge"
import { formatValue } from "@/features/environment/components/sensor-chart"
import { statusMeta } from "@/features/environment/components/sensor-panels"
import { statusOf } from "@/features/environment/components/use-sensor-stream"
import type { SensorType, Threshold } from "@/shared/config/lingkungan"
import { cn } from "@/shared/lib/utils"

type SensorGaugeProps = {
  type: SensorType
  /** Undefined while the sensor sends nothing: the dial drops its needle and says so. */
  value?: number
  /** The site's limits. Defaults to the type's. */
  threshold?: Threshold
  className?: string
}

/** One reading on a dial with the safe, warning and danger bands of its threshold. */
export function SensorGauge({ type, value, threshold = type.threshold, className }: SensorGaugeProps) {
  const lo = Math.min(type.normal, threshold.waspada, threshold.bahaya)
  const hi = Math.max(type.normal, threshold.waspada, threshold.bahaya)
  // Room on both sides so a reading past a limit still lands on the dial.
  const pad = (hi - lo) * 0.5
  const min = Math.max(0, lo - pad)
  const max = hi + pad
  const zones: Zone[] =
    threshold.arah === "atas"
      ? [
          { to: threshold.waspada, color: "var(--success)" },
          { to: threshold.bahaya, color: "var(--warning)" },
          { to: max, color: "var(--danger)" },
        ]
      : [
          { to: threshold.bahaya, color: "var(--danger)" },
          { to: threshold.waspada, color: "var(--warning)" },
          { to: max, color: "var(--success)" },
        ]
  const status = value === undefined ? "offline" : statusOf(value, threshold)

  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", className)}>
      <Gauge value={value ?? min} min={min} max={max} startAngle={60} endAngle={300} padding={16} fit="content" transition aria-hidden className="text-foreground">
        <GaugeZones zones={zones} width={18} gap={2} />
        {value !== undefined && <GaugeNeedle style="pointer" length={0.78} width={14} />}
        <GaugeHub radius={value === undefined ? 0 : 14} />
      </Gauge>
      <p className="text-sm text-muted">{type.label}</p>
      <p className={cn("font-display text-2xl tabular-nums", status === "offline" ? "text-muted" : statusMeta[status].text)}>
        {value === undefined ? "–" : formatValue(value, type)} <span className="text-base font-normal text-muted">{type.unit}</span>
      </p>
      <Chip size="sm" color={statusMeta[status].color}>
        {statusMeta[status].label}
      </Chip>
    </div>
  )
}
