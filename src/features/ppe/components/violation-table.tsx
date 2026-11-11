import { useEffect, useState } from "react"
import { Button, Checkbox, Chip, EmptyState, Pagination, Skeleton, Table, type Selection } from "@heroui/react"
import { Download, X } from "lucide-react"

import { dayName, hourLabel, useListFilters } from "@/features/ppe/components/apd-charts"
import { EventDrawer, Evidence } from "@/features/events/components/event-drawer"
import { useFilters, useSetParams } from "@/shared/components/filter-bar"
import { useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { eventStatus } from "@/shared/config/events"
import { findViolation, getViolations, shiftLabel, subscribeViolations, violationTitle as title, type Violation, type ViolationStatus } from "@/features/ppe/data/apd"
import { toEvent, updateEvents } from "@/features/events/data/events"
import { canHandleEvents, useRole } from "@/shared/auth/session"
import { downloadCsv } from "@/shared/lib/csv"
import { locale, tr } from "@/shared/lib/i18n"

const PAGE_SIZE = 10

const shortTime = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/**
 * Violations for the active filters: the API list, rows pushed live, and status changes made here.
 * Mount its owner with the filters as `key` so a filter change starts a fresh stream.
 */
export function useViolations() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getViolations(filters), key)
  const [live, setLive] = useState<Violation[]>([])
  const [changed, setChanged] = useState<Record<string, Violation>>({})

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the owner remounts on a filter change
  useEffect(() => subscribeViolations(filters, (v) => setLive((rows) => [v, ...rows])), [])

  const update = async (ids: string[], status: ViolationStatus, catatan?: string) => {
    // Through the shared event model, so the change lands in the status history too.
    await updateEvents(filters, ids, status, catatan)
    const updated = ids.flatMap((id) => {
      const v = findViolation(filters, id)
      return v ? [v] : []
    })
    setChanged((c) => ({ ...c, ...Object.fromEntries(updated.map((v) => [v.id, v])) }))
  }

  const data = query.data && [...live, ...query.data].map((v) => changed[v.id] ?? v)
  return { query: { ...query, data }, update }
}

export type Violations = ReturnType<typeof useViolations>

function exportCsv(rows: Violation[]) {
  downloadCsv(
    `pelanggaran-apd-${new Date().toLocaleDateString("sv-SE")}.csv`,
    ["ID", tr("Waktu", "Time"), tr("Pelanggaran", "Violation"), tr("Zona", "Zone"), tr("Kamera", "Camera"), "Shift", "Status", tr("Catatan", "Note")],
    rows.map((v) => [
      v.id,
      v.waktu.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }),
      title(v),
      v.zona.label,
      v.kamera,
      shiftLabel(v.shift),
      eventStatus[v.status].label,
      v.catatan ?? "",
    ]),
  )
}

function SelectionBox({ label }: { label: string }) {
  return (
    <Checkbox aria-label={label} slot="selection">
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  )
}

