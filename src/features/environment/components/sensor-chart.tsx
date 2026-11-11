import "uplot/dist/uPlot.min.css"
import { useEffect, useRef } from "react"
import uPlot from "uplot"

import type { SensorType, Threshold } from "@/shared/config/lingkungan"
import type { Reading } from "@/features/environment/data/lingkungan"
import { cn } from "@/shared/lib/utils"
import { locale, tr } from "@/shared/lib/i18n"

const probe = typeof document === "undefined" ? null : document.createElement("span")

/** Resolves a CSS color such as `var(--danger)` for canvas, which can't read variables. Read on each draw, so a theme switch shows up on the next frame. */
function cssColor(value: string) {
  if (!probe) return value
  if (!probe.isConnected) {
    probe.style.display = "none"
    document.body.append(probe)
  }
  probe.style.color = value
  return getComputedStyle(probe).color
}

export const formatValue = (value: number, type: SensorType) =>
  value.toLocaleString(locale(), { minimumFractionDigits: type.decimals, maximumFractionDigits: type.decimals })

export type ChartSeries = { id: string; label: string; color: string; points: Reading[] }

type SensorChartProps = {
  type: SensorType
  threshold: Threshold
  series: ChartSeries[]
  /** The visible window in ms. Live charts slide it forward every second. */
  start: number
  end: number
  height?: number
  className?: string
}

/** Lines over the warning and danger bands of one sensor type. One unit per chart, so values never share an axis with another unit. */
export function SensorChart({ type, threshold, series, start, end, height = 200, className }: SensorChartProps) {
  const container = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot>(null)
  // The draw hooks run outside React, so they read the latest props from here.
  const latest = useRef({ threshold, start, end })

  useEffect(() => {
    latest.current = { threshold, start, end }
  })

  const seriesKey = series.map((s) => `${s.id}:${s.color}`).join("|")

  useEffect(() => {
    const el = container.current
    if (!el) return
    const axis: uPlot.Axis = {
      stroke: () => cssColor("var(--muted)"),
      grid: { stroke: () => cssColor("var(--border)"), width: 1 },
      ticks: { show: false },
      font: "12px Inter Variable, sans-serif",
    }
    const options: uPlot.Options = {
      width: el.clientWidth,
      height,
      ms: 1,
      legend: { live: true },
      cursor: { drag: { x: false, y: false }, points: { size: 6 } },
      scales: {
        x: { time: true, range: () => [latest.current.start, latest.current.end] },
        y: {
          range: (_u, min, max) => {
            const { waspada, bahaya } = latest.current.threshold
            const lo = Math.min(min ?? type.normal, type.normal, waspada, bahaya)
            const hi = Math.max(max ?? type.normal, type.normal, waspada, bahaya)
            const pad = (hi - lo) * 0.1
            return [lo - pad, hi + pad]
          },
        },
      },
      series: [
        { label: tr("Waktu", "Time"), value: (_u, v) => (v == null ? "–" : new Date(v).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })) },
        ...series.map((s) => ({
          label: s.label,
          stroke: () => cssColor(s.color),
          width: 1.5,
          spanGaps: false,
          points: { show: false },
          value: (_u: uPlot, v: number | null) => (v == null ? "–" : `${formatValue(v, type)} ${type.unit}`),
        })),
      ],
      axes: [
        {
          ...axis,
          // Times within a day, dates beyond it, in the Indonesian format.
          values: (u, splits) => {
            const multiDay = u.scales.x.max! - u.scales.x.min! > 36 * 3_600_000
            return splits.map((t) => new Date(t).toLocaleString(locale(), multiDay ? { day: "numeric", month: "short" } : { hour: "2-digit", minute: "2-digit" }))
          },
        },
        { ...axis, size: 48, values: (_u, values) => values.map((v) => formatValue(v, type)) }],
      hooks: {
        drawClear: [
          (u) => {
            const { waspada, bahaya, arah } = latest.current.threshold
            const { ctx, bbox } = u
            const y = (v: number) => u.valToPos(v, "y", true)
            const edge = arah === "atas" ? u.scales.y.max! : u.scales.y.min!
            ctx.save()
            ctx.beginPath()
            ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height)
            ctx.clip()
            const band = (from: number, to: number, color: string) => {
              ctx.globalAlpha = 0.12
              ctx.fillStyle = cssColor(color)
              ctx.fillRect(bbox.left, Math.min(y(from), y(to)), bbox.width, Math.abs(y(to) - y(from)))
            }
            band(waspada, bahaya, "var(--warning)")
            band(bahaya, edge, "var(--danger)")
            ctx.globalAlpha = 1
            ctx.setLineDash([6, 4])
            ctx.lineWidth = devicePixelRatio
            for (const [value, color] of [
              [waspada, "var(--warning)"],
              [bahaya, "var(--danger)"],
            ] as const) {
              ctx.strokeStyle = cssColor(color)
              ctx.beginPath()
              ctx.moveTo(bbox.left, y(value))
              ctx.lineTo(bbox.left + bbox.width, y(value))
              ctx.stroke()
            }
            ctx.restore()
          },
        ],
      },
    }
    plot.current = new uPlot(options, [[]], el)
    const resize = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height }))
    resize.observe(el)
    return () => {
      resize.disconnect()
      plot.current?.destroy()
      plot.current = null
    }
    // A new series set needs a new plot; data and window changes go through setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey, height, type])

  useEffect(() => {
    if (!plot.current) return
    // All series share one x axis; a missing reading becomes a gap rather than a joined line.
    const times = [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b)
    const columns = series.map((s) => {
      const byTime = new Map(s.points.map((p) => [p.t, p.v]))
      return times.map((t) => byTime.get(t) ?? null)
    })
    plot.current.setData([times, ...columns] as uPlot.AlignedData)
  })

  return <div ref={container} className={cn("min-w-0", className)} />
}

/** A tiny line of recent values, scaled to its own range. */
export function Sparkline({ points, className }: { points: Reading[]; className?: string }) {
  if (points.length < 2) return <svg className={className} aria-hidden />
  const [t0, t1] = [points[0].t, points.at(-1)!.t]
  const values = points.map((p) => p.v)
  const [lo, hi] = [Math.min(...values), Math.max(...values)]
  const xy = (p: Reading) => `${(((p.t - t0) / (t1 - t0 || 1)) * 100).toFixed(1)},${(30 - ((p.v - lo) / (hi - lo || 1)) * 28 - 1).toFixed(1)}`
  // A gap in the readings starts a new segment instead of being bridged.
  const d = points.map((p, i) => `${i && p.t - points[i - 1].t <= 5_000 ? "L" : "M"}${xy(p)}`).join("")
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
