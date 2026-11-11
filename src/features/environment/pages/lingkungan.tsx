import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button, Card, Chip, DateField, DateRangePicker, ListBox, RangeCalendar, Select, Skeleton, Tabs } from "@heroui/react"
import { getLocalTimeZone, parseDate, today } from "@internationalized/date"
import { Activity, CircleCheck, CircleOff, SlidersHorizontal, TriangleAlert } from "lucide-react"
import { useSearchParams } from "react-router"

import { FilterButton, useFilters, useSetParams } from "@/shared/components/filter-bar"
import { KpiCard, KpiGrid } from "@/shared/components/kpi-card"
import { formatValue, SensorChart, type ChartSeries } from "@/features/environment/components/sensor-chart"
import { AlarmHistory, clock, SensorTable, stats, statusMeta, urgency } from "@/features/environment/components/sensor-panels"
import { ThresholdSettings } from "@/features/environment/components/threshold-settings"
import { useSensorStream } from "@/features/environment/components/use-sensor-stream"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import { lineColors, sensorTypes, STALE_MS, type Threshold } from "@/shared/config/lingkungan"
import { getHistory, getSensors, getThresholds, saveThreshold, type Reading, type Sensor, type SensorStatus } from "@/features/environment/data/lingkungan"
import { placesIn } from "@/shared/data/scope"
import { canEditThresholds, useRole } from "@/shared/auth/session"
import { tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"

const MINUTE = 60_000
const ranges = [
  { id: "5m", get label() { return tr("Live 5 menit", "Live 5 minutes") }, ms: 5 * MINUTE, live: true },
  { id: "15m", get label() { return tr("Live 15 menit", "Live 15 minutes") }, ms: 15 * MINUTE, live: true },
  { id: "1j", get label() { return tr("Live 1 jam", "Live 1 hour") }, ms: 60 * MINUTE, live: true },
  { id: "24j", get label() { return tr("24 jam terakhir", "Last 24 hours") }, ms: 24 * 60 * MINUTE, live: false },
  { id: "7h", get label() { return tr("7 hari terakhir", "Last 7 days") }, ms: 7 * 24 * 60 * MINUTE, live: false },
  { id: "custom", get label() { return tr("Pilih tanggal", "Pick dates") }, ms: 0, live: false },
] as const
type Range = (typeof ranges)[number]

const statuses: SensorStatus[] = ["bahaya", "waspada", "offline", "aman"]
/** A live feed that has sent nothing for this long is shown as disconnected. */
const SILENT_MS = 5_000
const isDate = (value: string | null) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** As many columns as sensor types at xl, so the tiles span the card. Literal names for Tailwind. */
const typeCols: Record<number, string> = { 1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 5: "xl:grid-cols-5" }

/**
 * Gives the chart the height left in its column (the chart library needs a number), and a fixed
 * height on narrow screens where the page scrolls.
 */
function ChartBox({ children }: { children: (height: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(240)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      // The legend under the plot takes about 40 px; round so small changes don't rebuild the plot.
      const h = window.matchMedia("(min-width: 64rem)").matches ? Math.max(200, Math.round((el.clientHeight - 44) / 20) * 20) : 240
      setHeight((old) => (old === h ? old : h))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="min-h-0 lg:flex-1">
      {children(height)}
    </div>
  )
}

function LingkunganContent({ onRetry }: { onRetry: () => void }) {
  const { filters, key } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const role = useRole()
  const range: Range = ranges.find((r) => r.id === params.get("rentang")) ?? ranges[1]
  const statusFilter = statuses.find((s) => s === params.get("status")) ?? null

  const sensorsQuery = useWidgetData(() => getSensors(filters), key)
  const thresholdsQuery = useWidgetData(() => getThresholds(filters), key)
  const [savedThresholds, setSavedThresholds] = useState<Record<string, Threshold>>({})
  const thresholds = thresholdsQuery.data && { ...thresholdsQuery.data, ...savedThresholds }
  const { snapshot, error } = useSensorStream(filters, sensorsQuery.data, thresholds)

  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // Past ranges are read once, against the moment they were picked, not on every live tick.
  const [anchor, setAnchor] = useState(() => Date.now())

  const dari = params.get("dari")
  const sampai = params.get("sampai")
  const custom = range.id === "custom" && isDate(dari) && isDate(sampai) ? { from: new Date(`${dari}T00:00`).getTime(), to: Math.min(anchor, new Date(`${sampai}T23:59:59`).getTime()) } : null
  const past = range.live ? null : range.id === "custom" ? custom : { from: anchor - range.ms, to: anchor }
  const history = useWidgetData(() => (past ? getHistory(filters, past.from, past.to) : Promise.resolve(null)), `${key}|${past?.from}|${past?.to}`)

  const now = snapshot?.now ?? anchor
  const end = pausedAt ?? now
  const window = past ? { start: past.from, end: past.to } : { start: end - range.ms, end }

  const sensors = sensorsQuery.data ?? []
  const shownTypes = sensorTypes.filter((type) => sensors.some((s) => s.type === type.id))
  const places = placesIn(filters).map((p) => `${p.site}/${p.zona}`)
  const colorOf = (s: Sensor) => lineColors[Math.max(0, places.indexOf(`${s.site}/${s.zona.id}`)) % lineColors.length]
  const pointsOf = (sensor: Sensor): Reading[] =>
    past
      ? (history.data?.[sensor.id] ?? []).map((b) => ({ t: b.t, v: b.avg }))
      : (snapshot?.buffers[sensor.id] ?? []).filter((p) => p.t >= window.start && p.t <= window.end)
  const seriesOf = (typeId: string): ChartSeries[] =>
    sensors.filter((s) => s.type === typeId).map((s) => ({ id: s.id, label: s.zona.label, color: colorOf(s), points: pointsOf(s) }))

  const counts = Object.fromEntries(statuses.map((s) => [s, sensors.filter((sensor) => snapshot?.status[sensor.id] === s).length])) as Record<SensorStatus, number>
  const silent = !!snapshot && (!snapshot.lastBatchAt || snapshot.now - snapshot.lastBatchAt > SILENT_MS)
  const connection = filters.demo || error ? null : pausedAt ? "paused" : silent ? "silent" : "live"

  const query = {
    data: error ? undefined : snapshot && thresholds ? { snapshot, thresholds } : undefined,
    error: error ?? sensorsQuery.error ?? thresholdsQuery.error,
    isLoading: !snapshot,
    retry: onRetry,
  }
  const skeleton = (h: string) => <Skeleton className={`${h} rounded-lg`} />

  const pickRange = (id: string) => {
    setAnchor(Date.now())
    setPausedAt(null)
    const today = new Date().toLocaleDateString("sv-SE")
    setParams({ rentang: id === "15m" ? null : id, ...(id === "custom" ? { dari: dari ?? today, sampai: sampai ?? today } : { dari: null, sampai: null }) })
  }

  // The type shown in the big chart: what the user picked, else the most urgent one.
  const worstType = [...shownTypes].sort((a, b) => worstOf(b.id) - worstOf(a.id))[0]
  function worstOf(typeId: string) {
    return Math.max(-1, ...sensors.filter((s) => s.type === typeId).map((s) => urgency[snapshot?.status[s.id] ?? "aman"]))
  }
  const picked = shownTypes.find((t) => t.id === params.get("jenis")) ?? worstType
  const pickedSeries = picked ? seriesOf(picked.id) : []
  const pickedSummary = past && picked ? stats(pickedSeries.flatMap((s) => s.points)) : null

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-11rem)] lg:min-h-[34rem]">
      <div role="toolbar" aria-label={tr("Pengaturan data sensor", "Sensor data settings")} className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["zona"]} />
        <Select aria-label={tr("Rentang waktu", "Time range")} className="w-44" value={range.id} onChange={(id) => id && pickRange(String(id))}>
          <Select.Trigger className="h-8 min-h-8">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {ranges.map((r) => (
                <ListBox.Item key={r.id} id={r.id} textValue={r.label}>
                  {r.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {range.id === "custom" && (
          <DateRangePicker
            aria-label={tr("Tanggal", "Date")}
            className="w-72"
            value={isDate(dari) && isDate(sampai) ? { start: parseDate(dari!), end: parseDate(sampai!) } : null}
            minValue={today(getLocalTimeZone()).subtract({ days: 7 })}
            maxValue={today(getLocalTimeZone())}
            onChange={(value) => {
              if (!value) return
              setAnchor(Date.now())
              setParams({ dari: value.start.toString(), sampai: value.end.toString() })
            }}
          >
            <DateField.Group>
              <DateField.InputContainer>
                <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                <DateRangePicker.RangeSeparator />
                <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
              </DateField.InputContainer>
              <DateField.Suffix>
                <DateRangePicker.Trigger>
                  <DateRangePicker.TriggerIndicator />
                </DateRangePicker.Trigger>
              </DateField.Suffix>
            </DateField.Group>
            <DateRangePicker.Popover>
              <RangeCalendar aria-label={tr("Pilih rentang tanggal", "Pick a date range")}>
                <RangeCalendar.Header>
                  <RangeCalendar.YearPickerTrigger>
                    <RangeCalendar.YearPickerTriggerHeading />
                    <RangeCalendar.YearPickerTriggerIndicator />
                  </RangeCalendar.YearPickerTrigger>
                  <RangeCalendar.NavButton slot="previous" />
                  <RangeCalendar.NavButton slot="next" />
                </RangeCalendar.Header>
                <RangeCalendar.Grid>
                  <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
                  <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
                </RangeCalendar.Grid>
              </RangeCalendar>
            </DateRangePicker.Popover>
          </DateRangePicker>
        )}
        {connection && (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Chip size="sm" color={connection === "live" ? "success" : connection === "paused" ? "warning" : "danger"}>
              {connection === "live" ? "Live" : connection === "paused" ? tr("Dijeda", "Paused") : tr("Terputus", "Disconnected")}
            </Chip>
            <span className="text-muted max-sm:hidden">
              {connection === "paused" ? tr(`Grafik berhenti di ${clock(pausedAt!)}`, `Chart stopped at ${clock(pausedAt!)}`) : snapshot?.lastBatchAt ? `Update ${clock(snapshot.lastBatchAt)}` : tr("Menunggu data", "Waiting for data")}
            </span>
          </p>
        )}
        <Button size="sm" variant="tertiary" className="ms-auto" onPress={() => setIsSettingsOpen(true)} isDisabled={!thresholds}>
          <SlidersHorizontal aria-hidden />
          Threshold
        </Button>
      </div>

      <KpiGrid>
        <KpiCard compact icon={CircleCheck} label={tr("Aman", "Safe")} value={snapshot ? counts.aman : "–"} tone={snapshot && counts.aman === sensors.length ? "success" : "default"} note={tr(`dari ${sensors.length} sensor`, `of ${sensors.length} sensors`)} />
        <KpiCard compact icon={Activity} label={tr("Waspada", "Warning")} value={snapshot ? counts.waspada : "–"} tone={counts.waspada ? "warning" : "default"} />
        <KpiCard compact icon={TriangleAlert} label={tr("Bahaya", "Danger")} value={snapshot ? counts.bahaya : "–"} tone={counts.bahaya ? "danger" : "default"} />
        <KpiCard compact icon={CircleOff} label={tr("Tidak ada data", "No data")} value={snapshot ? counts.offline : "–"} note={counts.offline ? tr(`Tanpa kiriman ${STALE_MS / 1000} detik`, `Nothing for ${STALE_MS / 1000} seconds`) : undefined} />
      </KpiGrid>

      <WidgetBody
        query={query}
        skeleton={
          <div className="grid gap-3 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        }
        isEmpty={() => sensors.length === 0}
        empty={tr("Tidak ada sensor di zona ini.", "No sensors in this zone.")}
      >
        {({ snapshot: snap, thresholds: th }) => (
          <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
            {/* Left: one tile per sensor type (the worst reading of that type); the picked one is charted below. */}
            <Card className="min-w-0 lg:min-h-0">
              <Card.Content className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
                {/* The sensor types as one segmented control, like the tabs on the right: pick one to chart it. Colour only when a reading is not safe. */}
                <div role="radiogroup" aria-label={tr("Jenis sensor", "Sensor types")} className={cn("grid grid-cols-2 gap-1 rounded-2xl bg-default p-1 sm:grid-cols-3", typeCols[shownTypes.length] ?? "xl:grid-cols-5")}>
                  {shownTypes.map((type) => {
                    const ofType = sensors.filter((s) => s.type === type.id)
                    const worst = [...ofType].sort((a, b) => urgency[snap.status[b.id]] - urgency[snap.status[a.id]])[0]!
                    const status = snap.status[worst.id]
                    const last = snap.buffers[worst.id]?.at(-1)
                    const on = picked?.id === type.id
                    return (
                      <button
                        key={type.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setParams({ jenis: type.id })}
                        className={cn("flex min-w-0 flex-col items-start rounded-xl px-3 py-2 text-left transition-colors", on ? "bg-surface shadow-sm" : "hover:bg-surface/60")}
                      >
                        <span className="w-full truncate text-xs text-muted">{type.label}</span>
                        <span className="flex w-full items-baseline gap-1.5">
                          <span className={cn("font-display text-lg font-semibold tabular-nums", status === "aman" ? "text-foreground" : statusMeta[status].text, status === "offline" && "line-through decoration-1")}>
                            {last ? formatValue(last.v, type) : "–"}
                          </span>
                          <span className="text-xs text-muted">{type.unit}</span>
                          {status !== "aman" && <span className={cn("ms-auto text-xs font-medium", statusMeta[status].text)}>{statusMeta[status].label}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {picked && (
                  <div className="flex flex-col gap-1 lg:min-h-0 lg:flex-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {picked.label} ({picked.unit})
                      </span>
                      <span className="text-xs text-muted">{pickedSummary ? `Min ${formatValue(pickedSummary.min, picked)} · ${tr("rata-rata", "avg")} ${formatValue(pickedSummary.avg, picked)} · ${tr("maks", "max")} ${formatValue(pickedSummary.max, picked)}` : range.label}</span>
                    </p>
                    <ChartBox>{(h) => (past && !history.data ? skeleton("h-52") : <SensorChart key={picked.id} type={picked} threshold={th[picked.id]} series={pickedSeries} start={window.start} end={window.end} height={h} />)}</ChartBox>
                  </div>
                )}
              </Card.Content>
            </Card>

            {/* Right: what changed and every sensor, one tab at a time. */}
            <Card className="min-w-0 lg:min-h-0">
              <Card.Content className="flex flex-col lg:min-h-0 lg:flex-1">
                <Tabs className="flex flex-col lg:min-h-0 lg:flex-1">
                  <Tabs.ListContainer>
                    <Tabs.List aria-label={tr("Detail sensor", "Sensor detail")}>
                      <Tabs.Tab id="alarm">
                        {tr("Riwayat alarm", "Alarm history")}
                        <Tabs.Indicator />
                      </Tabs.Tab>
                      <Tabs.Tab id="sensor">
                        {tr(`Sensor (${sensors.length})`, `Sensors (${sensors.length})`)}
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    </Tabs.List>
                  </Tabs.ListContainer>
                  <Tabs.Panel id="alarm" className="max-h-[28rem] overflow-y-auto pt-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                    <AlarmHistory alarms={snap.alarms} className="max-h-none" />
                  </Tabs.Panel>
                  <Tabs.Panel id="sensor" className="max-h-[28rem] overflow-y-auto pt-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                    <div className="flex flex-col gap-2">
                      <Select aria-label={tr("Saring status", "Filter status")} className="w-44 self-end" value={statusFilter ?? "semua"} onChange={(value) => value && setParams({ status: value === "semua" ? null : String(value) })}>
                        <Select.Trigger className="h-8 min-h-8">
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {["semua", ...statuses].map((s) => (
                              <ListBox.Item key={s} id={s} textValue={s === "semua" ? tr("Semua status", "All statuses") : statusMeta[s as SensorStatus].label}>
                                {s === "semua" ? tr("Semua status", "All statuses") : statusMeta[s as SensorStatus].label}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      <SensorTable sensors={sensors.filter((s) => !statusFilter || snap.status[s.id] === statusFilter)} snapshot={snap} thresholds={th} window={window} pointsOf={pointsOf} />
                    </div>
                  </Tabs.Panel>
                </Tabs>
              </Card.Content>
            </Card>
          </div>
        )}
      </WidgetBody>
      {thresholds && (
        <ThresholdSettings
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          thresholds={thresholds}
          canEdit={canEditThresholds(role)}
          window={{ start: now - 15 * MINUTE, end: now }}
          preview={(typeId) =>
            sensors
              .filter((s) => s.type === typeId)
              .map((s) => ({
                id: s.id,
                label: s.zona.label,
                color: colorOf(s),
                points: (snapshot?.buffers[s.id] ?? []).filter((p) => p.t >= now - 15 * MINUTE),
              }))
          }
          onSave={async (typeId, threshold) => {
            const saved = await saveThreshold(typeId, threshold)
            setSavedThresholds((t) => ({ ...t, [typeId]: saved }))
          }}
        />
      )}
    </div>
  )
}

export function LingkunganPage() {
  const { key } = useFilters()
  const [attempt, setAttempt] = useState(0)
  return <LingkunganContent key={`${key}#${attempt}`} onRetry={() => setAttempt((n) => n + 1)} />
}
