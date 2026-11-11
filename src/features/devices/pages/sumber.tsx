import { useState } from "react"
import { Button, Drawer, Skeleton, Tabs } from "@heroui/react"
import { BatteryLow, BatteryMedium, Camera, CameraOff, CircleCheck, Clock, Cpu, RotateCcw, Timer, Wifi, WifiOff, type LucideIcon } from "lucide-react"
import { useSearchParams } from "react-router"
import { ReferenceLine } from "recharts"

import { EvilBarChart } from "@/shared/charts/evilcharts/charts/recharts-bar-chart"
import { EvilLineChart } from "@/shared/charts/evilcharts/charts/recharts-line-chart"
import { FilterButton, useFilters, useSetParams } from "@/shared/components/filter-bar"
import { RegisterTable, type Column } from "@/shared/components/register-table"
import { SiteMap } from "@/features/devices/components/site-map"
import { SourceStatusChip } from "@/shared/components/status-chip"
import { IconTile, MiniBar } from "@/shared/components/visual"
import { InfoTip, REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { NewActionForm } from "@/shared/components/workflow-forms"
import { tierLabel } from "@/shared/config/indikasi"
import { lineColors } from "@/shared/config/lingkungan"
import { rules } from "@/shared/config/rules"
import { actionOwners, createAction } from "@/features/cases/data/kasus"
import { healthKindLabel, type HealthEvent } from "@/shared/data/skenario"
import { getMapSites } from "@/features/devices/data/peta"
import { getHealthEvents, getPowerSeries, getSources, getSyncLag, getUplinkSeries, sourceJenisLabel, type Series, type Source } from "@/features/devices/data/sumber"
import { duration, useNow } from "@/shared/lib/time"
import { dueDate, runWorkflow, useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { locale, tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"

const hourLabel = (t: number) => new Date(t).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
const shortDate = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** Several series on one hourly axis, as rows the line chart reads. */
function toRows(series: Series[]) {
  const times = series[0]?.points.map((p) => p.t) ?? []
  return times.map((t, i) => ({ jam: hourLabel(t), ...Object.fromEntries(series.map((s) => [s.id, s.points[i]?.v ?? null])) }))
}

const configOf = (series: Series[]) => Object.fromEntries(series.map((s, i) => [s.id, { label: s.label, colors: { light: [lineColors[i % lineColors.length]], dark: [lineColors[i % lineColors.length]] } }]))

function SeriesChart({ series, unit, threshold, domain }: { series: Series[]; unit: string; threshold: number; domain: [number, number | "auto"] }) {
  const rows = toRows(series)
  return (
    <EvilLineChart data={rows} config={configOf(series) as never} className="aspect-auto min-h-60">
      <EvilLineChart.Grid />
      <EvilLineChart.XAxis dataKey="jam" />
      <EvilLineChart.YAxis domain={domain} tickFormatter={(v: number) => `${v}${unit}`} />
      <EvilLineChart.Tooltip />
      <EvilLineChart.Legend />
      <ReferenceLine y={threshold} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: tr(`ambang ${threshold}${unit}`, `threshold ${threshold}${unit}`), position: "insideTopRight", fill: "var(--danger)", fontSize: 11 }} />
      {series.map((s) => (
        <EvilLineChart.Line key={s.id} dataKey={s.id} strokeWidth={2} />
      ))}
    </EvilLineChart>
  )
}

function UplinkWidget() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getUplinkSeries(filters), key, REFRESH_MS)
  return (
    <Widget title={tr("Uplink 24 jam", "Uplink, 24 hours")} description={tr(`Satu garis per terminal (site, pole, Manpack). Di bawah ${rules.linkDegradedMbps} Mbps dianggap menurun; nol berarti link putus.`, `One line per terminal (site, pole, Manpack). Below ${rules.linkDegradedMbps} Mbps counts as degraded; zero means the link was down.`)}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-60 rounded-lg" />} isEmpty={(s) => !s.length} empty={tr("Tidak ada terminal di site ini.", "No terminals at this site.")}>
        {(series) => <SeriesChart series={series} unit=" Mbps" threshold={rules.linkDegradedMbps} domain={[0, "auto"]} />}
      </WidgetBody>
    </Widget>
  )
}

