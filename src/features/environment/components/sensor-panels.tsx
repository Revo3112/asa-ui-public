import { useState } from "react"
import { Card, Chip, Drawer, EmptyState, ScrollShadow, Table } from "@heroui/react"

import { formatValue, SensorChart, Sparkline, type ChartSeries } from "@/features/environment/components/sensor-chart"
import type { Alarm, SensorSnapshot } from "@/features/environment/components/use-sensor-stream"
import { sensorTypes, type SensorType, type Threshold } from "@/shared/config/lingkungan"
import type { Reading, Sensor, SensorStatus } from "@/features/environment/data/lingkungan"
import { cn } from "@/shared/lib/utils"
import { locale, tr } from "@/shared/lib/i18n"

export const statusMeta: Record<
  SensorStatus,
  {
    label: string
    color: "success" | "warning" | "danger" | "default"
    text: string
  }
> = {
  aman: { get label() { return tr("Aman", "Safe") }, color: "success", text: "text-success" },
  waspada: { get label() { return tr("Waspada", "Warning") }, color: "warning", text: "text-warning-ink" },
  bahaya: { get label() { return tr("Bahaya", "Danger") }, color: "danger", text: "text-danger" },
  offline: { get label() { return tr("Tidak ada data", "No data") }, color: "default", text: "text-muted" },
}

/** Most urgent first. A stale sensor ranks above a healthy one: nobody knows what it reads. */
export const urgency: Record<SensorStatus, number> = {
  bahaya: 3,
  waspada: 2,
  offline: 1,
  aman: 0,
}

export const clock = (t: number) => new Date(t).toLocaleTimeString(locale())
const typeOf = (s: Sensor) => sensorTypes.find((t) => t.id === s.type)!

/** "Tidak ada data sejak 10.30.12" for a stale sensor, otherwise the time of its last reading. */
export function lastSeen(status: SensorStatus, last?: Reading) {
  if (!last) return tr("Belum ada data", "No data yet")
  return status === "offline" ? tr(`Tidak ada data sejak ${clock(last.t)}`, `No data since ${clock(last.t)}`) : `Update ${clock(last.t)}`
}

export function stats(points: { v: number }[]) {
  if (!points.length) return null
  const values = points.map((p) => p.v)
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
  }
}

/** As many columns as cards at xl, so a site with fewer sensor types leaves no empty slot. */
const xlCols: Record<number, string> = { 1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 5: "xl:grid-cols-5" }

/** One card per sensor type, showing its most urgent sensor. */
export function TypeCards({ sensors, snapshot }: { sensors: Sensor[]; snapshot: SensorSnapshot }) {
  const shown = sensorTypes.filter((type) => sensors.some((s) => s.type === type.id)).length
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", xlCols[shown] ?? "xl:grid-cols-5")}>
      {sensorTypes.map((type) => {
        const ofType = sensors.filter((s) => s.type === type.id)
        if (!ofType.length) return null
        const worst = [...ofType].sort((a, b) => urgency[snapshot.status[b.id]] - urgency[snapshot.status[a.id]])[0]
        const status = snapshot.status[worst.id]
        const points = snapshot.buffers[worst.id] ?? []
        const last = points.at(-1)
        const recent = points.filter((p) => p.t >= snapshot.now - 5 * 60_000)
        return (
          <Card key={type.id} className="min-w-0">
            <Card.Header className="flex-row items-center justify-between gap-2">
              <Card.Title render={(props) => <h2 {...props} />}>{type.label}</Card.Title>
              <Chip size="sm" color={statusMeta[status].color}>
                {statusMeta[status].label}
              </Chip>
            </Card.Header>
            <Card.Content className="gap-2">
              <p className={cn("text-2xl font-semibold tabular-nums", status === "offline" ? "text-muted line-through decoration-1" : statusMeta[status].text)}>
                {last ? formatValue(last.v, type) : "–"} <span className="text-base font-normal text-muted">{type.unit}</span>
              </p>
              <Sparkline points={recent} className={cn("h-8 w-full", statusMeta[status].text)} />
              <Card.Description>
                {worst.zona.label}
                {ofType.length > 1 && tr(` · terburuk dari ${ofType.length} sensor`, ` · worst of ${ofType.length} sensors`)} · {lastSeen(status, last)}
              </Card.Description>
            </Card.Content>
          </Card>
        )
      })}
    </div>
  )
}

