import { useEffect, useRef, useState } from "react"
import { Button, Card, Chip, Disclosure, Skeleton, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, toast } from "@heroui/react"
import { AlarmClock, CalendarX, ChevronDown, Copy, Download, ScanEye, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { Link } from "react-router"

import { CompareBars, IconTile, MiniBar, toneText, type Tone } from "@/shared/components/visual"
import { FilterButton, useFilters } from "@/shared/components/filter-bar"
import { Segments } from "@/features/analysis/components/segments"
import { BareWidgets, REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { AreaWidget, RepeatWidget, WeekWidget } from "@/features/analysis/components/tren-widgets"
import { lineColors } from "@/shared/config/lingkungan"
import { getLang, tr } from "@/shared/lib/i18n"
import { rules } from "@/shared/config/rules"
import { briefMarkdown, confounderText, getAnomalies, getBriefFacts, getZoneRanking, writeBrief, type Brief, type Facts, type Lang, type RankedZone, type Seg } from "@/features/analysis/data/analisis"
import { fillLastRow } from "@/shared/lib/grid"
import { cn } from "@/shared/lib/utils"
import { useWorkflowVersion } from "@/shared/lib/workflow-ui"

// Distinct hues from the line palette, none of them the warning yellow or danger red.
const parts = [
  { key: "volume", get label() { return tr("Volume temuan 14 hari", "14-day finding volume") }, color: lineColors[0] },
  { key: "severity", get label() { return tr("Porsi Kritis/Tinggi", "Critical/High share") }, color: lineColors[3] },
  { key: "repeat", get label() { return tr("Temuan berulang", "Repeat findings") }, color: lineColors[2] },
  { key: "trend", get label() { return tr("Tren 7 hari", "7-day trend") }, color: lineColors[1] },
  { key: "coverage", get label() { return tr("Ketidakpastian cakupan", "Coverage uncertainty") }, color: lineColors[4] },
  { key: "lingkungan", get label() { return tr("Kondisi lingkungan", "Environment") }, color: lineColors[5] },
] as const

function ScoreBar({ zone }: { zone: RankedZone }) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-default" role="img" aria-label={`Skor ${zone.score}: ${parts.map((p) => `${p.label} ${zone.parts[p.key]}`).join(", ")}`}>
      {parts.map((p) =>
        zone.parts[p.key] > 0 ? (
          <Tooltip key={p.key} delay={0} closeDelay={0}>
            <Tooltip.Trigger className="h-full" style={{ width: `${zone.parts[p.key]}%`, background: p.color }} aria-label={`${p.label}: ${zone.parts[p.key]}`} />
            <Tooltip.Content>
              {p.label}: <strong>{zone.parts[p.key]}</strong> / {rules.riskWeights[p.key]}
            </Tooltip.Content>
          </Tooltip>
        ) : null,
      )}
    </div>
  )
}

