import { useState } from "react"
import { Button, Label, SearchField, Skeleton, Tabs } from "@heroui/react"
import { Download } from "lucide-react"
import { useSearchParams } from "react-router"

import { FilterButton, useFilters, useSetParams } from "@/shared/components/filter-bar"
import { KasusDrawer } from "@/features/cases/components/kasus-drawer"
import { RegisterTable, type Column } from "@/shared/components/register-table"
import { SeverityChip } from "@/shared/components/severity-chip"
import { CaseStatusChip } from "@/shared/components/status-chip"
import { REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { severityMeta } from "@/shared/config/events"
import { actionDone, caseStatusMeta } from "@/shared/config/indikasi"
import { actionsOf, getCases, isOverdue, userName, type Kasus } from "@/features/cases/data/kasus"
import { downloadCsv } from "@/shared/lib/csv"
import { duration, useNow } from "@/shared/lib/time"
import { useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { locale, tr } from "@/shared/lib/i18n"

const tabs = [
  { id: "terbuka", get label() { return tr("Terbuka", "Open") }, match: (c: Kasus) => c.status !== "closed" },
  { id: "ditutup", get label() { return tr("Ditutup", "Closed") }, match: (c: Kasus) => c.status === "closed" },
  { id: "semua", get label() { return tr("Semua", "All") }, match: () => true },
] as const
type Tab = (typeof tabs)[number]["id"]

const shortDate = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const matches = (c: Kasus, q: string) => !q || [c.id, c.judul, c.zona.label, userName(c.ownerId), ...c.eventIds].some((x) => x.toLowerCase().includes(q))

function exportCsv(rows: Kasus[]) {
  const at = new Date()
  downloadCsv(
    `kasus-${at.toLocaleDateString("sv-SE")}.csv`,
    ["ID", tr("Judul", "Title"), tr("Jenis", "Type"), tr("Prioritas", "Priority"), "Status", tr("Pemilik", "Owner"), tr("Zona", "Zone"), tr("Dibuka", "Opened"), tr("Ditutup", "Closed"), tr("Indikasi", "Indications"), tr("Temuan", "Findings"), tr("Tindakan", "Actions"), tr("Simulasi", "Simulated"), tr("Diekspor", "Exported")],
    rows.map((c) => [
      c.id,
      c.judul,
      c.jenis,
      severityMeta[c.prioritas].label,
      caseStatusMeta[c.status].label,
      userName(c.ownerId),
      c.zona.label,
      c.dibuka.toLocaleString("sv-SE"),
      c.ditutup?.toLocaleString("sv-SE") ?? "",
      c.eventIds.join(", "),
      c.findingIds.join(", "),
      c.actionIds.join(", "),
      tr("ya", "yes"),
      at.toLocaleString("sv-SE"),
    ]),
  )
}

function KasusContent() {
  const { filters, key } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const version = useWorkflowVersion()
  const now = useNow(60_000)
  const tab: Tab = tabs.find((t) => t.id === params.get("status"))?.id ?? "terbuka"
  const search = params.get("q") ?? ""
  const query = useWidgetData(() => getCases(filters), key, REFRESH_MS, version)
  const [openId, setOpenId] = useState(params.get("id") ?? undefined)
  const [isOpen, setIsOpen] = useState(!!params.get("id"))

  const all = query.data
  const counts = Object.fromEntries(tabs.map((t) => [t.id, all?.filter(t.match).length ?? 0])) as Record<Tab, number>
  const rows = all?.filter((c) => tabs.find((t) => t.id === tab)!.match(c) && matches(c, search.trim().toLowerCase()))

  const columns: Column<Kasus>[] = [
    { id: "id", label: "ID", render: (c) => <span className="whitespace-nowrap text-muted tabular-nums">{c.id}</span>, compare: (a, b) => a.id.localeCompare(b.id) },
    {
      id: "judul",
      label: tr("Kasus", "Case"),
      isRowHeader: true,
      render: (c) => (
        <>
          <p>{c.judul}</p>
          <p className="text-sm text-muted">{c.jenis}</p>
        </>
      ),
    },
    { id: "prioritas", label: tr("Prioritas", "Priority"), render: (c) => <SeverityChip severity={c.prioritas} />, compare: (a, b) => severityMeta[b.prioritas].rank - severityMeta[a.prioritas].rank },
    { id: "status", label: "Status", render: (c) => <CaseStatusChip value={c.status} /> },
    { id: "pemilik", label: tr("Pemilik", "Owner"), render: (c) => userName(c.ownerId) },
    {
      id: "tindakan",
      label: tr("Tindakan", "Actions"),
      render: (c) => {
        const list = actionsOf(c.site).filter((a) => a.caseId === c.id)
        const open = list.filter((a) => !actionDone.includes(a.status))
        const late = open.filter((a) => isOverdue(a, now)).length
        return (
          <span className="whitespace-nowrap">
            {open.length}/{list.length} {tr("terbuka", "open")}
            {late > 0 && <span className="text-danger"> · {late} overdue</span>}
          </span>
        )
      },
    },
    { id: "dibuka", label: tr("Dibuka", "Opened"), render: (c) => <span className="whitespace-nowrap">{shortDate(c.dibuka)}</span>, compare: (a, b) => a.dibuka.getTime() - b.dibuka.getTime() },
    { id: "umur", label: tr("Umur", "Age"), render: (c) => <span className="text-muted">{duration((c.ditutup?.getTime() ?? now) - c.dibuka.getTime())}</span> },
  ]

  return (
    <>
      <Widget
        title={tr("Register kasus", "Case register")}
        description={tr("Kasus adalah record terpisah yang menaut satu atau lebih temuan terkonfirmasi. Temuan tidak otomatis jadi kasus; buka kasus dari detail indikasi.", "A case is a separate record linking one or more confirmed findings. A finding never becomes a case on its own; open one from the indication detail.")}
        action={
          <Button size="sm" variant="secondary" isDisabled={!rows?.length} onPress={() => rows && exportCsv(rows)}>
            <Download aria-hidden />
            Export CSV
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Tabs className="max-w-full min-w-0" selectedKey={tab} onSelectionChange={(t) => setParams({ status: t === "terbuka" ? null : String(t) })}>
              <Tabs.ListContainer>
                <Tabs.List aria-label={tr("Status kasus", "Case status")}>
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
              <Label className="sr-only">{tr("Cari kasus", "Search cases")}</Label>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={tr("Cari ID, judul, zona, pemilik", "Search ID, title, zone, owner")} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
          <WidgetBody
            query={{ ...query, data: rows }}
            skeleton={
              <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            }
            isEmpty={() => (all?.length ?? 0) === 0}
            empty={tr("Belum ada kasus untuk filter ini.", "No cases for these filters yet.")}
          >
            {(list) => (
              <RegisterTable
                label={tr("Register kasus", "Case register")}
                rows={list}
                columns={columns}
                rowId={(c) => c.id}
                rowText={(c) => c.judul}
                defaultSort={{ column: "prioritas", direction: "descending" }}
                dependencies={[now, version]}
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
      <KasusDrawer
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

export function KasusPage() {
  const { key } = useFilters()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["periode", "site", "zona", "shift", "severity"]} />
      </div>
      <KasusContent key={key} />
    </div>
  )
}