export function AlarmHistory({ alarms, className }: { alarms: Alarm[]; className?: string }) {
  if (!alarms.length)
    return (
      <EmptyState>
        <p>{tr("Belum ada perubahan status sejak halaman dibuka.", "No status change since the page opened.")}</p>
      </EmptyState>
    )
  return (
    // Focusable and labelled so the list can be scrolled from the keyboard.
    <ScrollShadow className={cn("max-h-96", className)} tabIndex={0} role="region" aria-label={tr("Riwayat alarm", "Alarm history")}>
      <ol className="flex flex-col divide-y divide-border">
        {alarms.map((alarm) => (
          <li key={alarm.id} className="flex items-start gap-3 py-2">
            <Chip size="sm" color={statusMeta[alarm.to].color} className="mt-0.5 shrink-0">
              {statusMeta[alarm.to].label}
            </Chip>
            <div className="min-w-0 flex-1 text-sm">
              <p>{alarm.sensor.label}</p>
              <p className="text-muted">
                {statusMeta[alarm.from].label} → {statusMeta[alarm.to].label}, {clock(alarm.at)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </ScrollShadow>
  )
}

type SensorTableProps = {
  sensors: Sensor[]
  snapshot: SensorSnapshot
  thresholds: Record<string, Threshold>
  /** The chart window for the sensor drawer. */
  window: { start: number; end: number }
  /** Points to draw for one sensor in that window. */
  pointsOf: (sensor: Sensor) => Reading[]
}

/** Every sensor, most urgent first. A row opens a drawer with that sensor's chart. */
export function SensorTable({ sensors, snapshot, thresholds, window, pointsOf }: SensorTableProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const rows = [...sensors].sort((a, b) => urgency[snapshot.status[b.id]] - urgency[snapshot.status[a.id]] || a.label.localeCompare(b.label))
  const current = sensors.find((s) => s.id === openId)

  return (
    <>
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label={tr("Daftar sensor", "Sensor list")}
            className="min-w-[40rem]"
            onRowAction={(id) => {
              setOpenId(String(id))
              setIsOpen(true)
            }}
          >
            <Table.Header>
              <Table.Column isRowHeader>Sensor</Table.Column>
              <Table.Column>{tr("Zona", "Zone")}</Table.Column>
              <Table.Column>{tr("Nilai", "Value")}</Table.Column>
              <Table.Column>Status</Table.Column>
              <Table.Column>{tr("Update terakhir", "Last update")}</Table.Column>
            </Table.Header>
            <Table.Body
              items={rows}
              // The sensor objects never change, so the cached rows must be told the readings did.
              dependencies={[snapshot]}
              renderEmptyState={() => (
                <EmptyState>
                  <p>{tr("Tidak ada sensor dengan status ini.", "No sensor has this status.")}</p>
                </EmptyState>
              )}
            >
              {(sensor) => {
                const status = snapshot.status[sensor.id]
                const last = snapshot.buffers[sensor.id]?.at(-1)
                const type = typeOf(sensor)
                return (
                  <Table.Row id={sensor.id} textValue={sensor.label}>
                    <Table.Cell>{type.label}</Table.Cell>
                    <Table.Cell>{sensor.zona.label}</Table.Cell>
                    <Table.Cell className={cn("tabular-nums", status === "offline" && "text-muted")}>
                      {last ? `${formatValue(last.v, type)} ${type.unit}` : "–"}
                    </Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" color={statusMeta[status].color}>
                        {statusMeta[status].label}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell className="text-muted">{lastSeen(status, last)}</Table.Cell>
                  </Table.Row>
                )
              }}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      <Drawer.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <Drawer.Content placement="right">
          {/* Width goes on the panel: Drawer.Content is the full-screen layer it slides across. */}
          <Drawer.Dialog className="sm:w-xl">
            <Drawer.CloseTrigger />
            {current && (
              <SensorDetail sensor={current} type={typeOf(current)} snapshot={snapshot} threshold={thresholds[current.type]} window={window} points={pointsOf(current)} />
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}

function SensorDetail({
  sensor,
  type,
  snapshot,
  threshold,
  window,
  points,
}: {
  sensor: Sensor
  type: SensorType
  snapshot: SensorSnapshot
  threshold: Threshold
  window: { start: number; end: number }
  points: Reading[]
}) {
  const status = snapshot.status[sensor.id]
  const summary = stats(points)
  const series: ChartSeries[] = [{ id: sensor.id, label: sensor.label, color: type.color, points }]
  const fmt = (v: number) => `${formatValue(v, type)} ${type.unit}`

  return (
    <>
      <Drawer.Header>
        <Drawer.Heading>{sensor.label}</Drawer.Heading>
        <p className="text-sm text-muted">{sensor.zona.label}</p>
      </Drawer.Header>
      <Drawer.Body className="flex flex-col gap-4">
        <SensorChart type={type} threshold={threshold} series={series} start={window.start} end={window.end} height={280} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Status</dt>
          <dd>
            <Chip size="sm" color={statusMeta[status].color}>
              {statusMeta[status].label}
            </Chip>
          </dd>
          <dt className="text-muted">{tr("Terakhir", "Latest")}</dt>
          <dd>{lastSeen(status, snapshot.buffers[sensor.id]?.at(-1))}</dd>
          <dt className="text-muted">Threshold</dt>
          <dd>
            {tr("Waspada", "Warning")} {threshold.arah === "atas" ? "≥" : "≤"} {fmt(threshold.waspada)}, {tr("bahaya", "danger")} {threshold.arah === "atas" ? "≥" : "≤"} {fmt(threshold.bahaya)}
          </dd>
          {summary && (
            <>
              <dt className="text-muted">{tr("Rentang ini", "This range")}</dt>
              <dd>
                Min {fmt(summary.min)} · rata-rata {fmt(summary.avg)} · maks {fmt(summary.max)}
              </dd>
            </>
          )}
        </dl>
      </Drawer.Body>
    </>
  )
}