export function ViolationTable({ violations, className }: { violations: Violations; className?: string }) {
  const narrow = useListFilters()
  const setParams = useSetParams()
  const canEdit = canHandleEvents(useRole())
  const listKey = `${narrow.kamera}|${narrow.hari}|${narrow.jam}`
  // Back to page 1 whenever the table-only filters change.
  const [paging, setPaging] = useState({ key: listKey, page: 1 })
  const [selected, setSelected] = useState<Selection>(new Set())
  // Kept after closing so the drawer still has content while it slides out.
  const [openId, setOpenId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const all = violations.query.data
  const rows = all?.filter(
    (v) =>
      (narrow.kamera === null || v.kamera === narrow.kamera) &&
      (narrow.hari === null || v.waktu.getDay() === narrow.hari) &&
      (narrow.jam === null || v.waktu.getHours() === narrow.jam),
  )
  const pages = Math.max(1, Math.ceil((rows?.length ?? 0) / PAGE_SIZE))
  const page = Math.min(paging.key === listKey ? paging.page : 1, pages)
  const pageRows = rows?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? []
  const openOnPage = pageRows.filter((v) => v.status === "open").map((v) => v.id)
  const selectedIds = selected === "all" ? openOnPage : [...selected].map(String).filter((id) => rows?.some((v) => v.id === id && v.status === "open"))
  const current = all?.find((v) => v.id === openId)

  const acknowledgeSelected = async () => {
    setIsPending(true)
    try {
      await violations.update(selectedIds, "acknowledged")
      setSelected(new Set())
    } finally {
      setIsPending(false)
    }
  }

  const chips = [
    narrow.kamera && { label: `Kamera ${narrow.kamera}`, clear: "kamera" },
    narrow.hari !== null && { label: dayName(narrow.hari), clear: "hari" },
    narrow.jam !== null && { label: `${hourLabel(narrow.jam)}–${hourLabel((narrow.jam + 1) % 24)}`, clear: "jam" },
  ].filter((c) => !!c)

  return (
    <Widget
      title={tr("Daftar pelanggaran", "Violation list")}
      subtitle={rows ? tr(`${rows.length} pelanggaran. Baris baru masuk langsung.`, `${rows.length} violations. New rows arrive live.`) : undefined}
      className={className}
      action={
        <Button size="sm" variant="secondary" isDisabled={!rows?.length} onPress={() => rows && exportCsv(rows)}>
          <Download aria-hidden />
          Export CSV
        </Button>
      }
    >
      <WidgetBody
        query={violations.query}
        skeleton={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={tr("Tidak ada pelanggaran untuk filter ini.", "No violations for these filters.")}
      >
        {() => (
          <div className="flex flex-col gap-3">
            {(chips.length > 0 || selectedIds.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <Button key={chip.label} size="sm" variant="tertiary" aria-label={tr(`Hapus filter ${chip.label}`, `Remove filter ${chip.label}`)} onPress={() => setParams({ [chip.clear]: null })}>
                    {chip.label}
                    <X aria-hidden />
                  </Button>
                ))}
                {selectedIds.length > 0 && (
                  <Button
                    size="sm"
                    className="ms-auto"
                    isPending={isPending}
                    onPress={acknowledgeSelected}
                  >
                    Acknowledge {selectedIds.length} pelanggaran
                  </Button>
                )}
              </div>
            )}

            <Table>
              <Table.ScrollContainer>
                <Table.Content
                  aria-label={tr("Daftar pelanggaran APD", "PPE violation list")}
                  className="min-w-[44rem]"
                  selectionMode={canEdit ? "multiple" : "none"}
                  selectedKeys={selected}
                  onSelectionChange={setSelected}
                  disabledKeys={pageRows.filter((v) => v.status !== "open").map((v) => v.id)}
                  disabledBehavior="selection"
                  onRowAction={(id) => {
                    setOpenId(String(id))
                    setIsOpen(true)
                  }}
                >
                  <Table.Header>
                    {canEdit && (
                      <Table.Column className="pe-0">
                        <SelectionBox label={tr("Pilih semua yang open di halaman ini", "Select every open one on this page")} />
                      </Table.Column>
                    )}
                    <Table.Column isRowHeader>{tr("Pelanggaran", "Violation")}</Table.Column>
                    <Table.Column>{tr("Lokasi", "Location")}</Table.Column>
                    <Table.Column>{tr("Waktu", "Time")}</Table.Column>
                    <Table.Column>Status</Table.Column>
                  </Table.Header>
                  <Table.Body
                    items={pageRows}
                    renderEmptyState={() => (
                      <EmptyState>
                        <p>{tr("Tidak ada pelanggaran untuk pilihan ini.", "No violations for this selection.")}</p>
                      </EmptyState>
                    )}
                  >
                    {(v) => (
                      <Table.Row id={v.id} textValue={title(v)}>
                        {canEdit && (
                          <Table.Cell className="pe-0">
                            <SelectionBox label={`Pilih ${v.id}`} />
                          </Table.Cell>
                        )}
                        <Table.Cell>
                          <div className="flex items-center gap-3">
                            <Evidence src={v.bukti} alt={`Bukti ${title(v)}, ${v.kamera}`} className="size-10 shrink-0 rounded-md" />
                            <div className="min-w-0">
                              <p>{title(v)}</p>
                              <p className="text-sm text-muted">{v.id}</p>
                            </div>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <p>{v.zona.label}</p>
                          <p className="text-sm text-muted">{v.kamera}</p>
                        </Table.Cell>
                        <Table.Cell>
                          <p>{shortTime(v.waktu)}</p>
                          <p className="text-sm text-muted">{shiftLabel(v.shift)}</p>
                        </Table.Cell>
                        <Table.Cell>
                          <Chip size="sm" color={eventStatus[v.status].color}>
                            {eventStatus[v.status].label}
                          </Chip>
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
              {pages > 1 && (
                <Table.Footer>
                  <Pagination size="sm">
                    <Pagination.Summary>
                      {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows?.length ?? 0)} {tr("dari", "of")} {rows?.length}
                    </Pagination.Summary>
                    <Pagination.Content>
                      <Pagination.Item>
                        <Pagination.Previous isDisabled={page === 1} onPress={() => setPaging({ key: listKey, page: page - 1 })}>
                          <Pagination.PreviousIcon />
                          {tr("Sebelumnya", "Previous")}
                        </Pagination.Previous>
                      </Pagination.Item>
                      <Pagination.Item>
                        <Pagination.Next isDisabled={page === pages} onPress={() => setPaging({ key: listKey, page: page + 1 })}>
                          {tr("Berikutnya", "Next")}
                          <Pagination.NextIcon />
                        </Pagination.Next>
                      </Pagination.Item>
                    </Pagination.Content>
                  </Pagination>
                </Table.Footer>
              )}
            </Table>
          </div>
        )}
      </WidgetBody>

      <EventDrawer event={current && toEvent(current)} isOpen={isOpen} onOpenChange={setIsOpen} onUpdate={violations.update} linkToEventPage />
    </Widget>
  )
}
