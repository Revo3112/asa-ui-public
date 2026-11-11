import { useRef, useState, type KeyboardEvent } from "react"
import { Button, Label, Meter, Skeleton, ToggleButton, ToggleButtonGroup, Tooltip } from "@heroui/react"
import { useSearchParams } from "react-router"

import { EvilPieChart } from "@/shared/charts/evilcharts/charts/recharts-pie-chart"
import { useFilters, useSetParams } from "@/shared/components/filter-bar"
import { REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { apdTypes, TARGET_KEPATUHAN } from "@/shared/config/apd"
import { getApdBreakdown, getCompliance, getHeatmap, type ComplianceBy } from "@/features/ppe/data/apd"
import { master } from "@/shared/data/master"
import { cn } from "@/shared/lib/utils"
import { locale, tr } from "@/shared/lib/i18n"

export const formatPercent = (value: number) => `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value)}%`

/** Weekday name in the interface language; `day` as in `Date.getDay()` (0 is Sunday). 7 Jan 2024 was a Sunday. */
export const dayName = (day: number) => new Date(2024, 0, 7 + day).toLocaleDateString(locale(), { weekday: "long" })
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}.00`

/** Narrowing for the violation table only, set by clicking a camera bar or a heatmap cell. */
export function useListFilters() {
  const [params] = useSearchParams()
  const hari = params.get("hari") ?? ""
  const jam = params.get("jam") ?? ""
  const kamera = params.get("kamera")
  return {
    hari: /^[0-6]$/.test(hari) ? Number(hari) : null,
    jam: /^(1?\d|2[0-3])$/.test(jam) ? Number(jam) : null,
    kamera: master().kamera.some((c) => c.id === kamera) ? kamera : null,
  }
}

const TOP = 10
const views: { id: ComplianceBy; label: string }[] = [
  { id: "zona", get label() { return tr("Zona", "Zone") } },
  { id: "kamera", get label() { return tr("Kamera", "Camera") } },
  { id: "shift", label: "Shift" },
]

export function ComplianceWidget({ className }: { className?: string }) {
  const { filters, key } = useFilters()
  const list = useListFilters()
  const setParams = useSetParams()
  const [by, setBy] = useState<ComplianceBy>("zona")
  const [showAll, setShowAll] = useState(false)
  const query = useWidgetData(() => getCompliance(filters, by), `${key}|${by}`, REFRESH_MS)
  const active = by === "kamera" ? list.kamera : filters[by]

  return (
    <Widget
      title={tr("Kepatuhan APD", "PPE compliance")}
      description={tr(`Terendah di atas. Skala 80–100%, target ${TARGET_KEPATUHAN}%. Pilih baris untuk memfilter daftar.`, `Lowest first. Scale 80–100%, target ${TARGET_KEPATUHAN}%. Pick a row to filter the list.`)}
      className={className}
      action={
        <ToggleButtonGroup
          aria-label={tr("Kelompokkan per", "Group by")}
          size="sm"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[by]}
          onSelectionChange={(keys) => setBy([...keys][0] as ComplianceBy)}
        >
          {views.map((view, i) => (
            <ToggleButton key={view.id} id={view.id}>
              {i > 0 && <ToggleButtonGroup.Separator />}
              {view.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      }
    >
      <WidgetBody
        query={query}
        skeleton={
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9 rounded-lg" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={tr("Tidak ada data kepatuhan untuk filter ini.", "No compliance data for these filters.")}
      >
        {(rows) => (
          <div className="flex flex-col gap-2">
            <ol className="flex flex-col gap-1">
              {(showAll ? rows : rows.slice(0, TOP)).map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-pressed={active === row.id}
                    onClick={() => setParams({ [by]: active === row.id ? null : row.id })}
                    className={cn("block w-full rounded-lg p-2 text-left hover:bg-default", active === row.id && "bg-default")}
                  >
                    <Meter
                      value={row.kepatuhan}
                      minValue={80}
                      valueLabel={`${formatPercent(row.kepatuhan)} · ${row.pelanggaran} ${tr("pelanggaran", "violations")}`}
                      size="sm"
                      color={row.kepatuhan < TARGET_KEPATUHAN ? "warning" : "success"}
                    >
                      <Label>{row.label}</Label>
                      <Meter.Output />
                      <Meter.Track>
                        <Meter.Fill />
                      </Meter.Track>
                    </Meter>
                  </button>
                </li>
              ))}
            </ol>
            {rows.length > TOP && (
              <Button size="sm" variant="tertiary" className="self-start" onPress={() => setShowAll((v) => !v)}>
                {showAll ? tr(`Tampilkan ${TOP} terendah`, `Show lowest ${TOP}`) : tr(`Lihat semua (${rows.length})`, `See all (${rows.length})`)}
              </Button>
            )}
          </div>
        )}
      </WidgetBody>
    </Widget>
  )
}

const apdConfig = Object.fromEntries(apdTypes.map((t) => [t.id, { label: t.label, colors: { light: [t.color], dark: [t.color] } }]))

export function ApdWidget({ className }: { className?: string }) {
  const { filters, key } = useFilters()
  const setParams = useSetParams()
  const query = useWidgetData(() => getApdBreakdown(filters), key, REFRESH_MS)
  const select = (id: string | null) => setParams({ apd: id === filters.apd ? null : id })

  return (
    <Widget title={tr("Pelanggaran per jenis APD", "Violations per PPE type")} description={tr("Pilih jenis untuk memfilter halaman.", "Pick a type to filter the page.")} className={className}>
      <WidgetBody
        query={query}
        skeleton={<Skeleton className="mx-auto size-44 rounded-full" />}
        isEmpty={(rows) => rows.every((r) => r.pelanggaran === 0)}
        empty={tr("Tidak ada pelanggaran pada periode ini.", "No violations in this period.")}
      >
        {(rows) => {
          const total = rows.reduce((sum, r) => sum + r.pelanggaran, 0)
          return (
            <div className="flex flex-1 flex-col items-center gap-4">
              <EvilPieChart
                key={filters.apd}
                data={rows}
                dataKey="pelanggaran"
                nameKey="apd"
                config={apdConfig}
                defaultSelectedSector={filters.apd === "all" ? null : filters.apd}
                onSelectionChange={(selection) => select(selection?.dataKey ?? null)}
                className="aspect-auto min-h-44 w-full flex-1"
              >
                <EvilPieChart.Pie innerRadius="60%" paddingAngle={2} cornerRadius={4} isClickable />
                <EvilPieChart.Tooltip />
              </EvilPieChart>
              <ul className="flex w-full flex-col gap-1">
                {rows.map((row) => {
                  const type = apdTypes.find((t) => t.id === row.apd)
                  return (
                    <li key={row.apd}>
                      <button
                        type="button"
                        aria-pressed={filters.apd === row.apd}
                        onClick={() => select(row.apd)}
                        className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-default", filters.apd === row.apd && "bg-default")}
                      >
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: type?.color }} aria-hidden />
                        <span className="min-w-0 flex-1">{type?.label ?? row.apd}</span>
                        <span className="tabular-nums">{row.pelanggaran}</span>
                        <span className="w-12 text-right text-muted tabular-nums">{formatPercent(total ? (row.pelanggaran / total) * 100 : 0)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        }}
      </WidgetBody>
    </Widget>
  )
}

/** Monday first. Values are `Date.getDay()` indexes. */
const weekdays = [1, 2, 3, 4, 5, 6, 0]
const hours = Array.from({ length: 24 }, (_, h) => h)

/** One hue at rising strength, so it reads without relying on red versus green. Zero stays neutral. */
const shade = (n: number, max: number) => (n === 0 ? "var(--default)" : `color-mix(in oklab, var(--danger) ${Math.round(15 + (85 * n) / max)}%, transparent)`)

/** `fill` stretches the rows to the height it is given (a tab panel) instead of fixed 24 px cells. */
export function HeatmapWidget({ className, fill = false }: { className?: string; fill?: boolean }) {
  const { filters, key } = useFilters()
  const list = useListFilters()
  const setParams = useSetParams()
  const query = useWidgetData(() => getHeatmap(filters), key, REFRESH_MS)
  // Roving focus: the grid is one Tab stop and the arrow keys move between cells.
  const [focus, setFocus] = useState<[number, number]>([0, 0])
  const gridRef = useRef<HTMLDivElement>(null)

  const choose = (day: number, hour: number) =>
    list.hari === day && list.jam === hour ? setParams({ hari: null, jam: null }) : setParams({ hari: String(day), jam: String(hour) })

  const onKeyDown = (e: KeyboardEvent, row: number, hour: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      choose(weekdays[row], hour)
      return
    }
    const next = { ArrowUp: [row - 1, hour], ArrowDown: [row + 1, hour], ArrowLeft: [row, hour - 1], ArrowRight: [row, hour + 1], Home: [row, 0], End: [row, 23] }[e.key]
    if (!next) return
    e.preventDefault()
    const cell: [number, number] = [Math.min(6, Math.max(0, next[0])), Math.min(23, Math.max(0, next[1]))]
    setFocus(cell)
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${cell[0]}-${cell[1]}"]`)?.focus()
  }

  return (
    <Widget
      title={tr("Pelanggaran per jam dan hari", "Violations by hour and day")}
      description={
        filters.periode === "today"
          ? tr("Hanya hari ini. Pilih 7 atau 30 hari terakhir untuk melihat pola mingguan.", "Today only. Pick the last 7 or 30 days to see the weekly pattern.")
          : tr("Pilih sel untuk memfilter daftar ke jam itu.", "Pick a cell to filter the list to that hour.")
      }
      className={className}
      fill={fill}
    >
      <WidgetBody
        query={query}
        skeleton={<Skeleton className="h-52 rounded-lg" />}
        isEmpty={(grid) => grid.flat().every((n) => n === 0)}
        empty={tr("Tidak ada pelanggaran pada periode ini.", "No violations in this period.")}
      >
        {(grid) => {
          const max = Math.max(...grid.flat())
          return (
            <div className={cn("flex flex-col gap-3", fill && "h-full")}>
              <div className={cn("relative overflow-x-auto", fill && "min-h-0 flex-1")}>
                <div ref={gridRef} role="grid" aria-label={tr("Jumlah pelanggaran per jam dan hari", "Number of violations by hour and day")} className={cn("grid min-w-[36rem] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-0.5", fill && "h-full min-h-64 grid-rows-[auto_repeat(7,minmax(0,1fr))]")}>
                  <div role="row" className="contents">
                    <span role="columnheader" />
                    {hours.map((h) => (
                      <span key={h} role="columnheader" className="text-center text-xs text-muted">
                        <span className={h % 3 ? "sr-only" : undefined}>{String(h).padStart(2, "0")}</span>
                      </span>
                    ))}
                  </div>
                  {weekdays.map((day, row) => (
                    <div key={day} role="row" className="contents">
                      <span role="rowheader" className="self-center text-xs text-muted">
                        {dayName(day).slice(0, 3)}
                      </span>
                      {hours.map((h) => {
                        const n = grid[day][h]
                        const range = `${dayName(day)}, ${hourLabel(h)}–${hourLabel((h + 1) % 24)}`
                        const isSelected = list.hari === day && list.jam === h
                        return (
                          <div key={h} role="gridcell" className={cn(fill && "min-h-6")}>
                            <Tooltip delay={0} closeDelay={0}>
                              <Tooltip.Trigger
                                data-cell={`${row}-${h}`}
                                tabIndex={focus[0] === row && focus[1] === h ? 0 : -1}
                                aria-label={`${range}: ${n} ${tr("pelanggaran", "violations")}`}
                                aria-pressed={isSelected}
                                onClick={() => choose(day, h)}
                                onKeyDown={(e: KeyboardEvent) => onKeyDown(e, row, h)}
                                onFocus={() => setFocus([row, h])}
                                className={cn("block w-full cursor-pointer rounded-sm", fill ? "h-full min-h-6" : "h-6", isSelected && "ring-2 ring-foreground ring-offset-1 ring-offset-surface")}
                                style={{ background: shade(n, max) }}
                              />
                              <Tooltip.Content>
                                {range}: <strong>{n}</strong> {tr("pelanggaran", "violations")}
                              </Tooltip.Content>
                            </Tooltip>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted" aria-hidden>
                <span>0</span>
                {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                  <span key={step} className="h-3 w-5 rounded-sm" style={{ background: shade(step * max, max) }} />
                ))}
                <span>{max} {tr("per jam", "per hour")}</span>
              </div>
            </div>
          )
        }}
      </WidgetBody>
    </Widget>
  )
}
