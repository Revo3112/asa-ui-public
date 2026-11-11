import { useEffect, useState } from "react"
import { Alert, Button, Label, SearchField, Skeleton, Tabs } from "@heroui/react"
import { Download, FileText } from "lucide-react"
import { useSearchParams } from "react-router"

import { EventDrawer } from "@/features/events/components/event-drawer"
import { EventTable } from "@/features/events/components/event-table"
import { FilterButton, useFilters, useSetParams } from "@/shared/components/filter-bar"
import { SummaryReport } from "@/features/events/components/summary-report"
import { useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { eventStatus, eventTypes, severityMeta, type EventStatus } from "@/shared/config/events"
import { shiftLabel } from "@/features/ppe/data/apd"
import { ageLabel, findEvent, getEventList, subscribeEvents, updateEvents, type HseEvent } from "@/features/events/data/events"
import { canHandleEvents, useRole } from "@/shared/auth/session"
import { downloadCsv } from "@/shared/lib/csv"
import { duration, useNow } from "@/shared/lib/time"
import { tr } from "@/shared/lib/i18n"

const tabs = ["open", "acknowledged", "closed", "semua"] as const
type Tab = (typeof tabs)[number]

const matches = (e: HseEvent, q: string) => !q || [e.id, e.judul, e.sumber, e.zona.label].some((field) => field.toLowerCase().includes(q))

function exportCsv(rows: HseEvent[], now: number) {
  downloadCsv(
    `event-${new Date().toLocaleDateString("sv-SE")}.csv`,
    ["ID", tr("Waktu", "Time"), tr("Tipe", "Type"), tr("Kejadian", "Event"), tr("Sumber", "Source"), tr("Zona", "Zone"), "Shift", "Severity", "Status", tr("Umur", "Age"), tr("Catatan", "Note"), tr("Bukti", "Evidence")],
    rows.map((e) => [
      e.id,
      e.waktu.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }),
      eventTypes[e.tipe],
      e.judul,
      e.sumber,
      e.zona.label,
      shiftLabel(e.shift),
      severityMeta[e.severity].label,
      eventStatus[e.status].label,
      ageLabel(e, now, duration),
      e.catatan ?? "",
      e.bukti ?? "",
    ]),
  )
}

function EventContent() {
  const { filters, key } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const canEdit = canHandleEvents(useRole())
  const now = useNow(60_000)
  const tab: Tab = tabs.find((t) => t === params.get("status")) ?? "open"
  const search = params.get("q") ?? ""

  const query = useWidgetData(() => getEventList(filters), key)
  // New events wait in `incoming` until the officer asks for them, so rows don't shift while they read.
  const [incoming, setIncoming] = useState<HseEvent[]>([])
  const [shownNew, setShownNew] = useState<HseEvent[]>([])
  const [changed, setChanged] = useState<Record<string, HseEvent>>({})
  // A link like /event?id=… opens that event straight away.
  const [openId, setOpenId] = useState(params.get("id"))
  const [isOpen, setIsOpen] = useState(!!params.get("id"))
  const [isReportOpen, setIsReportOpen] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the parent remounts this on a filter change
  useEffect(() => subscribeEvents(filters, (e) => setIncoming((list) => [e, ...list])), [])

  const all = query.data && [...shownNew, ...query.data].map((e) => changed[e.id] ?? e)
  const counts = Object.fromEntries(
    tabs.map((t) => [t, [...(all ?? []), ...incoming].filter((e) => t === "semua" || e.status === t).length]),
  ) as Record<Tab, number>
  const rows = all?.filter((e) => (tab === "semua" || e.status === tab) && matches(e, search.trim().toLowerCase()))
  const current = openId ? (changed[openId] ?? all?.find((e) => e.id === openId) ?? findEvent(filters, openId)) : undefined

  const update = async (ids: string[], status: EventStatus, catatan?: string) => {
    const updated = await updateEvents(filters, ids, status, catatan)
    setChanged((c) => ({ ...c, ...Object.fromEntries(updated.map((e) => [e.id, e])) }))
  }

  return (
    <>
      <Widget
        title={tr("Daftar event", "Event list")}
        description={tr("Event dari PPE, kamera, lingkungan, dan ERT. Pilih baris untuk detail.", "Events from PPE, cameras, environment and ERT. Pick a row for detail.")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" isDisabled={!rows?.length} onPress={() => rows && exportCsv(rows, now)}>
              <Download aria-hidden />
              Export CSV
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setIsReportOpen(true)}>
              <FileText aria-hidden />
              {tr("Ringkasan PDF", "PDF summary")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Tabs className="max-w-full min-w-0" selectedKey={tab} onSelectionChange={(t) => setParams({ status: t === "open" ? null : String(t) })}>
              <Tabs.ListContainer>
                <Tabs.List aria-label={tr("Status event", "Event status")}>
                  {tabs.map((t) => (
                    <Tabs.Tab key={t} id={t} className="whitespace-nowrap">
                      {t === "semua" ? tr("Semua", "All") : eventStatus[t].label} ({counts[t]})
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
            <SearchField className="w-full sm:w-72" value={search} onChange={(q) => setParams({ q: q || null })}>
              <Label className="sr-only">{tr("Cari event", "Search events")}</Label>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={tr("Cari ID, kejadian, sumber, zona", "Search ID, event, source, zone")} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>

          <div aria-live="polite">
            {incoming.length > 0 && (
              <Alert status="accent">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{tr(`${incoming.length} event baru masuk`, `${incoming.length} new events arrived`)}</Alert.Title>
                  <Alert.Description>{tr("Tabel tidak bergeser sampai Anda menampilkannya.", "The table won't shift until you show them.")}</Alert.Description>
                </Alert.Content>
                <Button
                  size="sm"
                  onPress={() => {
                    setShownNew((list) => [...incoming, ...list])
                    setIncoming([])
                  }}
                >
                  {tr("Tampilkan", "Show")}
                </Button>
              </Alert>
            )}
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
            empty={tr("Tidak ada event untuk filter ini.", "No events for these filters.")}
          >
            {(list) => (
              <EventTable
                rows={list}
                now={now}
                canEdit={canEdit}
                onOpen={(id) => {
                  setOpenId(id)
                  setIsOpen(true)
                  setParams({ id })
                }}
                onUpdate={(ids, status) => update(ids, status)}
              />
            )}
          </WidgetBody>
        </div>
      </Widget>

      <EventDrawer
        event={current}
        isOpen={isOpen && !!current}
        onOpenChange={(open) => {
          setIsOpen(open)
          if (!open) setParams({ id: null })
        }}
        onUpdate={update}
      />
      <SummaryReport isOpen={isReportOpen} onOpenChange={setIsReportOpen} filters={filters} />
    </>
  )
}

export function EventPage() {
  const { key } = useFilters()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["periode", "site", "zona", "shift", "tipe", "severity"]} />
      </div>
      <EventContent key={key} />
    </div>
  )
}
