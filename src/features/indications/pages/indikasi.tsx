import { useState } from "react"
import { Button, Label, SearchField, Skeleton, Tabs } from "@heroui/react"
import { Download } from "lucide-react"
import { useSearchParams } from "react-router"

import { IndikasiDrawer } from "@/features/indications/components/indikasi-drawer"
import { RegisterTable, type Column } from "@/shared/components/register-table"
import { SeverityChip } from "@/shared/components/severity-chip"
import { OutcomeChip, WorkflowChip } from "@/shared/components/status-chip"
import { FilterButton, useFilters, useSetParams } from "@/shared/components/filter-bar"
import { REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { severityMeta } from "@/shared/config/events"
import { kategoriDef, outcomeMeta, pendingReview, tierLabel, workflowMeta } from "@/shared/config/indikasi"
import { shiftLabel } from "@/features/ppe/data/apd"
import { acknowledge, findingOf, getIndications, type AiEvent } from "@/features/indications/data/indikasi"
import { slaBreached } from "@/shared/lib/rules"
import { downloadCsv } from "@/shared/lib/csv"
import { duration, useNow } from "@/shared/lib/time"
import { runWorkflow, useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { locale, tr } from "@/shared/lib/i18n"

const tabs = [
  { id: "menunggu", get label() { return tr("Menunggu review", "Awaiting review") }, match: (e: AiEvent) => pendingReview.includes(e.workflow) },
  { id: "baru", get label() { return tr("Belum di-acknowledge", "Not acknowledged") }, match: (e: AiEvent) => e.workflow === "new" },
  { id: "sla", get label() { return tr("SLA terlewat", "SLA missed") }, match: (e: AiEvent, now: number) => pendingReview.includes(e.workflow) && breached(e, now) },
  { id: "selesai", get label() { return tr("Review selesai", "Review completed") }, match: (e: AiEvent) => !pendingReview.includes(e.workflow) },
  { id: "semua", get label() { return tr("Semua", "All") }, match: () => true },
] as const
type Tab = (typeof tabs)[number]["id"]

const breached = (e: AiEvent, now: number) => slaBreached({ severity: e.severity, t: e.waktu.getTime(), ackAt: e.ackAt?.getTime() }, now)
const shortTime = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const lagText = (s: number) => (s < 120 ? tr(`${s} dtk`, `${s} s`) : tr(`${Math.round(s / 60)} mnt`, `${Math.round(s / 60)} min`))
const matches = (e: AiEvent, q: string) => !q || [e.id, e.judul, e.kamera, e.zona.label, e.perangkat, e.uplink].some((x) => x.toLowerCase().includes(q))

function exportCsv(rows: AiEvent[]) {
  const at = new Date()
  downloadCsv(
    `indikasi-${at.toLocaleDateString("sv-SE")}.csv`,
    ["ID", tr("Terdeteksi", "Detected"), tr("Diterima", "Received"), tr("Jeda sinkron (detik)", "Sync lag (seconds)"), tr("Kategori", "Category"), tr("Detektor", "Detector"), tr("Zona", "Zone"), tr("Kamera", "Camera"), "Tier", tr("Perangkat", "Device"), "Uplink", "Shift", "Severity", tr("Skor detektor", "Detector score"), tr("Progres review", "Review progress"), tr("Hasil review", "Review outcome"), tr("Simulasi", "Simulated"), tr("Diekspor", "Exported")],
    rows.map((e) => [
      e.id,
      e.waktu.toLocaleString("sv-SE"),
      e.diterima.toLocaleString("sv-SE"),
      String(e.syncLagDetik),
      kategoriDef(e.kategori).label,
      e.detektor,
      e.zona.label,
      e.kamera,
      tierLabel[e.tier],
      e.perangkat,
      e.uplink,
      shiftLabel(e.shift),
      severityMeta[e.severity].label,
      e.confidence.toFixed(2),
      workflowMeta[e.workflow].label,
      findingOf(e) ? outcomeMeta[findingOf(e)!.outcome].label : "",
      tr("ya", "yes"),
      at.toLocaleString("sv-SE"),
    ]),
  )
}

function IndikasiContent() {
  const { filters, key } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const version = useWorkflowVersion()
  const now = useNow(60_000)
  const tab: Tab = tabs.find((t) => t.id === params.get("status"))?.id ?? "menunggu"
  const search = params.get("q") ?? ""
  const query = useWidgetData(() => getIndications(filters), key, REFRESH_MS, version)
  const [openId, setOpenId] = useState(params.get("id") ?? undefined)
  const [isOpen, setIsOpen] = useState(!!params.get("id"))

  const all = query.data
  const counts = Object.fromEntries(tabs.map((t) => [t.id, all?.filter((e) => t.match(e, now)).length ?? 0])) as Record<Tab, number>
  const current = tabs.find((t) => t.id === tab)!
  const rows = all?.filter((e) => current.match(e, now) && matches(e, search.trim().toLowerCase()))

  const columns: Column<AiEvent>[] = [
    { id: "id", label: "ID", render: (e) => <span className="whitespace-nowrap text-muted tabular-nums">{e.id}</span>, compare: (a, b) => a.id.localeCompare(b.id) },
    { id: "waktu", label: tr("Terdeteksi", "Detected"), render: (e) => <span className="whitespace-nowrap">{shortTime(e.waktu)}</span>, compare: (a, b) => a.waktu.getTime() - b.waktu.getTime() },
    {
      id: "judul",
      label: tr("Indikasi", "Indication"),
      isRowHeader: true,
      render: (e) => (
        <>
          <p>{e.judul}</p>
          <p className="text-sm text-muted">
            {e.zona.label} · {e.kamera}
          </p>
        </>
      ),
    },
    {
      id: "sumber",
      label: tr("Asal", "Origin"),
      render: (e) => (
        <>
          <p className="whitespace-nowrap">{e.perangkat || tierLabel[e.tier]}</p>
          <p className="text-sm whitespace-nowrap text-muted">
            {e.uplink || tr("Jaringan site", "Site network")} · {lagText(e.syncLagDetik)}
          </p>
        </>
      ),
      compare: (a, b) => a.syncLagDetik - b.syncLagDetik,
    },
    { id: "severity", label: "Severity", render: (e) => <SeverityChip severity={e.severity} />, compare: (a, b) => severityMeta[b.severity].rank - severityMeta[a.severity].rank },
    { id: "skor", label: tr("Skor", "Score"), render: (e) => <span className="tabular-nums">{e.confidence.toFixed(2)}</span>, compare: (a, b) => a.confidence - b.confidence },
    {
      id: "progres",
      label: tr("Progres review", "Review progress"),
      render: (e) => (
        <span className="flex flex-col items-start gap-1">
          <WorkflowChip value={e.workflow} />
          {pendingReview.includes(e.workflow) && <span className={breached(e, now) ? "text-xs text-danger" : "text-xs text-muted"}>{duration(now - e.waktu.getTime())}</span>}
        </span>
      ),
    },
    { id: "hasil", label: tr("Hasil", "Outcome"), render: (e) => (findingOf(e) ? <OutcomeChip value={findingOf(e)!.outcome} /> : <span className="text-muted">—</span>) },
  ]

  return (
    <>
      <Widget
        title={tr("Register indikasi AI", "AI indication register")}
        description={tr("Setiap baris membawa asal deteksi (perangkat, uplink) dan jeda sinkronnya. Hasil review disimpan terpisah dari progres review.", "Each row carries where it was detected (device, uplink) and its sync lag. The review outcome is stored apart from review progress.")}
        action={
          <Button size="sm" variant="secondary" isDisabled={!rows?.length} onPress={() => rows && exportCsv(rows)}>
            <Download aria-hidden />
            Export CSV
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Tabs className="max-w-full min-w-0" selectedKey={tab} onSelectionChange={(t) => setParams({ status: t === "menunggu" ? null : String(t) })}>
              <Tabs.ListContainer>
                <Tabs.List aria-label={tr("Status review", "Review status")}>
                  {tabs.map((t) => (
                    <Tabs.Tab key={t.id} id={t.id} className="whitespace-nowrap">
                      {t.label} ({counts[t.id]})
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
            <SearchField className="w-full sm:w-72" value={search} onChange={(q) => setParams({ q: q || null })}>
              <Label className="sr-only">{tr("Cari indikasi", "Search indications")}</Label>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={tr("Cari ID, kamera, zona, perangkat", "Search ID, camera, zone, device")} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
          <WidgetBody
            query={{ ...query, data: rows }}
            skeleton={
              <div className="flex flex-col gap-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            }
            isEmpty={() => (all?.length ?? 0) === 0}
            empty={tr("Tidak ada indikasi untuk filter ini.", "No indications for these filters.")}
          >
            {(list) => (
              <RegisterTable
                label={tr("Register indikasi AI", "AI indication register")}
                rows={list}
                columns={columns}
                rowId={(e) => e.id}
                rowText={(e) => e.judul}
                defaultSort={{ column: tab === "menunggu" || tab === "sla" ? "severity" : "waktu", direction: "descending" }}
                dependencies={[now, version]}
                selectable={(e) => e.workflow === "new"}
                bulk={(picked, clear) => (
                  <Button size="sm" onPress={() => runWorkflow(() => acknowledge(picked.map((e) => e.id)), tr(`${picked.length} indikasi di-acknowledge.`, `${picked.length} indications acknowledged.`)).then((r) => r && clear())}>
                    {tr(`Acknowledge ${picked.length}`, `Acknowledge ${picked.length}`)}
                  </Button>
                )}
                onOpen={(id) => {
                  setOpenId(id)
                  setIsOpen(true)
                  setParams({ id })
                }}
              />
            )}
          </WidgetBody>
        </div>
      </Widget>
      <IndikasiDrawer
        filters={filters}
        id={openId}
        isOpen={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open)
          if (!open) setParams({ id: null })
        }}
      />
    </>
  )
}

export function IndikasiPage() {
  const { key } = useFilters()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["periode", "site", "zona", "shift", "kategori", "severity"]} />
      </div>
      <IndikasiContent key={key} />
    </div>
  )
}