function PowerWidget() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getPowerSeries(filters), key, REFRESH_MS)
  // A scope with no battery devices drops the panel, and the uplink chart takes the full row.
  if (query.data && !query.data.length) return null
  return (
    <Widget title={tr("Baterai 24 jam", "Battery, 24 hours")} description={tr(`Aegis Pole dan Manpack: terisi saat matahari, terkuras malam hari. Ambang risiko daya ${rules.powerRisk.socPercent}%.`, `Aegis Poles and Manpacks: charging while the sun is up, draining at night. Power-risk threshold ${rules.powerRisk.socPercent}%.`)}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-60 rounded-lg" />} isEmpty={(s) => !s.length} empty={tr("Tidak ada perangkat bertenaga baterai di site ini.", "No battery-powered devices at this site.")}>
        {(series) => <SeriesChart series={series} unit="%" threshold={rules.powerRisk.socPercent} domain={[0, 100]} />}
      </WidgetBody>
    </Widget>
  )
}

const lagConfig = { lag: { get label() { return tr("Jeda terlama (detik)", "Longest lag (seconds)") }, colors: { light: ["var(--chart-2)"], dark: ["var(--chart-2)"] } } }

function SyncLagWidget() {
  const { filters, key } = useFilters()
  const now = useNow(60_000)
  const query = useWidgetData(() => getSyncLag(filters), key, REFRESH_MS)
  return (
    <Widget title={tr("Jeda sinkron 24 jam", "Sync lag, 24 hours")} description={tr("Detik dari deteksi di edge sampai tersedia di control room, terlama per jam. Lonjakan = event yang ditahan antrean edge saat link putus.", "Seconds from detection on the edge to availability in the control room, longest per hour. A spike = events held in the edge queue while the link was down.")}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-60 rounded-lg" />} isEmpty={(p) => !p.length} empty={tr("Belum ada indikasi dalam 24 jam terakhir.", "No indications in the last 24 hours.")}>
        {(points) => {
          const end = Math.floor(now / 3_600_000) * 3_600_000
          const hours = Array.from({ length: 24 }, (_, i) => {
            const from = end - (23 - i) * 3_600_000
            const inHour = points.filter((p) => p.t >= from && p.t < from + 3_600_000)
            return { jam: hourLabel(from), lag: inHour.length ? Math.max(...inHour.map((p) => p.lag)) : 0 }
          })
          return (
            <EvilBarChart data={hours} config={lagConfig} className="aspect-auto min-h-60">
              <EvilBarChart.Grid />
              <EvilBarChart.XAxis dataKey="jam" />
              <EvilBarChart.YAxis tickFormatter={(v: number) => (v >= 120 ? tr(`${Math.round(v / 60)} mnt`, `${Math.round(v / 60)} min`) : tr(`${v} dtk`, `${v} s`))} />
              <EvilBarChart.Tooltip />
              <EvilBarChart.Bar dataKey="lag" />
            </EvilBarChart>
          )
        }}
      </WidgetBody>
    </Widget>
  )
}

function HealthWidget({ onOpen }: { onOpen: (id: string) => void }) {
  const { filters, key } = useFilters()
  const now = useNow(60_000)
  const query = useWidgetData(() => getHealthEvents(filters), key, REFRESH_MS)
  const columns: Column<HealthEvent>[] = [
    { id: "id", label: "ID", render: (h) => <span className="whitespace-nowrap text-muted tabular-nums">{h.id}</span> },
    { id: "sumber", label: tr("Sumber", "Source"), isRowHeader: true, render: (h) => <span className="whitespace-nowrap">{h.source}</span> },
    {
      id: "jenis",
      label: tr("Gangguan", "Disruption"),
      render: (h) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <IconTile icon={healthIcon[h.kind]} tone={h.restoredAt ? "default" : "danger"} size="sm" />
          {healthKindLabel[h.kind]}
          <InfoTip label={healthKindLabel[h.kind]}>{h.reason}</InfoTip>
        </span>
      ),
    },
    { id: "mulai", label: tr("Mulai", "Started"), render: (h) => <span className="whitespace-nowrap">{shortDate(h.startedAt)}</span>, compare: (a, b) => a.startedAt.getTime() - b.startedAt.getTime() },
    {
      id: "durasi",
      label: tr("Durasi", "Duration"),
      render: (h) =>
        h.restoredAt ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-muted">
            <CircleCheck className="size-3.5 text-success" aria-label={tr("Pulih", "Restored")} />
            {duration(h.restoredAt.getTime() - h.startedAt.getTime())}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-danger">
            <span className="relative flex size-2" aria-label={tr("Masih berlangsung", "Ongoing")}>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-danger" />
            </span>
            {duration(now - h.startedAt.getTime())}
          </span>
        ),
    },
  ]
  return (
    <Widget title={tr("Riwayat gangguan", "Disruption history")} description={tr("Record kesehatan sumber yang eksplisit. Durasi hanya ada bila waktu pulih tercatat.", "Explicit source-health records. Duration only where a restore time is recorded.")}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(h) => !h.length} empty={tr("Tidak ada gangguan tercatat.", "No disruptions recorded.")}>
        {(list) => (
          <RegisterTable
            label={tr("Riwayat gangguan", "Disruption history")}
            rows={list}
            columns={columns}
            rowId={(h) => h.id}
            rowText={(h) => `${h.source} ${healthKindLabel[h.kind]}`}
            defaultSort={{ column: "mulai", direction: "descending" }}
            dependencies={[now]}
            pageSize={8}
            onOpen={(id) => onOpen(list.find((h) => h.id === id)!.source)}
          />
        )}
      </WidgetBody>
    </Widget>
  )
}

