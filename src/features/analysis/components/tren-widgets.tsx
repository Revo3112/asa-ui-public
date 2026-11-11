import { useState } from "react"
import { Label, Meter, Skeleton, ToggleButton, ToggleButtonGroup } from "@heroui/react"
import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import { Link } from "react-router"

import { EvilBarChart } from "@/shared/charts/evilcharts/charts/recharts-bar-chart"
import { useFilters } from "@/shared/components/filter-bar"
import { Segments } from "@/features/analysis/components/segments"
import { REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { rules } from "@/shared/config/rules"
import { getAreaRanking, getRepeatRows, getWeekCompare } from "@/features/analysis/data/analisis"
import { tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"

const weekConfig = {
  indikasi: {
    lalu: { get label() { return tr("7 hari sebelumnya", "Previous 7 days") }, colors: { light: ["var(--chart-5)"], dark: ["var(--chart-5)"] } },
    ini: { get label() { return tr("7 hari terakhir", "Last 7 days") }, colors: { light: ["var(--chart-1)"], dark: ["var(--chart-1)"] } },
  },
  temuan: {
    lalu: { get label() { return tr("7 hari sebelumnya", "Previous 7 days") }, colors: { light: ["var(--chart-5)"], dark: ["var(--chart-5)"] } },
    ini: { get label() { return tr("7 hari terakhir", "Last 7 days") }, colors: { light: ["var(--danger)"], dark: ["var(--danger)"] } },
  },
}
type Measure = keyof typeof weekConfig

export function WeekWidget({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getWeekCompare(filters), key, REFRESH_MS, version)
  const [measure, setMeasure] = useState<Measure>("indikasi")
  return (
    <Widget
      fill
      title={tr("Minggu ini vs minggu lalu", "This week vs last week")}
      description={tr("7 hari terakhir dibanding 7 hari sebelumnya, per kategori. Indikasi dan temuan terkonfirmasi ditampilkan terpisah.", "Last 7 days against the 7 before, per category. Indications and confirmed findings are shown apart.")}
      action={
        <ToggleButtonGroup aria-label={tr("Ukuran", "Measure")} size="sm" selectionMode="single" disallowEmptySelection selectedKeys={[measure]} onSelectionChange={(k) => setMeasure([...k][0] as Measure)}>
          <ToggleButton id="indikasi">{tr("Indikasi", "Indications")}</ToggleButton>
          <ToggleButton id="temuan">
            <ToggleButtonGroup.Separator />
            {tr("Terkonfirmasi", "Confirmed")}
          </ToggleButton>
        </ToggleButtonGroup>
      }
    >
      <WidgetBody query={query} skeleton={<Skeleton className="h-64 rounded-lg" />} isEmpty={(r) => r.every((x) => !x.indikasiIni && !x.indikasiLalu)} empty={tr("Belum ada indikasi dalam 14 hari terakhir.", "No indications in the last 14 days.")}>
        {(rows) => {
          const data = rows.map((r) => ({ label: r.label, lalu: measure === "indikasi" ? r.indikasiLalu : r.temuanLalu, ini: measure === "indikasi" ? r.indikasiIni : r.temuanIni }))
          return (
            <div className="flex h-full flex-col gap-3">
              <EvilBarChart key={measure} data={data} config={weekConfig[measure]} className="aspect-auto min-h-64 flex-1">
                <EvilBarChart.Grid />
                <EvilBarChart.XAxis dataKey="label" />
                <EvilBarChart.YAxis />
                <EvilBarChart.Tooltip />
                <EvilBarChart.Legend />
                <EvilBarChart.Bar dataKey="lalu" />
                <EvilBarChart.Bar dataKey="ini" />
              </EvilBarChart>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {data.map((d) => {
                  const change = d.lalu ? Math.round(((d.ini - d.lalu) / d.lalu) * 100) : null
                  const Arrow = change === null || change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown
                  return (
                    <li key={d.label} className="flex items-center gap-3 rounded-xl bg-default/60 px-3 py-2">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs text-muted">{d.label}</span>
                        <span className="font-display text-lg font-semibold tabular-nums">
                          {d.ini}
                          <span className="ml-1 text-xs font-normal text-muted">/ {d.lalu}</span>
                        </span>
                      </span>
                      <span className={cn("flex items-center gap-0.5 text-xs font-medium tabular-nums", change && change > 0 ? "text-danger" : "text-success")}>
                        <Arrow className="size-4" aria-hidden />
                        {change === null ? tr("baru", "new") : `${change > 0 ? "+" : ""}${change}%`}
                      </span>
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

export function AreaWidget({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getAreaRanking(filters), key, REFRESH_MS, version)
  return (
    <Widget title={tr("Ranking area · temuan terkonfirmasi", "Area ranking · confirmed findings")} description={tr("Jumlah, bukan tingkat risiko: paparan, lalu lintas, dan jumlah kamera berbeda tiap area. Jumlah kamera ditulis sebagai konteks. Pilih untuk membuka indikasinya.", "Counts, not risk rates: exposure, traffic and camera count differ by area. Camera count is shown for context. Pick one to open its indications.")}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-64 rounded-lg" />} isEmpty={(r) => r.every((x) => !x.confirmed)} empty={tr("Belum ada temuan terkonfirmasi pada periode ini.", "No confirmed findings in this period yet.")}>
        {(rows) => (
          <ol className="flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={r.href} className="block rounded-lg p-2 hover:bg-default">
                  <Meter
                    value={r.confirmed}
                    maxValue={Math.max(1, rows[0].confirmed)}
                    valueLabel={`${r.confirmed} · ${r.cameras} ${tr("kamera", "cameras")}${r.offline ? `, ${r.offline} offline` : ""}`}
                    size="sm"
                    color={r.offline ? "warning" : "danger"}
                  >
                    <Label>{r.label}</Label>
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

export function RepeatWidget({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getRepeatRows(filters), key, REFRESH_MS, version)
  const r = rules.repeatFinding
  return (
    <Widget title={tr("Temuan berulang", "Repeat findings")} description={tr(`Aturan: ≥ ${r.count} temuan terkonfirmasi, site + zona + kategori sama, dalam ${r.days} hari. Ilustratif sampai disepakati dengan HSE klien.`, `Rule: ≥ ${r.count} confirmed findings, same site + zone + category, within ${r.days} days. Illustrative until agreed with the client's HSE.`)}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(x) => !x.length} empty={tr(`Tidak ada pola yang memenuhi aturan ${r.count} temuan dalam ${r.days} hari.`, `No pattern meets the rule of ${r.count} findings in ${r.days} days.`)}>
        {(rows) => (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((g) => (
              <li key={`${g.label}|${g.kategori}`} className="flex items-center gap-3 py-2.5 text-sm first:pt-0">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/10 font-display text-base font-semibold text-danger tabular-nums">{g.count}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link to={g.href} className="truncate font-medium underline-offset-2 hover:underline">
                    {g.label}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span className="truncate">{g.kategori}</span>
                    <span className="flex shrink-0 gap-0.5" aria-label={tr(`${g.count} temuan`, `${g.count} findings`)}>
                      {Array.from({ length: Math.min(g.count, 12) }, (_, i) => (
                        <span key={i} className={cn("size-1.5 rounded-full", i < r.count ? "bg-danger" : "bg-danger/50")} />
                      ))}
                    </span>
                  </span>
                </span>
                <span className="hidden shrink-0 font-mono text-xs sm:block">
                  <Segments segs={g.refs.slice(0, 2).flatMap((x, i) => (i ? [" ", x] : [x]))} />
                  {g.count > 2 && <span className="text-muted"> +{g.count - 2}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </WidgetBody>
    </Widget>
  )
}
