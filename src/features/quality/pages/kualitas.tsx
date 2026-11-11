import { Card, Chip, Label, Meter, Skeleton, Tabs } from "@heroui/react"
import { CalendarCheck, Gauge, Hourglass } from "lucide-react"
import { Link } from "react-router"

import { EvilBarChart } from "@/shared/charts/evilcharts/charts/recharts-bar-chart"
import { EvilPieChart } from "@/shared/charts/evilcharts/charts/recharts-pie-chart"
import { FilterButton, useFilters } from "@/shared/components/filter-bar"
import { BareWidgets, REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { detectorStatusLabel, outcomeMeta, type DetectorStatus, type Outcome } from "@/shared/config/indikasi"
import { rules } from "@/shared/config/rules"
import { getBacklogAging, getConfidenceBands, getDetectorRows, getOutcomeMix, getShiftStats } from "@/features/quality/data/kualitas"
import { useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { tr } from "@/shared/lib/i18n"

const outcomeColor: Record<Outcome, string> = { confirmed: "var(--danger)", "no-violation": "var(--success)", "false-alarm": "var(--chart-5)", inconclusive: "var(--warning)" }
const outcomeConfig = Object.fromEntries((Object.keys(outcomeMeta) as Outcome[]).map((o) => [o, { label: outcomeMeta[o].label, colors: { light: [outcomeColor[o]], dark: [outcomeColor[o]] } }])) as Record<Outcome, { label: string; colors: { light: string[]; dark: string[] } }>
const pct = (n: number) => `${Math.round(n * 100)}%`

function OutcomeMixWidget({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getOutcomeMix(filters), key, REFRESH_MS, version)
  return (
    <Widget title={tr("Komposisi hasil review", "Review outcome mix")} description={tr("Hanya review yang sudah selesai; penyebutnya ditulis. Yang masih menunggu tidak dihitung benar atau salah.", "Completed reviews only, with the denominator shown. Pending ones are never counted as right or wrong.")}>
      <WidgetBody query={query} skeleton={<Skeleton className="mx-auto size-44 rounded-full" />} isEmpty={(r) => r.every((x) => !x.count)} empty={tr("Belum ada review selesai pada periode ini.", "No completed reviews in this period yet.")}>
        {(rows) => {
          const total = rows.reduce((s, r) => s + r.count, 0)
          return (
            <div className="flex flex-1 flex-col items-center gap-4">
              <EvilPieChart data={rows} dataKey="count" nameKey="outcome" config={outcomeConfig} className="aspect-auto min-h-44 w-full flex-1">
                <EvilPieChart.Pie innerRadius="60%" paddingAngle={2} cornerRadius={4} />
                <EvilPieChart.Tooltip />
              </EvilPieChart>
              <ul className="flex w-full flex-col gap-1 text-sm">
                {rows.map((r) => (
                  <li key={r.outcome} className="flex items-center gap-2 px-2 py-1">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: outcomeColor[r.outcome] }} aria-hidden />
                    <span className="min-w-0 flex-1">{r.label}</span>
                    <span className="tabular-nums">{r.count}</span>
                    <span className="w-12 text-right text-muted tabular-nums">{total ? pct(r.count / total) : "0%"}</span>
                  </li>
                ))}
              </ul>
              <p className="self-start text-xs text-muted">{tr(`Dari ${total} review selesai.`, `Of ${total} completed reviews.`)}</p>
            </div>
          )
        }}
      </WidgetBody>
    </Widget>
  )
}

function ConfidenceWidget({ version, className }: { version: number; className?: string }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getConfidenceBands(filters), key, REFRESH_MS, version)
  return (
    <Widget fill className={className} title={tr("Skor detektor vs hasil review", "Detector score vs review outcome")} description={tr("Apakah skor detektor membawa informasi? Porsi tiap hasil per rentang skor (review selesai). Skor adalah keluaran model, bukan akurasi.", "Does the detector score carry information? Share of each outcome per score band (completed reviews). The score is model output, not accuracy.")}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-64 rounded-lg" />} isEmpty={(r) => r.every((x) => !x.n)} empty={tr("Belum ada review selesai pada periode ini.", "No completed reviews in this period yet.")}>
        {(rows) => (
          <EvilBarChart data={rows.map((r) => ({ ...r, band: `${r.band} (n=${r.n})` }))} config={outcomeConfig} stackType="stacked" className="aspect-auto h-full min-h-64">
            <EvilBarChart.Grid />
            <EvilBarChart.XAxis dataKey="band" />
            <EvilBarChart.YAxis tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
            <EvilBarChart.Tooltip />
            <EvilBarChart.Legend />
            {(Object.keys(outcomeMeta) as Outcome[]).map((o) => (
              <EvilBarChart.Bar key={o} dataKey={o} />
            ))}
          </EvilBarChart>
        )}
      </WidgetBody>
    </Widget>
  )
}