const healthIcon: Record<HealthEvent["kind"], LucideIcon> = {
  "camera-offline": CameraOff,
  "camera-degraded": Camera,
  "link-outage": WifiOff,
  "link-degraded": Wifi,
  "edge-restart": RotateCcw,
  "power-low": BatteryLow,
}

/** Telemetry as icon + value pairs; battery also gets a bar. */
function Telemetry({ s }: { s: Source }) {
  const t = s.telemetry
  const items = [
    t.uplinkMbps !== undefined && { icon: Wifi, text: `${t.uplinkMbps} Mbps`, warn: isLow(t.uplinkMbps) },
    t.latencyMs !== undefined && { icon: Timer, text: `${t.latencyMs} ms` },
    t.gpuLoad !== undefined && { icon: Cpu, text: `${t.gpuLoad}%` },
    t.runtimeHours !== undefined && { icon: Clock, text: tr(`${t.runtimeHours} jam`, `${t.runtimeHours} h`) },
  ].filter(Boolean) as { icon: LucideIcon; text: string; warn?: boolean }[]
  if (!items.length && t.battery === undefined) return <span className="text-sm text-muted">{s.tier ? tierLabel[s.tier] : "—"}</span>
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs whitespace-nowrap text-muted">
      {t.battery !== undefined && (
        <span className="flex w-24 items-center gap-1.5" title={tr("Baterai", "Battery")}>
          <BatteryMedium className="size-3.5 shrink-0" aria-label={tr("Baterai", "Battery")} />
          <MiniBar value={t.battery} max={100} tone={t.battery < rules.powerRisk.socPercent ? "danger" : "success"} />
          <span className="tabular-nums">{t.battery}%</span>
        </span>
      )}
      {items.map((x) => (
        <span key={x.text} className={cn("flex items-center gap-1 tabular-nums", x.warn && "text-warning-ink")}>
          <x.icon className="size-3.5" aria-hidden />
          {x.text}
        </span>
      ))}
    </span>
  )
}
const isLow = (mbps: number) => mbps < rules.linkDegradedMbps

const telemetryText = (s: Source) =>
  [
    s.telemetry.uplinkMbps !== undefined && `${s.telemetry.uplinkMbps} Mbps`,
    s.telemetry.latencyMs !== undefined && `${s.telemetry.latencyMs} ms`,
    s.telemetry.gpuLoad !== undefined && `GPU ${s.telemetry.gpuLoad}%`,
    s.telemetry.battery !== undefined && tr(`baterai ${s.telemetry.battery}%`, `battery ${s.telemetry.battery}%`),
    s.telemetry.runtimeHours !== undefined && tr(`runtime ${s.telemetry.runtimeHours} jam`, `runtime ${s.telemetry.runtimeHours} h`),
  ]
    .filter(Boolean)
    .join(" · ")

const kinds = ["semua", "kamera", "uplink", "edge", "aegis", "manpack"] as const
/** Sorting "descending" puts the worst first. */
const statusRank: Record<Source["status"], number> = { online: 0, unknown: 1, stale: 2, degraded: 3, offline: 4 }

