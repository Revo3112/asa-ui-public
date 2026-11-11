import { Button, Skeleton } from "@heroui/react"
import { Download, HardHat, Shirt } from "lucide-react"

import { ReferenceLine } from "recharts"

import { EvilAreaChart } from "@/shared/charts/evilcharts/charts/recharts-area-chart"
import { formatPercent, HeatmapWidget } from "@/features/ppe/components/apd-charts"
import { DetectionView } from "@/features/detection/components/detection-view"
import { useFilters } from "@/shared/components/filter-bar"
import { KpiCard } from "@/shared/components/kpi-card"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import { apdTypes, complianceTone, TARGET_KEPATUHAN } from "@/shared/config/apd"
import { getApdBreakdown, getComplianceTrend, getSummary, getViolations, shiftLabel, violationTitle, type Violation } from "@/features/ppe/data/apd"
import { master } from "@/shared/data/master"
import { downloadCsv } from "@/shared/lib/csv"
import { locale, tr } from "@/shared/lib/i18n"

const when = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const num = (n: number) => n.toLocaleString(locale())

function Loading() {
  return <Skeleton render={(p) => <span {...p} />} className="inline-block h-7 w-16 rounded-md align-middle" />
}

function refresherCsv(rows: Violation[]) {
  downloadCsv(
    `refresher-apd-${new Date().toLocaleDateString("sv-SE")}.csv`,
    ["ID", tr("Waktu", "Time"), "Site", tr("Zona", "Zone"), tr("Kamera", "Camera"), tr("APD kurang", "Missing PPE"), "Shift", tr("Nama pekerja", "Worker name"), tr("Refresher selesai", "Refresher done")],
    rows.map((v) => [v.id, v.waktu.toLocaleString("sv-SE"), v.site, v.zona.label, v.kamera, violationTitle(v), shiftLabel(v.shift), "", ""]),
  )
}

/**
 * Who was caught without full PPE, one capture each, for the safety team's refresher session.
 * ponytail: the worker's name is filled in by HSE from the capture (or matched to the shift's
 * check-in photo where face recognition is added); the mock leaves it empty.
 */
function PeopleTab() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getViolations(filters), key)
  const cams = new Map(master().kamera.map((k) => [k.id, k]))
  return (
    <WidgetBody
      query={query}
      skeleton={<Skeleton className="h-48 rounded-lg" />}
      isEmpty={(rows) => !rows.length}
      empty={tr("Semua pekerja patuh APD pada periode ini.", "Every worker wore full PPE in this period.")}
    >
      {(rows) => (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{rows.length}</span> {tr("perlu refresher", "need a refresher")}
            </p>
            <Button size="sm" variant="secondary" onPress={() => refresherCsv(rows)}>
              <Download aria-hidden />
              {tr("Unduh daftar", "Download list")}
            </Button>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {rows.slice(0, 12).map((v) => {
              const cam = cams.get(v.kamera)
              return (
                <li key={v.id} className="flex min-w-0 flex-col gap-1">
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                    {v.bukti ? <img src={v.bukti} alt={violationTitle(v)} className="size-full object-cover" /> : cam && <video src={`${cam.streamUrl}#t=${1 + (Math.round(v.box.x) % 4)}`} preload="metadata" muted playsInline aria-hidden className="size-full object-cover" />}
                    <div className="absolute border-2 border-danger" style={{ left: `${v.box.x}%`, top: `${v.box.y}%`, width: `${v.box.w}%`, height: `${v.box.h}%` }} aria-hidden />
                  </div>
                  <p className="truncate text-sm font-medium">{violationTitle(v)}</p>
                  <p className="truncate text-xs text-muted">
                    {v.zona.label} · {when(v.waktu)}
                  </p>
                </li>
              )
            })}
          </ul>
          {rows.length > 12 && <p className="text-xs text-muted">{tr(`+${rows.length - 12} lainnya ada di file unduhan.`, `+${rows.length - 12} more in the download.`)}</p>}
        </div>
      )}
    </WidgetBody>
  )
}

/** "98,4%" with "312 people seen · 18 without full PPE" under it. */
function ComplianceKpi() {
  const { filters, key } = useFilters()
  const summary = useWidgetData(() => getSummary(filters), key)
  const s = summary.data
  return (
    <KpiCard
      compact
      icon={HardHat}
      label={tr("Kepatuhan APD", "PPE compliance")}
      value={s ? formatPercent(s.kepatuhan) : s === null ? "–" : <Loading />}
      tone={s ? complianceTone(s.kepatuhan) : "default"}
      note={s ? tr(`${num(s.orang)} orang terlihat · ${num(s.pelanggar)} tidak patuh`, `${num(s.orang)} people seen · ${num(s.pelanggar)} without full PPE`) : `Target ${TARGET_KEPATUHAN}%`}
    />
  )
}

/** The PPE item missed most in the period. */
function MostMissedKpi() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getApdBreakdown(filters), key)
  const top = query.data && [...query.data].sort((a, b) => b.pelanggaran - a.pelanggaran)[0]
  const label = top && apdTypes.find((t) => t.id === top.apd)?.label
  return (
    <KpiCard
      compact
      icon={Shirt}
      label={tr("Paling sering dilanggar", "Most often missed")}
      value={!query.data ? <Loading /> : top && top.pelanggaran ? label : "–"}
      note={top && top.pelanggaran ? tr(`${num(top.pelanggaran)} kali`, `${num(top.pelanggaran)} times`) : undefined}
    />
  )
}

const complianceConfig = { kepatuhan: { get label() { return tr("Kepatuhan", "Compliance") }, colors: { light: ["var(--success)"], dark: ["var(--success)"] } } }

function ComplianceTrend() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getComplianceTrend(filters), key)
  return (
    <WidgetBody query={query} skeleton={<Skeleton className="h-56 rounded-lg" />} isEmpty={(p) => !p.length} empty={tr("Belum ada data.", "No data yet.")}>
      {(points) => (
        <EvilAreaChart data={points} config={complianceConfig} curveType="monotone" className="aspect-auto h-full min-h-56">
          <EvilAreaChart.Grid />
          <EvilAreaChart.XAxis dataKey="hari" />
          {/* Tight to the data but always showing the target line. */}
          <EvilAreaChart.YAxis domain={[Math.min(TARGET_KEPATUHAN - 1, ...points.map((p) => Math.floor(p.kepatuhan) - 1)), 100]} tickFormatter={(v: number) => `${v}%`} />
          <EvilAreaChart.Tooltip />
          <ReferenceLine y={TARGET_KEPATUHAN} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: `Target ${TARGET_KEPATUHAN}%`, position: "insideBottomRight", fill: "var(--warning-ink, var(--warning))", fontSize: 11 }} />
          <EvilAreaChart.Area dataKey="kepatuhan" variant="gradient" strokeVariant="solid" strokeWidth={2.5} />
        </EvilAreaChart>
      )}
    </WidgetBody>
  )
}

export function ApdPage() {
  const { key } = useFilters()
  return (
    <DetectionView
      key={key}
      kategori="apd"
      firstKpi={<ComplianceKpi />}
      secondKpi={<MostMissedKpi />}
      trend={<ComplianceTrend />}
      tabs={[{ id: "orang", label: tr("Per orang", "Per person"), content: <PeopleTab /> }]}
      moreTabs={[{ id: "jam", label: tr("Jam & hari", "Hour & day"), content: <HeatmapWidget fill className="h-full shadow-none" /> }]}
    />
  )
}
