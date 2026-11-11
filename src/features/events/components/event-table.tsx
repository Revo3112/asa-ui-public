import { useState } from "react"
import { Button, Checkbox, Chip, EmptyState, Pagination, Table, type Selection, type SortDescriptor } from "@heroui/react"

import { SeverityChip } from "@/shared/components/severity-chip"
import { eventStatus, eventTypes, severityMeta, type EventStatus } from "@/shared/config/events"
import { ageLabel, type HseEvent } from "@/features/events/data/events"
import { duration } from "@/shared/lib/time"
import { locale, tr } from "@/shared/lib/i18n"

const PAGE_SIZE = 15
const shortTime = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const statusOrder: Record<EventStatus, number> = { open: 0, acknowledged: 1, closed: 2 }

const compare: Record<string, (a: HseEvent, b: HseEvent) => number> = {
  id: (a, b) => a.id.localeCompare(b.id),
  waktu: (a, b) => a.waktu.getTime() - b.waktu.getTime(),
  severity: (a, b) => severityMeta[b.severity].rank - severityMeta[a.severity].rank,
  status: (a, b) => statusOrder[a.status] - statusOrder[b.status],
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

function SortableColumn({ id, label, isRowHeader = false }: { id: string; label: string; isRowHeader?: boolean }) {
  return (
    <Table.Column id={id} allowsSorting isRowHeader={isRowHeader}>
      {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>{label}</Table.SortableColumnHeader>}
    </Table.Column>
  )
}

type EventTableProps = {
  rows: HseEvent[]
  now: number
  canEdit: boolean
  onOpen: (id: string) => void
  onUpdate: (ids: string[], status: EventStatus) => Promise<void>
}

export function EventTable({ rows, now, canEdit, onOpen, onUpdate }: EventTableProps) {
  const [sort, setSort] = useState<SortDescriptor>({ column: "waktu", direction: "descending" })
  // Back to page 1 when the rows change underneath, e.g. a new tab or search.
  const rowsKey = `${rows.length}|${rows[0]?.id}`
  const [paging, setPaging] = useState({ key: rowsKey, page: 1 })
  const [selected, setSelected] = useState<Selection>(new Set())
  const [pending, setPending] = useState<EventStatus | null>(null)

  const sorted = [...rows].sort((a, b) => (compare[String(sort.column)]?.(a, b) ?? 0) * (sort.direction === "descending" ? -1 : 1))
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(paging.key === rowsKey ? paging.page : 1, pages)
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const picked = (selected === "all" ? pageRows : rows.filter((e) => selected.has(e.id))).filter((e) => e.status !== "closed")
  const toAck = picked.filter((e) => e.status === "open").map((e) => e.id)
  const toClose = picked.filter((e) => e.status === "acknowledged").map((e) => e.id)

  const run = async (ids: string[], status: EventStatus) => {
    setPending(status)
    try {
      await onUpdate(ids, status)
      setSelected(new Set())
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tr("Aksi untuk event terpilih", "Actions for selected events")}>
          <span className="text-sm text-muted">{tr(`${picked.length} dipilih`, `${picked.length} selected`)}</span>
          {toAck.length > 0 && (
            <Button size="sm" isPending={pending === "acknowledged"} isDisabled={!!pending} onPress={() => run(toAck, "acknowledged")}>
              Acknowledge {toAck.length}
            </Button>
          )}
          {toClose.length > 0 && (
            <Button size="sm" variant="secondary" isPending={pending === "closed"} isDisabled={!!pending} onPress={() => run(toClose, "closed")}>
              Close {toClose.length}
            </Button>
          )}
        </div>
      )}

      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label={tr("Daftar event", "Event list")}
            className="min-w-[60rem]"
            sortDescriptor={sort}
            onSortChange={setSort}
            selectionMode={canEdit ? "multiple" : "none"}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            disabledKeys={pageRows.filter((e) => e.status === "closed").map((e) => e.id)}
            disabledBehavior="selection"
            onRowAction={(id) => onOpen(String(id))}
          >
            <Table.Header>
              {canEdit && (
                <Table.Column className="pe-0">
                  <SelectionBox label={tr("Pilih semua event yang belum closed di halaman ini", "Select every event on this page that is not closed")} />
                </Table.Column>
              )}
              <SortableColumn id="id" label="ID" />
              <SortableColumn id="waktu" label={tr("Waktu", "Time")} />
              <Table.Column>{tr("Tipe", "Type")}</Table.Column>
              <Table.Column isRowHeader>{tr("Kejadian", "Event")}</Table.Column>
              <Table.Column>{tr("Zona", "Zone")}</Table.Column>
              <SortableColumn id="severity" label="Severity" />
              <SortableColumn id="status" label="Status" />
              <Table.Column>{tr("Umur", "Age")}</Table.Column>
            </Table.Header>
            <Table.Body
              items={pageRows}
              dependencies={[now]}
              renderEmptyState={() => (
                <EmptyState>
                  <p>{tr("Tidak ada event untuk pilihan ini.", "No events for this selection.")}</p>
                </EmptyState>
              )}
            >
              {(e) => (
                <Table.Row id={e.id} textValue={e.judul}>
                  {canEdit && (
                    <Table.Cell className="pe-0">
                      <SelectionBox label={`Pilih ${e.id}`} />
                    </Table.Cell>
                  )}
                  <Table.Cell className="text-muted tabular-nums">{e.id}</Table.Cell>
                  <Table.Cell className="whitespace-nowrap">{shortTime(e.waktu)}</Table.Cell>
                  <Table.Cell>{eventTypes[e.tipe]}</Table.Cell>
                  <Table.Cell>
                    <p>{e.judul}</p>
                    <p className="text-sm text-muted">{e.sumber}</p>
                  </Table.Cell>
                  <Table.Cell>{e.zona.label}</Table.Cell>
                  <Table.Cell>
                    <SeverityChip severity={e.severity} />
                  </Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" color={eventStatus[e.status].color}>
                      {eventStatus[e.status].label}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell className="text-muted">{ageLabel(e, now, duration)}</Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {pages > 1 && (
          <Table.Footer>
            <Pagination size="sm">
              <Pagination.Summary>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} {tr("dari", "of")} {sorted.length}
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous isDisabled={page === 1} onPress={() => setPaging({ key: rowsKey, page: page - 1 })}>
                    <Pagination.PreviousIcon />
                    {tr("Sebelumnya", "Previous")}
                  </Pagination.Previous>
                </Pagination.Item>
                <Pagination.Item>
                  <Pagination.Next isDisabled={page === pages} onPress={() => setPaging({ key: rowsKey, page: page + 1 })}>
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
  )
}
