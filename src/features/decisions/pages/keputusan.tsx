import { useId, useState, type ReactNode } from "react"
import { Button, buttonVariants, Label, Meter, Skeleton, Tabs, Tooltip } from "@heroui/react"
import { AlertTriangle, Camera, ClipboardX, Eye, EyeOff, Hourglass, MapPin, RadioTower } from "lucide-react"
import { Link } from "react-router"

import { EvilLineChart } from "@/shared/charts/evilcharts/charts/recharts-line-chart"
import { drillQuery, FilterButton, useFilters } from "@/shared/components/filter-bar"
import { IndikasiDrawer } from "@/features/indications/components/indikasi-drawer"
import { KpiCard, KpiGrid } from "@/shared/components/kpi-card"
import { SeverityChip } from "@/shared/components/severity-chip"
import { CompareBars, MiniBar } from "@/shared/components/visual"
import { InfoTip, REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { kategoriDef } from "@/shared/config/indikasi"
import { severityMeta } from "@/shared/config/events"
import { rules } from "@/shared/config/rules"
import { getCoverage, getDailyTrend, getDecisions, getHotspot, getKpis, getPriorityQueue, getSlaPanel, type Decision, type DecisionKind, type DecisionTone } from "@/features/decisions/data/keputusan"
import { sourceJenisLabel } from "@/features/devices/data/sumber"
import { isModuleOn } from "@/shared/data/settings"
import { duration, useNow } from "@/shared/lib/time"
import { cn } from "@/shared/lib/utils"
import { useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { tr } from "@/shared/lib/i18n"

/** A KPI card that opens the register it counts, already filtered. */
function KpiLink({ to, children }: { to?: string; children: ReactNode }) {
  return to ? (
    <Link to={to} className="block h-full rounded-2xl focus-visible:ring-2 focus-visible:ring-focus *:h-full">
      {children}
    </Link>
  ) : (
    children
  )
}

function Kpis({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const now = useNow(60_000)
  const query = useWidgetData(() => getKpis(filters), key, REFRESH_MS, version)
  const k = query.data
  if (!k)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    )
  const q = (path: string, extra: Record<string, string>) => `${path}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(drillQuery(filters, {}))), ...extra })}`
  return (
    <KpiGrid>
      <KpiLink key="unhandled" to={isModuleOn("indikasi") ? q("/indikasi", { status: "sla", periode: "30d" }) : undefined}>
        <KpiCard
          icon={AlertTriangle}
          label={tr("Kritis/Tinggi belum ditangani", "Critical/High unhandled")}
          value={k.unhandled}
          tone={k.unhandledBreached ? "danger" : k.unhandled ? "warning" : "default"}
          note={k.unhandledBreached ? tr(`${k.unhandledBreached} sudah melewati SLA acknowledge`, `${k.unhandledBreached} already past the acknowledgement SLA`) : tr("Semua masih dalam SLA", "All still within SLA")}
        />
      </KpiLink>
      <KpiLink key="pending" to={isModuleOn("indikasi") ? q("/indikasi", { periode: "30d" }) : undefined}>
        <KpiCard icon={Hourglass} label={tr("Menunggu review", "Awaiting review")} value={k.pendingReview} note={k.oldestPending ? tr(`Tertua menunggu ${duration(now - k.oldestPending.getTime())}`, `Oldest waiting ${duration(now - k.oldestPending.getTime())}`) : tr("Tidak ada antrean", "No queue")} />
      </KpiLink>
      <KpiLink key="overdue" to={isModuleOn("tindakan") ? q("/tindakan", { status: "overdue" }) : undefined}>
        <KpiCard icon={ClipboardX} label={tr("Tindakan overdue", "Overdue actions")} value={k.overdue} tone={k.overdue ? "warning" : "default"} note={tr(`Dari ${k.openActions} tindakan terbuka`, `Of ${k.openActions} open actions`)} />
      </KpiLink>
      <KpiLink key="gaps" to={isModuleOn("sumber") ? q("/sumber", {}) : undefined}>
        <KpiCard icon={RadioTower} label={tr("Gap pemantauan", "Monitoring gaps")} value={k.gaps} tone={k.gaps ? "danger" : "default"} note={k.gaps ? k.gapIds.slice(0, 4).join(", ") + (k.gapIds.length > 4 ? ", …" : "") : tr("Semua sumber online", "All sources online")} />
      </KpiLink>
    </KpiGrid>
  )
}

const TONES: DecisionTone[] = ["danger", "warning", "accent"]
const sectionLabel: Record<DecisionTone, string> = { get danger() { return tr("Mendesak", "Urgent") }, get warning() { return tr("Perlu keputusan", "Needs a decision") }, get accent() { return tr("Pertimbangkan", "Consider") } }
const sectionNote: Record<DecisionTone, string> = {
  get danger() { return tr("Butuh orang bergerak sekarang: indikasi yang melewati SLA acknowledge, atau gap pemantauan di zona berisiko.", "Someone has to move now: indications past the acknowledgement SLA, or a monitoring gap in a risky zone.") },
  get warning() { return tr("Perlu diputuskan minggu ini, bukan direspons menit ini.", "To decide this week, not to respond to this minute.") },
  get accent() { return tr("Sinyal untuk ditinjau, bukan insiden.", "Signals to review, not incidents.") },
}
/** Urgency sets the weight: urgent rows are tall and bold, "consider" rows are one compact line. */
const rowPad: Record<DecisionTone, string> = { danger: "py-4", warning: "py-3", accent: "py-2" }
/** Titles sit in a button-tall box from md up, so they line up with the PIC and action beside them. */
const rowTitle: Record<DecisionTone, string> = { danger: "text-base font-semibold", warning: "text-sm font-medium", accent: "text-sm" }
const titleBox = "md:flex md:min-h-8 md:items-center"
/** Fixed PIC and action columns, so "who moves" reads down one line across every row. */
const sideCols = "flex flex-wrap items-center gap-x-3 gap-y-1 md:grid md:grid-cols-[12rem_9rem]"
/** Only these bars compare two real things (a share of reviews, battery left). The rest stay numbers. */
const realBar = new Set<DecisionKind>(["tuning", "power"])
/** Collapsed, the list shows this many rows: the most urgent ones. */
const SHOWN = 3

type Row = { d: Decision } | { cams: Decision[] }
type Section = { tone: DecisionTone; rows: Row[]; rollups: Decision[]; count: number }

/** Groups by urgency, folds offline cameras into one row and moves "N more" cards to the section's end. */
function toSections(list: Decision[]): Section[] {
  return TONES.map((tone) => {
    const own = list.filter((d) => d.tone === tone)
    const cams = own.filter((d) => d.kind === "camera")
    const rows: Row[] = []
    for (const d of own) {
      if (d.rollup) continue
      if (d.kind === "camera" && cams.length > 1) {
        if (d === cams[0]) rows.push({ cams })
        continue
      }
      rows.push({ d })
    }
    return { tone, rows, rollups: own.filter((d) => d.rollup), count: rows.length }
  }).filter((s) => s.rows.length || s.rollups.length)
}

function Pic({ owner }: { owner: string }) {
  return (
    <span className="text-sm">
      <span className="text-muted">PIC </span>
      {owner}
    </span>
  )
}

/** Red is spent here only: the share of the wait that ran past the SLA. */
function SlaLine({ d, sla }: { d: Decision; sla: { elapsedMs: number; limitMs: number } }) {
  return (
    <>
      <p className="text-sm text-muted">{[d.severity && severityMeta[d.severity].label, ...d.facts].filter(Boolean).join(" · ")}</p>
      <p className="text-sm">
        <span className="font-medium text-danger">{tr("Lewat SLA", "Past SLA")}</span>
        <span className="text-muted">
          {" · "}
          {tr(`${duration(sla.elapsedMs)} sejak deteksi, batas ${duration(sla.limitMs)}`, `${duration(sla.elapsedMs)} since detection, limit ${duration(sla.limitMs)}`)}
        </span>
      </p>
      <div className="flex h-1.5 max-w-md overflow-hidden rounded-full" aria-hidden>
        <div className="shrink-0 bg-muted/70" style={{ width: `max(2px, ${(sla.limitMs / sla.elapsedMs) * 100}%)` }} />
        <div className="flex-1 bg-danger" />
      </div>
    </>
  )
}

function DecisionRow({ d, tone }: { d: Decision; tone: DecisionTone }) {
  const m = d.metric
  const bar = m.bar && realBar.has(d.kind) ? m.bar : undefined
  // "Consider" rows run on one line from md up, their bars in a fixed 12rem column.
  const compact = tone === "accent"
  const bars = (bar || m.compare) && (
    <div className="w-full max-w-xs">
      {bar && <MiniBar value={bar.value} max={bar.max} tone="accent" />}
      {m.compare && <CompareBars {...m.compare} tone="accent" />}
    </div>
  )
  return (
    <li className={cn("grid gap-x-6 gap-y-2 md:items-start", compact ? "md:grid-cols-[minmax(0,1fr)_12rem_auto]" : "md:grid-cols-[minmax(0,1fr)_auto]", rowPad[tone])}>
      <div className={cn("flex min-w-0 flex-col gap-1", compact && "md:flex-row md:flex-wrap md:items-center md:gap-x-4")}>
        <h4 className={cn(rowTitle[tone], titleBox)}>{d.title}</h4>
        {d.sla ? (
          <SlaLine d={d} sla={d.sla} />
        ) : (
          // Skip the number when the title already starts with it ("6 tindakan korektif ...").
          !d.title.startsWith(`${m.value} `) && (
            <p className="text-sm text-muted">
              <span className="font-medium text-foreground tabular-nums">{m.value}</span> {m.label}
            </p>
          )
        )}
        {!compact && bars}
      </div>
      {compact && <div className="md:flex md:min-h-8 md:items-center">{bars}</div>}
      <div className={sideCols}>
        <Pic owner={d.owner} />
        <Link to={d.cta.href} aria-label={`${d.cta.label}, ${d.title}`} className={cn(buttonVariants({ size: "sm", variant: tone === "danger" ? "secondary" : "tertiary" }), "md:justify-self-end")}>
          {d.cta.label}
        </Link>
      </div>
    </li>
  )
}

function CameraRow({ cams, tone }: { cams: Decision[]; tone: DecisionTone }) {
  return (
    <li className={cn("grid gap-x-6 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start", rowPad[tone])}>
      <div className="flex min-w-0 flex-col gap-1">
        <h4 className={cn(rowTitle[tone], titleBox)}>{tr(`${cams.length} kamera offline`, `${cams.length} cameras offline`)}</h4>
        <ul className="flex flex-col">
          {cams.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-2 text-sm">
              <span className="font-medium tabular-nums">{c.facts[0]}</span>
              <span className="text-muted">{[c.place, tr(`offline ${c.metric.value}`, `offline ${c.metric.value}`), c.facts[1]].filter(Boolean).join(" · ")}</span>
              <Link to={c.cta.href} aria-label={`${c.cta.label}, ${c.facts[0]}`} className={buttonVariants({ size: "sm", variant: tone === "danger" ? "secondary" : "tertiary" })}>
                {c.cta.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn(sideCols, "md:min-h-8")}>
        <Pic owner={cams[0].owner} />
      </div>
    </li>
  )
}

function Decisions({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getDecisions(filters), key, REFRESH_MS, version)
  const [all, setAll] = useState(false)
  const listId = useId()
  return (
    <Widget title={tr("Keputusan yang dibutuhkan sekarang", "Decisions needed now")}>
      <WidgetBody
        query={query}
        skeleton={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        }
        isEmpty={(list) => !list.length}
        empty={tr("Tidak ada aturan yang terpicu. Tidak ada keputusan yang menunggu.", "No rule is triggered. No decision is waiting.")}
      >
        {(list) => {
          const sections = toSections(list)
          const total = sections.reduce((n, s) => n + s.count, 0)
          let left = all ? Infinity : SHOWN
          const shown = sections
            .map((s) => {
              const rows = s.rows.slice(0, Math.max(0, left))
              left -= rows.length
              return { ...s, rows, rollups: rows.length || all ? s.rollups : [] }
            })
            .filter((s) => s.rows.length || s.rollups.length)
          return (
            <div className="flex flex-col gap-6">
              <div id={listId} className="flex flex-col gap-6">
                {shown.map((s) => (
                  <section key={s.tone} aria-labelledby={`${listId}-${s.tone}`} className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2 border-b border-border pb-2">
                      <h3 id={`${listId}-${s.tone}`} className="text-sm font-semibold">
                        {sectionLabel[s.tone]}
                      </h3>
                      <span className="text-sm text-muted tabular-nums">{s.count}</span>
                      <InfoTip label={sectionLabel[s.tone]}>{sectionNote[s.tone]}</InfoTip>
                    </div>
                    <ul className="divide-y divide-border">
                      {s.rows.map((r) => ("cams" in r ? <CameraRow key="cams" cams={r.cams} tone={s.tone} /> : <DecisionRow key={r.d.id} d={r.d} tone={s.tone} />))}
                    </ul>
                    {s.rollups.map((r) => (
                      <p key={r.id} className="flex flex-wrap items-center gap-x-2 border-t border-border pt-3 text-sm text-muted">
                        <Link to={r.cta.href} className="rounded-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none">
                          +{r.title}
                        </Link>
                        <span aria-hidden>·</span>
                        <Pic owner={r.owner} />
                      </p>
                    ))}
                  </section>
                ))}
              </div>
              {total > SHOWN && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button size="sm" variant="tertiary" aria-expanded={all} aria-controls={listId} onPress={() => setAll((v) => !v)}>
                    {all ? tr(`Tampilkan ${SHOWN} teratas`, `Show top ${SHOWN}`) : tr(`Lihat semua (${total})`, `See all (${total})`)}
                  </Button>
                  <span className="text-sm text-muted" aria-live="polite">
                    {all ? tr(`Menampilkan semua ${total} keputusan`, `Showing all ${total} decisions`) : tr(`Menampilkan ${SHOWN} teratas dari ${total} keputusan`, `Showing the top ${SHOWN} of ${total} decisions`)}
                  </span>
                </div>
              )}
            </div>
          )
        }}
      </WidgetBody>
    </Widget>
  )
}

function PriorityQueue({ version, className }: { version: number; className?: string }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getPriorityQueue(filters), key, REFRESH_MS, version)
  const [openId, setOpenId] = useState<string>()
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Widget
      title={tr("Antrean prioritas", "Priority queue")}
      className={className}
      action={
        <Link to={`/indikasi?${new URLSearchParams({ site: filters.site })}`} className={buttonVariants({ size: "sm", variant: "tertiary" })}>
          {tr("Semua antrean", "Whole queue")}
        </Link>
      }
    >
      <WidgetBody
        query={query}
        skeleton={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        }
        isEmpty={(list) => !list.length}
        empty={tr("Tidak ada indikasi yang menunggu review.", "No indication awaits review.")}
      >
        {(list) => (
          <ol className="grid gap-x-4 gap-y-1 lg:grid-cols-2">
              {list.slice(0, 6).map(({ event: e, reason, breached, waitedMs, slaMs, acknowledged }, i) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(e.id)
                      setIsOpen(true)
                    }}
                    aria-description={reason}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-default"
                  >
                    <span className="w-5 shrink-0 text-sm text-muted tabular-nums">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{e.judul}</span>
                        <SeverityChip severity={e.severity} />
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <MapPin className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{e.zona.label}</span>
                        <Camera className="ml-1 size-3 shrink-0" aria-hidden />
                        <span className="shrink-0">{e.kamera}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-1" title={acknowledged ? tr("Sudah di-acknowledge", "Acknowledged") : tr("Belum di-acknowledge", "Not acknowledged")}>
                          {acknowledged ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <MiniBar value={waitedMs} max={slaMs} tone={breached ? "danger" : waitedMs > slaMs / 2 ? "warning" : "accent"} />
                        <span className={cn("shrink-0 text-xs tabular-nums", breached ? "text-danger" : "text-muted")}>{duration(waitedMs)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
        )}
      </WidgetBody>
      <IndikasiDrawer filters={filters} id={openId} isOpen={isOpen} onOpenChange={setIsOpen} />
    </Widget>
  )
}

const trendConfig = {
  indikasi: { get label() { return tr("Indikasi AI", "AI indications") }, colors: { light: ["var(--chart-1)"], dark: ["var(--chart-1)"] } },
  terkonfirmasi: { get label() { return tr("Temuan terkonfirmasi", "Confirmed findings") }, colors: { light: ["var(--danger)"], dark: ["var(--danger)"] } },
}

function TrendPanel({ className }: { className?: string }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getDailyTrend(filters), key, REFRESH_MS)
  return (
    <Widget title={tr("Indikasi vs temuan terkonfirmasi", "Indications vs confirmed findings")} description={tr("Dua ukuran berbeda, per hari: indikasi dari detektor, temuan dari review manusia. Minimal 7 hari.", "Two different measures, per day: indications from detectors, findings from human review. At least 7 days.")} className={className}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-60 rounded-lg" />} isEmpty={(p) => p.every((x) => !x.indikasi)} empty={tr("Belum ada indikasi pada periode ini.", "No indications in this period yet.")}>
        {(points) => (
          <EvilLineChart data={points} config={trendConfig} className="aspect-auto min-h-80">
            <EvilLineChart.Grid />
            <EvilLineChart.XAxis dataKey="hari" />
            <EvilLineChart.YAxis />
            <EvilLineChart.Tooltip />
            <EvilLineChart.Legend />
            <EvilLineChart.Line dataKey="indikasi" strokeWidth={2}>
              <EvilLineChart.Dot />
            </EvilLineChart.Line>
            <EvilLineChart.Line dataKey="terkonfirmasi" strokeWidth={2}>
              <EvilLineChart.Dot />
            </EvilLineChart.Line>
          </EvilLineChart>
        )}
      </WidgetBody>
    </Widget>
  )
}

/** Same single-hue scale as the APD heatmap; zero stays neutral. */
const shade = (n: number, max: number) => (n === 0 ? "var(--default)" : `color-mix(in oklab, var(--danger) ${Math.round(15 + (85 * n) / Math.max(1, max))}%, transparent)`)

function HotspotPanel() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getHotspot(filters), key, REFRESH_MS)
  return (
    <Widget title={tr("Matriks hotspot temuan", "Findings hotspot matrix")} description={tr("Zona × kategori, temuan terkonfirmasi dalam periode. Makin gelap makin banyak. Pilih sel untuk membuka indikasinya.", "Zone × category, confirmed findings in the period. Darker means more. Pick a cell to open its indications.")}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-52 rounded-lg" />} isEmpty={(h) => !h.zones.length || h.max === 0} empty={tr("Belum ada temuan terkonfirmasi pada periode ini.", "No confirmed findings in this period yet.")}>
        {(h) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-lg border-separate border-spacing-0.5 text-sm">
              <thead>
                <tr>
                  <th scope="col" className="text-left font-normal text-muted">
                    <span className="sr-only">{tr("Zona", "Zone")}</span>
                  </th>
                  {h.kategori.map((k) => (
                    <th key={k} scope="col" className="px-1 pb-1 text-center text-xs font-normal text-muted">
                      {kategoriDef(k).label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {h.zones.map((z) => (
                  <tr key={z.id}>
                    <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap">
                      {z.label}
                    </th>
                    {h.kategori.map((k) => {
                      const n = h.counts[z.id]?.[k] ?? 0
                      const [site, zona] = z.id.split("/")
                      const to = `/indikasi?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(drillQuery(filters, { site, zona: filters.site === "all" ? z.id : zona, kategori: k }))), site, status: "selesai" })}`
                      return (
                        <td key={k} className="p-0">
                          <Tooltip delay={0} closeDelay={0}>
                            <Tooltip.Trigger className="block">
                              <Link
                                to={isModuleOn("indikasi") ? to : "#"}
                                aria-label={`${z.label}, ${kategoriDef(k).label}: ${n} ${tr("temuan", "findings")}`}
                                className={cn("grid h-9 place-items-center rounded-sm tabular-nums", n / Math.max(1, h.max) > 0.55 && "text-danger-foreground")}
                                style={{ background: shade(n, h.max) }}
                              >
                                {n || ""}
                              </Link>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                              {z.label} · {kategoriDef(k).label}: <strong>{n}</strong> {tr("temuan", "findings")}
                            </Tooltip.Content>
                          </Tooltip>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetBody>
    </Widget>
  )
}

function SlaPanel() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getSlaPanel(filters), key, REFRESH_MS)
  const s = rules.ackSlaMinutes
  return (
    <Widget title={tr("Kinerja respons · SLA acknowledge", "Response performance · acknowledgement SLA")} description={tr(`SLA: Kritis ${s.kritis} · Tinggi ${s.tinggi} · Sedang ${s.sedang} · Rendah ${s.rendah} menit. Ilustratif sampai disepakati dengan klien.`, `SLA: Critical ${s.kritis} · High ${s.tinggi} · Medium ${s.sedang} · Low ${s.rendah} min. Illustrative until agreed with the client.`)}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(r) => r.every((x) => !x.total)} empty={tr("Belum ada indikasi pada periode ini.", "No indications in this period yet.")}>
        {(rows) => (
          <ol className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.severity}>
                <Meter value={r.total ? 100 - r.rate * 100 : 0} valueLabel={tr(`${r.total ? Math.round(100 - r.rate * 100) : 0}% tepat waktu · ${r.breached}/${r.total} terlewat`, `${r.total ? Math.round(100 - r.rate * 100) : 0}% on time · ${r.breached}/${r.total} missed`)} size="sm" color={r.rate > 0.3 ? "danger" : r.rate > 0.15 ? "warning" : "success"}>
                  <Label>
                    {r.label} ({r.limitMinutes} {tr("menit", "min")})
                  </Label>
                  <Meter.Output />
                  <Meter.Track>
                    <Meter.Fill />
                  </Meter.Track>
                </Meter>
              </li>
            ))}
          </ol>
        )}
      </WidgetBody>
    </Widget>
  )
}

function CoveragePanel({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getCoverage(filters), key, REFRESH_MS, version)
  return (
    <Widget
      title={tr("Cakupan pemantauan", "Monitoring coverage")}
      description={tr("Kamera, uplink, server edge, pole, dan Manpack. Snapshot saat ini, bukan uptime historis.", "Cameras, uplinks, edge servers, poles and Manpacks. The current snapshot, not historical uptime.")}
      action={
        isModuleOn("sumber") && (
          <Link to={`/sumber?${drillQuery(filters, {})}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
            {tr("Buka sumber", "Open sources")}
          </Link>
        )
      }
    >
      <WidgetBody query={query} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(r) => !r.length} empty={tr("Tidak ada sumber untuk filter ini.", "No sources for these filters.")}>
        {(rows) => (
          <ol className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.jenis}>
                <Meter
                  value={r.online}
                  maxValue={r.total}
                  valueLabel={`${r.online}/${r.total} online${r.degraded ? ` · ${r.degraded} ${tr("menurun", "degraded")}` : ""}${r.offline ? ` · ${r.offline} offline` : ""}`}
                  size="sm"
                  color={r.offline ? "danger" : r.degraded ? "warning" : "success"}
                >
                  <Label>{sourceJenisLabel[r.jenis]}</Label>
                  <Meter.Output />
                  <Meter.Track>
                    <Meter.Fill />
                  </Meter.Track>
                </Meter>
              </li>
            ))}
          </ol>
        )}
      </WidgetBody>
    </Widget>
  )
}

export function KeputusanPage() {
  const { key } = useFilters()
  const version = useWorkflowVersion()
  return (
    <div className="flex flex-col gap-4" key={key}>
      {/* Site stays in here: the header picker is hidden on phones, and a ?site= link must show. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["periode", "site", "zona", "shift"]} />
      </div>
      <Kpis version={version} />
      <Decisions version={version} />
      <PriorityQueue version={version} />
      {/* Analysis for whoever wants it, one panel at a time. */}
      <Tabs>
        <Tabs.ListContainer>
          <Tabs.List aria-label={tr("Analisis", "Analysis")}>
            {[
              { id: "tren", label: tr("Tren", "Trend") },
              { id: "hotspot", label: "Hotspot" },
              { id: "sla", label: "SLA" },
              { id: "cakupan", label: tr("Cakupan", "Coverage") },
            ].map((t) => (
              <Tabs.Tab key={t.id} id={t.id}>
                {t.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="tren" className="pt-4">
          <TrendPanel />
        </Tabs.Panel>
        <Tabs.Panel id="hotspot" className="pt-4">
          <HotspotPanel />
        </Tabs.Panel>
        <Tabs.Panel id="sla" className="pt-4">
          <SlaPanel />
        </Tabs.Panel>
        <Tabs.Panel id="cakupan" className="pt-4">
          <CoveragePanel version={version} />
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}