function ShiftWidget({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getShiftStats(filters), key, REFRESH_MS, version)
  return (
    <Widget title={tr("Per shift", "By shift")} description={tr(`Porsi terkonfirmasi dan SLA acknowledge per shift. Selisih SLA malam − siang ≥ ${rules.nightSlaGap.points} poin ditandai di Pusat Keputusan.`, `Confirmed share and acknowledgement SLA per shift. A night − day SLA gap ≥ ${rules.nightSlaGap.points} points is flagged in the Decision Center.`)}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(r) => r.every((x) => !x.indications)} empty={tr("Belum ada indikasi pada periode ini.", "No indications in this period yet.")}>
        {(rows) => (
          <ul className="flex flex-col gap-4">
            {rows.map((r) => (
              <li key={r.shift} className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {r.label} <span className="font-normal text-muted">· {tr(`${r.indications} indikasi`, `${r.indications} indications`)}</span>
                </p>
                <Meter value={r.confirmedRate * 100} valueLabel={tr(`${pct(r.confirmedRate)} dari ${r.reviews} review`, `${pct(r.confirmedRate)} of ${r.reviews} reviews`)} size="sm" color="accent">
                  <Label>{tr("Terkonfirmasi", "Confirmed")}</Label>
                  <Meter.Output />
                  <Meter.Track>
                    <Meter.Fill />
                  </Meter.Track>
                </Meter>
                <Meter value={r.slaBreachRate * 100} valueLabel={pct(r.slaBreachRate)} size="sm" color={r.slaBreachRate > 0.3 ? "danger" : "warning"}>
                  <Label>{tr("SLA acknowledge terlewat", "Acknowledgement SLA missed")}</Label>
                  <Meter.Output />
                  <Meter.Track>
                    <Meter.Fill />
                  </Meter.Track>
                </Meter>
              </li>
            ))}
          </ul>
        )}
      </WidgetBody>
    </Widget>
  )
}