function RiskRanking({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getZoneRanking(filters), key, REFRESH_MS, version)
  const [open, setOpen] = useState<string | null>(null)
  const w = rules.riskWeights
  return (
    <Widget
      title={tr("Ranking risiko zona", "Zone risk ranking")}
      description={tr(`Skor 0–100 yang bisa dijelaskan: volume ${w.volume} · severity ${w.severity} · berulang ${w.repeat} · tren ${w.trend} · cakupan ${w.coverage}. Arahkan ke segmen untuk nilainya; pilih baris untuk rinciannya.`, `Explainable 0–100 score: volume ${w.volume} · severity ${w.severity} · repeat ${w.repeat} · trend ${w.trend} · coverage ${w.coverage}. Hover a segment for its value; pick a row for the breakdown.`)}
      action={<Chip size="sm">{tr("Berbasis aturan", "Rule-based")}</Chip>}
    >
      <WidgetBody query={query} skeleton={<Skeleton className="h-72 rounded-lg" />} isEmpty={(z) => !z.length} empty={tr("Tidak ada zona untuk filter ini.", "No zones for these filters.")}>
        {(zones) => (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label={tr("Komponen skor", "Score components")}>
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                  {p.label}
                </li>
              ))}
            </ul>
            <ol className="flex flex-col gap-1">
              {zones.map((z, i) => {
                const id = `${z.site}/${z.zona}`
                const isOpen = open === id
                return (
                  <li key={id} className="rounded-lg">
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)} className={cn("flex w-full flex-col gap-1.5 rounded-lg p-2 text-left hover:bg-default", isOpen && "bg-default")}>
                      <span className="flex items-baseline gap-2 text-sm">
                        <span className="w-5 text-muted tabular-nums">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{z.label}</span>
                        <span className="text-lg font-semibold font-display tabular-nums">{z.score}</span>
                        <span className={cn("w-16 text-right text-xs tabular-nums", z.delta && z.delta > 0 ? "text-danger" : "text-muted")}>
                          {z.delta === undefined ? "" : `${z.delta > 0 ? "▲" : z.delta < 0 ? "▼" : "•"} ${Math.abs(z.delta)} / ${tr("7 hr", "7 d")}`}
                        </span>
                        <ChevronDown className={cn("size-4 text-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                      </span>
                      <ScoreBar zone={z} />
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-2 px-2 pt-1 pb-3 pl-9 text-sm">
                        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                          {parts.map((p) => (
                            <div key={p.key} className="contents">
                              <dt className="text-muted">{p.label}</dt>
                              <dd className="tabular-nums">
                                {z.parts[p.key]} / {rules.riskWeights[p.key]}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p className="text-muted">
                          {tr(`${z.cameras} kamera di zona ini.`, `${z.cameras} cameras in this zone.`)} {z.sensors ? tr(`${z.sensors} sensor lingkungan.`, `${z.sensors} environment sensors.`) : tr("Tanpa sensor lingkungan, jadi kondisi lingkungan tidak terukur (bukan berarti aman).", "No environment sensors, so the environment isn't measured (not the same as safe).")} {z.previous !== undefined && tr(`Skor 7 hari lalu: ${z.previous}.`, `Score 7 days ago: ${z.previous}.`)}
                        </p>
                        <Link to={z.href} className="self-start text-link underline-offset-2 hover:underline">
                          {tr("Lihat temuan zona ini", "See this zone's findings")}
                        </Link>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </WidgetBody>
    </Widget>
  )
}

function Anomalies() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getAnomalies(filters), key, REFRESH_MS)
  const a = rules.anomaly
  return (
    <Widget title={tr("Anomali · 24 jam vs baseline 28 hari", "Anomalies · 24 h vs 28-day baseline")} description={tr(`Ditandai bila indikasi 24 jam terakhir ≥ ${a.ratio}× rata-rata harian ${a.baselineDays} hari dan ≥ ${a.min}. Perubahan cakupan dicatat sebagai faktor pengganggu.`, `Flagged when the last 24 h has ≥ ${a.ratio}× the ${a.baselineDays}-day daily mean and ≥ ${a.min}. Coverage changes are listed as confounders.`)}>
      <WidgetBody query={query} skeleton={<Skeleton className="h-32 rounded-lg" />} isEmpty={(r) => !r.length} empty={tr("Tidak ada anomali dalam 24 jam terakhir.", "No anomalies in the last 24 hours.")}>
        {(rows) => (
          <ul className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", fillLastRow(rows.length))}>
            {rows.map((r) => (
              <li key={`${r.site}/${r.zona}`} className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={r.href} className="font-medium underline-offset-2 hover:underline">
                    {r.label}
                  </Link>
                  <span className="tabular-nums">
                    {r.last24h} vs {r.baselineDaily.toFixed(1)}/{tr("hari", "day")} · {Number.isFinite(r.ratio) ? `${r.ratio.toFixed(1)}×` : tr("baru", "new")}
                  </span>
                </p>
                <CompareBars a={r.last24h} b={r.baselineDaily} aLabel={tr("24 jam", "24 h")} bLabel={tr("Rata-rata", "Mean")} />
                <p className="font-mono text-xs">
                  <Segments segs={r.refs.slice(0, 3).flatMap((s, i) => (i ? [" ", s] : [s]))} />
                  {r.last24h > 3 && <span className="text-muted"> +{r.last24h - 3}</span>}
                </p>
                {r.confounders.length > 0 && <p className="text-xs text-warning-ink">{tr("Faktor pengganggu", "Confounders")}: {confounderText(r.confounders, getLang())}</p>}
              </li>
            ))}
          </ul>
        )}
      </WidgetBody>
    </Widget>
  )
}

function BriefBody({ brief }: { brief: Brief }) {
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed">
      {brief.sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-1.5">
          <h3 className="font-medium">{s.title}</h3>
          {s.paragraphs.map((p, i) => (
            <p key={i}>
              <Segments segs={p} />
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}

/** The brief revealed word by word, as a model's draft would stream in. ponytail: it is the same template. */
function useDraft(brief: Brief | undefined) {
  const [shown, setShown] = useState<number | null>(null)
  const total = brief ? brief.sections.reduce((n, s) => n + s.paragraphs.reduce((m, p) => m + p.length, 0), 0) : 0
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])
  const start = () => {
    clearInterval(timer.current)
    setShown(0)
    timer.current = setInterval(() => {
      setShown((n) => {
        if (n === null || n >= total) {
          clearInterval(timer.current)
          return total
        }
        return n + 1
      })
    }, 45)
  }
  const reset = () => {
    clearInterval(timer.current)
    setShown(null)
  }
  if (!brief || shown === null) return { brief, start, reset, drafting: false, isDraft: false }
  return { brief: firstSegments(brief, shown), start, reset, drafting: shown < total, isDraft: true }
}

/** The brief cut after its first `n` segments. */
function firstSegments(brief: Brief, n: number): Brief {
  const sections: Brief["sections"] = []
  let left = n
  for (const s of brief.sections) {
    const paragraphs: Seg[][] = []
    for (const p of s.paragraphs) {
      if (left <= 0) break
      paragraphs.push(p.slice(0, left))
      left -= Math.min(p.length, left)
    }
    if (paragraphs.length) sections.push({ ...s, paragraphs })
    if (left <= 0) break
  }
  return { ...brief, sections }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }))
  const link = Object.assign(document.createElement("a"), { href: url, download: name })
  link.click()
  URL.revokeObjectURL(url)
}

/** The facts JSON a model would receive, without links. */
const factsForModel = (f: Facts) =>
  JSON.stringify(
    f,
    (k, v) => (k === "href" ? undefined : v && typeof v === "object" && "id" in v && "href" in v ? v.id : v),
    2,
  )

/** The brief's headline numbers as tiles, so the narrative below reads as detail, not the first thing. */
function BriefStats({ facts, lang }: { facts: Facts; lang: Lang }) {
  const t = (id: string, en: string) => (lang === "id" ? id : en)
  const change = facts.mingguLalu ? Math.round(((facts.mingguIni - facts.mingguLalu) / facts.mingguLalu) * 100) : 0
  const confirmedShare = facts.indikasi ? facts.terkonfirmasi / facts.indikasi : 0
  const tiles = [
    { icon: ScanEye, tone: "accent" as Tone, value: String(facts.indikasi), label: t("indikasi AI", "AI indications"), extra: <MiniBar value={confirmedShare} max={1} tone="danger" />, note: t(`${facts.terkonfirmasi} terkonfirmasi`, `${facts.terkonfirmasi} confirmed`) },
    { icon: change > 0 ? TrendingUp : TrendingDown, tone: (change > 0 ? "danger" : "success") as Tone, value: `${change > 0 ? "+" : ""}${change}%`, label: t("vs minggu lalu", "vs last week"), note: `${facts.mingguIni} / ${facts.mingguLalu}` },
    { icon: AlarmClock, tone: (facts.lewatSla ? "danger" : "default") as Tone, value: String(facts.belumDitangani), label: t("Kritis/Tinggi belum ditangani", "Critical/High unhandled"), note: t(`${facts.lewatSla} lewat SLA`, `${facts.lewatSla} past SLA`) },
    { icon: CalendarX, tone: (facts.tindakanOverdue.length ? "warning" : "default") as Tone, value: String(facts.tindakanOverdue.length), label: t("tindakan overdue", "overdue actions"), note: t(`${facts.gap.length} sumber tidak normal`, `${facts.gap.length} sources not normal`) },
  ]
  return (
    <ul className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
      {tiles.map((x) => (
        <li key={x.label} className="flex items-start gap-2.5 rounded-xl bg-default/60 p-3">
          <IconTile icon={x.icon} tone={x.tone} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn("font-display text-xl leading-none font-semibold tabular-nums", toneText[x.tone])}>{x.value}</span>
            <span className="text-xs leading-tight text-muted">{x.label}</span>
            {x.extra}
            <span className="text-xs tabular-nums">{x.note}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function BriefWidget({ facts, lang, onLang }: { facts: Facts; lang: Lang; onLang: (l: Lang) => void }) {
  const template = writeBrief(facts, lang)
  const draft = useDraft(template)
  const shown = draft.brief ?? template
  const label = draft.isDraft ? (lang === "id" ? "Draf AI · verifikasi sebelum bertindak" : "AI-drafted · verify before action") : lang === "id" ? "Template · siap LLM" : "Template · LLM-ready"
  const md = briefMarkdown(template, label)
  return (
    <Widget
      title={lang === "id" ? "Brief manajemen" : "Management brief"}
      description={lang === "id" ? "Disusun dari cakupan dan periode yang dipilih. Setiap ID bisa dibuka untuk dicek." : "Built from the selected scope and period. Every ID opens the record."}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ToggleButtonGroup aria-label="Bahasa brief" size="sm" selectionMode="single" disallowEmptySelection selectedKeys={[lang]} onSelectionChange={(k) => onLang([...k][0] as Lang)}>
            <ToggleButton id="id">ID</ToggleButton>
            <ToggleButton id="en">
              <ToggleButtonGroup.Separator />
              EN
            </ToggleButton>
          </ToggleButtonGroup>
          <Button size="sm" variant="secondary" onPress={() => navigator.clipboard?.writeText(md).then(() => toast.success(lang === "id" ? "Brief disalin." : "Brief copied."))}>
            <Copy aria-hidden />
            {lang === "id" ? "Salin" : "Copy"}
          </Button>
          <Button size="sm" variant="secondary" onPress={() => download(`brief-${new Date().toLocaleDateString("sv-SE")}-${lang}.md`, md)}>
            <Download aria-hidden />
            .md
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" color={draft.isDraft ? "warning" : "default"}>
            {label}
          </Chip>
          <Button size="sm" variant={draft.isDraft ? "tertiary" : "primary"} isDisabled={draft.drafting} onPress={draft.isDraft ? draft.reset : draft.start}>
            <Sparkles aria-hidden />
            {draft.isDraft ? (lang === "id" ? "Kembali ke template" : "Back to template") : lang === "id" ? "Buat draf dengan AI" : "Draft with AI"}
          </Button>
        </div>
        <BriefStats facts={facts} lang={lang} />
        <div aria-live="polite" aria-busy={draft.drafting}>
          <BriefBody brief={shown} />
        </div>
        <Disclosure>
          <Disclosure.Heading>
            <Button slot="trigger" size="sm" variant="tertiary">
              {lang === "id" ? "Lihat fakta yang dikirim ke model" : "Show facts sent to the model"}
              <Disclosure.Indicator />
            </Button>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body>
              <p className="mb-2 text-xs text-muted">
                {lang === "id"
                  ? "Model hanya menerima fakta hasil perhitungan ini: tanpa video, tanpa thumbnail, tanpa koordinat. Instruksinya: kutip ID untuk setiap klaim, jangan mengarang angka, jangan klaim akurasi AI. Mode demo: tidak ada yang dikirim ke mana pun."
                  : "The model only receives these computed facts: no video, no thumbnails, no coordinates. It is told to cite an ID for every claim, never invent numbers, never claim AI accuracy. Demo mode: nothing is sent anywhere."}
              </p>
              <pre className="max-h-80 overflow-auto rounded-lg bg-default p-3 text-xs">{factsForModel(facts)}</pre>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      </div>
    </Widget>
  )
}

function InsightPanels({ version }: { version: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getBriefFacts(filters), key, REFRESH_MS, version)
  // The brief and the assistant start in the interface language and can be switched on their own.
  const [lang, setLang] = useState<Lang>(getLang())
  return (
    <WidgetBody
      query={query}
      skeleton={
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      }
      isEmpty={() => false}
      empty=""
    >
      {(facts) =>
        facts && (
          // Questions go to the AI Assistant page; here only the brief.
          <BriefWidget facts={facts} lang={lang} onLang={setLang} />
        )
      }
    </WidgetBody>
  )
}

/**
 * Risk analysis and trends on one screen: which zones are riskiest and why on the left, and what
 * changed (week on week, repeats, anomalies) plus the written brief on the right, one tab at a time.
 */
export function AnalisisPage() {
  const { key } = useFilters()
  const version = useWorkflowVersion()
  const tabs = [
    { id: "minggu", label: tr("Minggu ini vs lalu", "This week vs last"), content: <WeekWidget version={version} /> },
    { id: "berulang", label: tr("Berulang", "Repeats"), content: <RepeatWidget version={version} /> },
    { id: "area", label: tr("Temuan per area", "Findings by area"), content: <AreaWidget version={version} /> },
    { id: "anomali", label: tr("Anomali", "Anomalies"), content: <Anomalies /> },
    { id: "brief", label: "Brief", content: <InsightPanels version={version} /> },
  ]
  return (
    <div key={key} className="flex flex-col gap-3 lg:h-[calc(100dvh-11rem)] lg:min-h-[34rem]">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["periode", "zona", "shift", "kategori"]} />
      </div>
      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]">
        <Card className="min-w-0 lg:min-h-0">
          <Card.Header>
            <Card.Title render={(p) => <h2 {...p} />}>{tr("Ranking risiko zona", "Zone risk ranking")}</Card.Title>
          </Card.Header>
          <Card.Content className="max-h-[32rem] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            <BareWidgets>
              <RiskRanking version={version} />
            </BareWidgets>
          </Card.Content>
        </Card>
        <Card className="min-w-0 lg:min-h-0">
          <Card.Content className="flex flex-col lg:min-h-0 lg:flex-1">
            <BareWidgets>
              <Tabs className="flex flex-col lg:min-h-0 lg:flex-1">
                <Tabs.ListContainer>
                  <Tabs.List aria-label={tr("Detail analisis", "Analysis detail")}>
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
