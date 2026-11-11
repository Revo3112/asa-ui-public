import { useState } from "react"
import { Label, Meter, Skeleton, ToggleButton, ToggleButtonGroup } from "@heroui/react"
import { Link } from "react-router"

import { EvilLineChart } from "@/shared/charts/evilcharts/charts/recharts-line-chart"
import { drillQuery, useFilters } from "@/shared/components/filter-bar"
import { REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { getRiskyZones, getTrend } from "@/features/overview/data/overview"
import { tr } from "@/shared/lib/i18n"

const metrics = {
  kepatuhan: { get label() { return tr("Kepatuhan APD", "PPE compliance") }, unit: "%", colors: { light: ["var(--chart-2)"], dark: ["var(--chart-2)"] } },
  pelanggaran: { get label() { return tr("Pelanggaran", "Violations") }, unit: "", colors: { light: ["var(--danger)"], dark: ["var(--danger)"] } },
}
type Metric = keyof typeof metrics

export function TrendWidget({ className }: { className?: string }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getTrend(filters), key, REFRESH_MS)
  const [metric, setMetric] = useState<Metric>("kepatuhan")
  const { unit } = metrics[metric]

  return (
    <Widget
      title={tr("Tren mingguan", "Weekly trend")}
      description={tr("7 hari terakhir, per hari", "Last 7 days, per day")}
      className={className}
      action={
        <ToggleButtonGroup
          aria-label={tr("Data yang ditampilkan", "Data shown")}
          size="sm"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[metric]}
          onSelectionChange={(keys) => setMetric([...keys][0] as Metric)}
        >
          <ToggleButton id="kepatuhan">{tr("% kepatuhan", "% compliance")}</ToggleButton>
          <ToggleButton id="pelanggaran">
            <ToggleButtonGroup.Separator />
            {tr("Pelanggaran", "Violations")}
          </ToggleButton>
        </ToggleButtonGroup>
      }
    >
      <WidgetBody
        query={query}
        skeleton={<Skeleton className="h-60 rounded-lg" />}
        isEmpty={(points) => points.length === 0}
        empty={tr("Belum ada data untuk filter ini.", "No data for these filters yet.")}
      >
        {(points) => (
          <EvilLineChart key={metric} data={points} config={metrics} className="aspect-auto min-h-60">
            <EvilLineChart.Grid />
            <EvilLineChart.XAxis dataKey="hari" />
            <EvilLineChart.YAxis
              domain={metric === "kepatuhan" ? [80, 100] : [0, "auto"]}
              tickFormatter={(v: number) => `${v}${unit}`}
            />
            <EvilLineChart.Tooltip />
            <EvilLineChart.Line dataKey={metric} strokeWidth={2}>
              <EvilLineChart.Dot />
            </EvilLineChart.Line>
          </EvilLineChart>
        )}
      </WidgetBody>
    </Widget>
  )
}

export function ZoneWidget({ className }: { className?: string }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getRiskyZones(filters), key, REFRESH_MS)

  return (
    <Widget title={tr("Zona paling rawan", "Riskiest zones")} description={tr("Jumlah pelanggaran. Pilih zona untuk melihat detailnya.", "Number of violations. Pick a zone to see its detail.")} className={className}>
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
        empty={tr("Tidak ada pelanggaran pada periode ini.", "No violations in this period.")}
      >
        {(rows) => (
          <ol className="flex flex-col gap-1">
            {rows.map((zone) => (
              <li key={zone.id}>
                <Link to={`/apd?${drillQuery(filters, { zona: zone.id })}`} className="block rounded-lg p-2 hover:bg-default">
                  <Meter value={zone.pelanggaran} maxValue={rows[0].pelanggaran} valueLabel={`${zone.pelanggaran}`} size="sm" color="danger">
                    <Label>{zone.label}</Label>
                    <Meter.Output />
                    <Meter.Track>
                      <Meter.Fill />
                    </Meter.Track>
                  </Meter>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </WidgetBody>
    </Widget>
  )
}