function DetectorWidget({ version, className }: { version: number; className?: string }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getDetectorRows(filters), key, REFRESH_MS, version)
  const t = rules.tuningCandidate
  return (
    <Widget className={className} title={tr("Sinyal kinerja detektor", "Detector performance signal")} description={tr(`Porsi alarm palsu per detektor dari review selesai. ≥ ${t.share * 100}% dengan ≥ ${t.minReviews} review = kandidat tuning, bukan klaim presisi.`, `False-alarm share per detector from completed reviews. ≥ ${t.share * 100}% with ≥ ${t.minReviews} reviews = tuning candidate, not a precision claim.`)}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(r) => !r.length} empty={tr("Belum ada review selesai pada periode ini.", "No completed reviews in this period yet.")}>
        {(rows) => (
          <ul className="flex flex-col gap-1">
            {rows.map((d) => (
              <li key={d.detektor}>
                <Link to={d.href} className="block rounded-lg p-2 hover:bg-default">
                  <Meter value={d.share * 100} valueLabel={`${pct(d.share)} · ${d.falseAlarms}/${d.reviews}`} size="sm" color={d.candidate ? "danger" : "accent"}>
                    <Label className="flex flex-wrap items-center gap-1.5">
                      {d.detektor}
                      {d.status && <Chip size="sm">{detectorStatusLabel[d.status as DetectorStatus]}</Chip>}
                      {d.candidate && (
                        <Chip size="sm" color="danger">
                          {tr("Kandidat tuning", "Tuning candidate")}
                        </Chip>
                      )}
                    </Label>
                    <Meter.Output />
                    <Meter.Track>
                      <Meter.Fill />
                    </Meter.Track>
                  </Meter>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </WidgetBody>
    </Widget>
  )
}

function BacklogWidget({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getBacklogAging(filters), key, REFRESH_MS, version)
  return (
    <Widget title={tr("Antrean review · umur", "Review backlog · age")} description={tr("Indikasi yang menunggu hasil review, menurut lama menunggu. Pilih untuk membuka antreannya.", "Indications waiting for a review outcome, by how long they have waited. Pick one to open the queue.")}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(b) => !b} empty="">
        {(b) => {
          if (!b) return null
          const max = Math.max(1, ...b.buckets.map((x) => x.count))
          return (
            <div className="flex flex-col gap-3">
              <ol className="flex flex-col gap-1">
                {b.buckets.map((x) => (
                  <li key={x.id}>
                    <Link to={`/indikasi?${new URLSearchParams({ periode: "30d" })}`} className="block rounded-lg p-2 hover:bg-default">
                      <Meter value={x.count} maxValue={max} valueLabel={String(x.count)} size="sm" color={x.id === "3h" || x.id === "lama" ? "danger" : x.id === "24j" ? "warning" : "accent"}>
                        <Label>{x.label}</Label>
                        <Meter.Output />
                        <Meter.Track>
                          <Meter.Fill />
                        </Meter.Track>
                      </Meter>
                    </Link>
                  </li>
                ))}
              </ol>
              <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                {[
                  { icon: Hourglass, value: String(b.forecast.pending), label: tr("menunggu", "waiting") },
                  { icon: Gauge, value: `${b.forecast.perDay.toFixed(1)}`, label: tr("review/hari", "reviews/day") },
                  { icon: CalendarCheck, value: Number.isFinite(b.forecast.days) ? `±${b.forecast.days.toFixed(1)}` : "—", label: tr("hari sampai habis", "days to clear") },
                ].map((x) => (
                  <div key={x.label} className="flex flex-col items-center gap-1 rounded-xl bg-default/60 p-2">
                    <x.icon className="size-4 text-muted" aria-hidden />
                    <dd className="font-display text-lg font-semibold tabular-nums">{x.value}</dd>
                    <dt className="text-xs text-muted">{x.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          )
        }}
      </WidgetBody>
    </Widget>
  )
}

/**
 * How far the AI can be trusted, on one screen: which detector needs tuning and how reviews came
 * out on the left; whether the score means anything, the shifts and the backlog on the right.
 */
export function KualitasPage() {
  const { key } = useFilters()
  const version = useWorkflowVersion()
  const tabs = [
    { id: "skor", label: tr("Skor vs hasil", "Score vs outcome"), content: <ConfidenceWidget version={version} /> },
    { id: "shift", label: tr("Per shift", "By shift"), content: <ShiftWidget version={version} /> },
    { id: "antrean", label: tr("Umur antrean", "Backlog age"), content: <BacklogWidget version={version} /> },
  ]
  return (
    <div key={key} className="flex flex-col gap-3 lg:h-[calc(100dvh-11rem)] lg:min-h-[34rem]">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["periode", "zona", "shift", "kategori"]} />
      </div>
      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]">
        <Card className="min-w-0 lg:min-h-0">
          <Card.Content className="flex flex-col gap-4 overflow-y-auto lg:min-h-0 lg:flex-1">
            <BareWidgets>
              <section className="flex flex-col gap-2" aria-labelledby="kq-detektor">
                <h2 id="kq-detektor" className="font-medium">
                  {tr("Alarm palsu per detektor", "False alarms by detector")}
                </h2>
                <DetectorWidget version={version} />
              </section>
              <section className="flex min-h-64 flex-1 flex-col gap-2 border-t border-border pt-4" aria-labelledby="kq-hasil">
                <h2 id="kq-hasil" className="font-medium">
                  {tr("Hasil review", "Review outcomes")}
                </h2>
                <OutcomeMixWidget version={version} />
              </section>
            </BareWidgets>
          </Card.Content>
        </Card>
        <Card className="min-w-0 lg:min-h-0">
          <Card.Content className="flex flex-col lg:min-h-0 lg:flex-1">
            <BareWidgets>
              <Tabs className="flex flex-col lg:min-h-0 lg:flex-1">
                <Tabs.ListContainer>
                  <Tabs.List aria-label={tr("Detail kualitas", "Quality detail")}>
                    {tabs.map((t) => (
                      <Tabs.Tab key={t.id} id={t.id} className="whitespace-nowrap">
                        {t.label}
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                </Tabs.ListContainer>
                {tabs.map((t) => (
                  <Tabs.Panel key={t.id} id={t.id} className="max-h-[32rem] overflow-y-auto pt-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                    {t.content}
                  </Tabs.Panel>
                ))}
              </Tabs>
            </BareWidgets>
          </Card.Content>
        </Card>
      </div>
    </div>
  )
}
