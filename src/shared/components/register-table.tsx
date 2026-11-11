import { useState, type ReactNode } from "react"
import { Checkbox, EmptyState, Pagination, Table, type Selection, type SortDescriptor } from "@heroui/react"
import { tr } from "@/shared/lib/i18n"

export type Column<T> = {
  id: string
  label: string
  render: (row: T) => ReactNode
  /** Makes the column sortable. */
  compare?: (a: T, b: T) => number
  isRowHeader?: boolean
  className?: string
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

type Props<T> = {
  label: string
  rows: T[]
  columns: Column<T>[]
  rowId: (row: T) => string
  rowText: (row: T) => string
  onOpen: (id: string) => void
  defaultSort: SortDescriptor
  /** Rows that can be picked for a bulk action; without it there is no selection. */
  selectable?: (row: T) => boolean
  /** The bulk action bar, given the picked rows and a reset. */
  bulk?: (picked: T[], clear: () => void) => ReactNode
  empty?: string
  minWidth?: string
  pageSize?: number
  /** Re-renders rows that show relative times. */
  dependencies?: unknown[]
}

/**
 * The registers' table: sortable columns, paging, optional multi-select for a bulk action, and a
 * row press that opens the detail drawer. Same look and behaviour as the event table.
 */
export function RegisterTable<T>({ label, rows, columns, rowId, rowText, onOpen, defaultSort, selectable, bulk, empty = tr("Tidak ada data untuk pilihan ini.", "No data for this selection."), minWidth = "min-w-[60rem]", pageSize = 15, dependencies = [] }: Props<T>) {
  const [sort, setSort] = useState<SortDescriptor>(defaultSort)
  const rowsKey = `${rows.length}|${rows[0] ? rowId(rows[0]) : ""}`
  const [paging, setPaging] = useState({ key: rowsKey, page: 1 })
  const [selected, setSelected] = useState<Selection>(new Set())

  const compare = columns.find((c) => c.id === sort.column)?.compare
  const sorted = compare ? [...rows].sort((a, b) => compare(a, b) * (sort.direction === "descending" ? -1 : 1)) : rows
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(paging.key === rowsKey ? paging.page : 1, pages)
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize)
  const canSelect = !!selectable
  const picked = canSelect ? (selected === "all" ? pageRows : rows.filter((r) => selected.has(rowId(r)))).filter(selectable) : []

  return (
    <div className="flex flex-col gap-3">
      {bulk && picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tr("Aksi untuk baris terpilih", "Actions for selected rows")}>
          <span className="text-sm text-muted">{tr(`${picked.length} dipilih`, `${picked.length} selected`)}</span>
          {bulk(picked, () => setSelected(new Set()))}
        </div>
      )}
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label={label}
            className={minWidth}
            sortDescriptor={sort}
            onSortChange={setSort}
            selectionMode={canSelect ? "multiple" : "none"}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            disabledKeys={canSelect ? pageRows.filter((r) => !selectable(r)).map(rowId) : []}
            disabledBehavior="selection"
            onRowAction={(id) => onOpen(String(id))}
          >
            <Table.Header>
              {canSelect && (
                <Table.Column className="pe-0">
                  <SelectionBox label={tr("Pilih semua baris yang bisa dipilih di halaman ini", "Select every selectable row on this page")} />
                </Table.Column>
              )}
              {columns.map((c) =>
                c.compare ? (
                  <Table.Column key={c.id} id={c.id} allowsSorting isRowHeader={c.isRowHeader}>
                    {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>{c.label}</Table.SortableColumnHeader>}
                  </Table.Column>
                ) : (
                  <Table.Column key={c.id} id={c.id} isRowHeader={c.isRowHeader}>
                    {c.label}
                  </Table.Column>
                ),
              )}
            </Table.Header>
            <Table.Body
              items={pageRows.map((row) => ({ row, id: rowId(row) }))}
              dependencies={dependencies}
              renderEmptyState={() => (
                <EmptyState>
                  <p>{empty}</p>
                </EmptyState>
              )}
            >
              {({ row, id }) => (
                <Table.Row id={id} textValue={rowText(row)}>
                  {canSelect && (
                    <Table.Cell className="pe-0">
                      <SelectionBox label={`Pilih ${id}`} />
                    </Table.Cell>
                  )}
                  {columns.map((c) => (
                    <Table.Cell key={c.id} className={c.className}>
                      {c.render(row)}
                    </Table.Cell>
                  ))}
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {pages > 1 && (
          <Table.Footer>
            <Pagination size="sm">
              <Pagination.Summary>
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} {tr("dari", "of")} {sorted.length}
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