function SourcesWidget({ onOpen }: { onOpen: (id: string) => void }) {
  const { filters, key } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const version = useWorkflowVersion()
  const now = useNow(60_000)
  const query = useWidgetData(() => getSources(filters), key, REFRESH_MS, version)
  const kind = kinds.find((k) => k === params.get("jenis")) ?? "semua"
  const rows = query.data?.filter((s) => kind === "semua" || s.jenis === kind)
  const columns: Column<Source>[] = [
    { id: "id", label: "ID", render: (s) => <span className="whitespace-nowrap tabular-nums">{s.id}</span>, compare: (a, b) => a.id.localeCompare(b.id) },
    {
      id: "nama",
      label: tr("Sumber", "Source"),
      isRowHeader: true,
      render: (s) => (
        <>
          <p>{s.nama}</p>
          <p className="text-sm text-muted">{[sourceJenisLabel[s.jenis], s.zona?.label, s.mount].filter(Boolean).join(" · ")}</p>
        </>
      ),
    },
    { id: "status", label: "Status", render: (s) => <SourceStatusChip value={s.status} />, compare: (a, b) => statusRank[b.status] - statusRank[a.status] },
    { id: "terlihat", label: tr("Terakhir melapor", "Last reported"), render: (s) => <span className="whitespace-nowrap">{tr(`${duration(now - s.lastSeen.getTime())} lalu`, `${duration(now - s.lastSeen.getTime())} ago`)}</span>, compare: (a, b) => a.lastSeen.getTime() - b.lastSeen.getTime() },
    { id: "telemetri", label: tr("Telemetri", "Telemetry"), render: (s) => <Telemetry s={s} /> },
  ]
  return (
    <Widget title={tr("Register sumber", "Source register")} description={tr("Kamera, uplink, server edge, Aegis Pole, dan Manpack. Status adalah snapshot, bukan uptime historis.", "Cameras, uplinks, edge servers, Aegis Poles and Manpacks. Status is a snapshot, not historical uptime.")}>
      <div className="flex flex-col gap-3">
        <Tabs className="max-w-full min-w-0" selectedKey={kind} onSelectionChange={(k) => setParams({ jenis: k === "semua" ? null : String(k) })}>
          <Tabs.ListContainer>
            <Tabs.List aria-label={tr("Jenis sumber", "Source type")}>
              {kinds.map((k) => (
                <Tabs.Tab key={k} id={k} className="whitespace-nowrap">
                  {k === "semua" ? tr("Semua", "All") : sourceJenisLabel[k]} ({query.data?.filter((s) => k === "semua" || s.jenis === k).length ?? 0})
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <WidgetBody query={{ ...query, data: rows }} skeleton={<Skeleton className="h-60 rounded-lg" />} isEmpty={() => !query.data?.length} empty={tr("Tidak ada sumber untuk filter ini.", "No sources for these filters.")}>
          {(list) => (
            <RegisterTable
              label={tr("Register sumber", "Source register")}
              rows={list}
              columns={columns}
              rowId={(s) => s.id}
              rowText={(s) => s.nama}
              defaultSort={{ column: "status", direction: "descending" }}
              dependencies={[now, version]}
              onOpen={onOpen}
            />
          )}
        </WidgetBody>
      </div>
    </Widget>
  )
}

function SourceDrawer({ id, isOpen, onOpenChange }: { id?: string; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { filters, key } = useFilters()
  const now = useNow(60_000)
  const sources = useWidgetData(() => getSources({ ...filters, zona: "all" }), key)
  const health = useWidgetData(() => getHealthEvents(filters), key)
  const [adding, setAdding] = useState<string | undefined>()
  const s = sources.data?.find((x) => x.id === id)
  const history = health.data?.filter((h) => h.source === id) ?? []
  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          {!s ? (
            <Drawer.Body>{id && sources.data && <p className="text-sm text-muted">{tr(`Sumber ${id} tidak ditemukan di site ini.`, `Source ${id} not found at this site.`)}</p>}</Drawer.Body>
          ) : (
            <>
              <Drawer.Header>
                <Drawer.Heading>
                  {s.id} · {s.nama}
                </Drawer.Heading>
                <p className="text-sm text-muted">{sourceJenisLabel[s.jenis]}</p>
              </Drawer.Header>
              <Drawer.Body className="flex flex-col gap-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted">Status</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <SourceStatusChip value={s.status} /> <span className="text-muted">{tr(`melapor ${duration(now - s.lastSeen.getTime())} lalu`, `reported ${duration(now - s.lastSeen.getTime())} ago`)}</span>
                  </dd>
                  {s.alasan && (
                    <>
                      <dt className="text-muted">{tr("Keterangan", "Details")}</dt>
                      <dd>{s.alasan}</dd>
                    </>
                  )}
                  {s.zona && (
                    <>
                      <dt className="text-muted">{tr("Zona", "Zone")}</dt>
                      <dd>{s.zona.label}</dd>
                    </>
                  )}
                  {s.tipe && (
                    <>
                      <dt className="text-muted">{tr("Tipe", "Type")}</dt>
                      <dd>
                        {s.tipe}
                        {s.mount && ` · ${s.mount}`}
                      </dd>
                    </>
                  )}
                  {s.tier && (
                    <>
                      <dt className="text-muted">{tr("Deteksi oleh", "Detected by")}</dt>
                      <dd>
                        {tierLabel[s.tier]} {s.perangkat && `· ${s.perangkat}`}
                      </dd>
                    </>
                  )}
                  {s.uplink && (
                    <>
                      <dt className="text-muted">Uplink</dt>
                      <dd>{s.uplink}</dd>
                    </>
                  )}
                  {s.media && (
                    <>
                      <dt className="text-muted">Media</dt>
                      <dd>{s.media === "satelit" ? "Starlink" : s.media === "fiber" ? "Fiber" : "4G"}</dd>
                    </>
                  )}
                  {telemetryText(s) && (
                    <>
                      <dt className="text-muted">{tr("Telemetri", "Telemetry")}</dt>
                      <dd>
                        {telemetryText(s)}
                        {s.telemetry.solarW !== undefined && tr(` · surya ${s.telemetry.solarW} W`, ` · solar ${s.telemetry.solarW} W`)}
                        {s.telemetry.queue !== undefined && tr(` · antrean ${s.telemetry.queue}`, ` · queue ${s.telemetry.queue}`)}
                        {s.telemetry.mast && tr(` · tiang ${s.telemetry.mast}`, ` · mast ${s.telemetry.mast}`)}
                        {s.telemetry.gps && ` · GPS ${s.telemetry.gps}`}
                      </dd>
                    </>
                  )}
                  {s.dipasang && (
                    <>
                      <dt className="text-muted">{tr("Terpasang", "Deployed")}</dt>
                      <dd>{tr(`${duration(now - s.dipasang.getTime())} lalu`, `${duration(now - s.dipasang.getTime())} ago`)}</dd>
                    </>
                  )}
                  {s.lastIndication && (
                    <>
                      <dt className="text-muted">{tr("Indikasi terakhir", "Last indication")}</dt>
                      <dd>{tr(`${duration(now - s.lastIndication.getTime())} lalu`, `${duration(now - s.lastIndication.getTime())} ago`)}</dd>
                    </>
                  )}
                </dl>
                <section aria-labelledby="sumber-riwayat" className="flex flex-col gap-2">
                  <h3 id="sumber-riwayat" className="text-sm font-medium">
                    {tr("Riwayat gangguan", "Disruption history")}
                  </h3>
                  {history.length ? (
                    <ol className="flex flex-col gap-2 border-l border-border pl-4 text-sm">
                      {history.map((h) => (
                        <li key={h.id}>
                          <p>
                            {healthKindLabel[h.kind]} · {h.id}
                          </p>
                          <p className="text-muted">
                            {shortDate(h.startedAt)} {h.restoredAt ? `– ${shortDate(h.restoredAt)}` : tr("· masih berlangsung", "· ongoing")}
                          </p>
                          <p className="mt-1">{h.reason}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted">{tr("Tidak ada gangguan tercatat.", "No disruptions recorded.")}</p>
                  )}
                </section>
                {adding === s.id && (
                  <NewActionForm
                    initial={{ judul: s.status === "offline" ? tr(`Periksa daya dan stream ${s.id}`, `Check power and stream on ${s.id}`) : tr(`Periksa ${s.id}`, `Check ${s.id}`), due: "1" }}
                    owners={actionOwners(s.site).map((u) => ({ id: u.id, label: u.nama }))}
                    onCancel={() => setAdding(undefined)}
                    onSubmit={async (d) => {
                      const done = await runWorkflow(() => createAction({ judul: d.judul, ownerId: d.ownerId, tenggat: dueDate(d.due), catatanAwal: d.catatanAwal, site: s.site, zona: s.zona?.id, sumber: s.id }), tr("Tindakan perawatan ditugaskan.", "Maintenance action assigned."))
                      if (done) setAdding(undefined)
                    }}
                  />
                )}
              </Drawer.Body>
              <Drawer.Footer className="flex-wrap">
                <Button slot="close" variant="secondary">
                  {tr("Kembali", "Back")}
                </Button>
                {adding !== s.id && <Button onPress={() => setAdding(s.id)}>{tr("Buat tindakan perawatan", "Create maintenance action")}</Button>}
              </Drawer.Footer>
            </>
          )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

/** Where every device is, and the ones that are not fine, beside it. */
function DeviceMap({ version, onOpen }: { version: number; onOpen: (id: string) => void }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getMapSites(filters), key, REFRESH_MS, version)
  const down = query.data?.flatMap((s) => s.points.filter((p) => p.status !== "online")) ?? []
  const all = query.data?.flatMap((s) => s.points) ?? []
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {query.data ? <SiteMap sites={query.data} onOpen={onOpen} className="h-[min(60vh,34rem)] min-h-80" /> : <Skeleton className="h-[min(60vh,34rem)] min-h-80 rounded-2xl" />}
      <Widget title={tr("Bermasalah", "Not OK")} subtitle={query.data && tr(`${all.length - down.length} dari ${all.length} perangkat normal`, `${all.length - down.length} of ${all.length} devices fine`)}>
        <WidgetBody
          query={query}
          skeleton={<Skeleton className="h-48 rounded-lg" />}
          isEmpty={() => !down.length}
          empty={tr("Semua perangkat normal.", "Every device is fine.")}
        >
          {() => (
            <ul className="flex flex-col gap-1">
              {down.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onOpen(p.id)} className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-default">
                    <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", p.status === "offline" ? "bg-danger" : "bg-warning")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {p.id} · {p.nama}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted">{p.alasan ?? sourceJenisLabel[p.jenis]}</span>
                    </span>
                    <SourceStatusChip value={p.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WidgetBody>
      </Widget>
    </div>
  )
}

export function SumberPage() {
  const { key } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const version = useWorkflowVersion()
  const [openId, setOpenId] = useState(params.get("id") ?? undefined)
  const [isOpen, setIsOpen] = useState(!!params.get("id"))
  const open = (id: string) => {
    setOpenId(id)
    setIsOpen(true)
    setParams({ id })
  }
  return (
    <div className="flex flex-col gap-4" key={key}>
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["site", "zona"]} />
      </div>
      <DeviceMap version={version} onOpen={open} />
      <SourcesWidget onOpen={open} />
      {/* The 24-hour charts, one at a time. */}
      <Tabs>
        <Tabs.ListContainer>
          <Tabs.List aria-label={tr("Riwayat 24 jam", "Last 24 hours")}>
            {[
              { id: "uplink", label: "Uplink" },
              { id: "baterai", label: tr("Baterai", "Battery") },
              { id: "sinkron", label: tr("Jeda sinkron", "Sync lag") },
              { id: "gangguan", label: tr("Riwayat gangguan", "Disruptions") },
            ].map((t) => (
              <Tabs.Tab key={t.id} id={t.id}>
                {t.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="uplink" className="pt-4">
          <UplinkWidget />
        </Tabs.Panel>
        <Tabs.Panel id="baterai" className="pt-4">
          <PowerWidget />
        </Tabs.Panel>
        <Tabs.Panel id="sinkron" className="pt-4">
          <SyncLagWidget />
        </Tabs.Panel>
        <Tabs.Panel id="gangguan" className="pt-4">
          <HealthWidget onOpen={open} />
        </Tabs.Panel>
      </Tabs>
      <SourceDrawer
        id={openId}
        isOpen={isOpen}
        onOpenChange={(o) => {
          setIsOpen(o)
          if (!o) setParams({ id: null })
        }}
      />
    </div>
  )
}
