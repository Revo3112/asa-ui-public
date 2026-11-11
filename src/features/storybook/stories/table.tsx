// #region import
import { useState } from "react"
import { Label, SearchField, Skeleton } from "@heroui/react"

import { EventDrawer } from "@/features/events/components/event-drawer"
import { EventTable } from "@/features/events/components/event-table"
import { useFilters } from "@/shared/components/filter-bar"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import type { EventStatus } from "@/shared/config/events"
import { getEventList, updateEvents, type HseEvent } from "@/features/events/data/events"
import { useNow } from "@/shared/lib/time"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./table.tsx?raw"

// #region table
function EventList() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getEventList(filters), key)
  const now = useNow(60_000)
  const [search, setSearch] = useState("")
  const [changed, setChanged] = useState<Record<string, HseEvent>>({})
  const [openId, setOpenId] = useState<string>()
  const [isOpen, setIsOpen] = useState(false)

  const q = search.trim().toLowerCase()
  const all = query.data?.map((e) => changed[e.id] ?? e)
  const rows = all?.filter((e) => !q || [e.id, e.judul, e.sumber, e.zona.label].some((field) => field.toLowerCase().includes(q)))

  const update = async (ids: string[], status: EventStatus, catatan?: string) => {
    const updated = await updateEvents(filters, ids, status, catatan)
    setChanged((c) => ({ ...c, ...Object.fromEntries(updated.map((e) => [e.id, e])) }))
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchField className="w-full sm:w-72" value={search} onChange={setSearch}>
        <Label className="sr-only">Cari event</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Cari ID, kejadian, sumber, zona" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <WidgetBody
        query={{ ...query, data: rows }}
        skeleton={<Skeleton className="h-96 rounded-lg" />}
        isEmpty={() => !all?.length}
        empty="Tidak ada event untuk filter ini."
      >
        {(list) => (
          <EventTable
            rows={list}
            now={now}
            canEdit
            onOpen={(id) => {
              setOpenId(id)
              setIsOpen(true)
            }}
            onUpdate={(ids, status) => update(ids, status)}
          />
        )}
      </WidgetBody>
      <EventDrawer event={all?.find((e) => e.id === openId)} isOpen={isOpen} onOpenChange={setIsOpen} onUpdate={update} />
    </div>
  )
}
// #endregion

export function TableStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Tabel event dengan urut per kolom, halaman 15 baris, pilih banyak untuk Acknowledge atau Close sekaligus, dan baris yang bisa dibuka. Pencarian ada di luar tabel supaya halaman bisa menyimpannya di URL.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="Cari, urut, halaman"
        description="Klik judul kolom ID, Waktu, Severity, atau Status untuk mengurutkan. Ketik di kotak cari untuk menyaring. Pilih baris untuk membuka drawer detail."
        code={snippet(source, "table")}
      >
        <EventList />
      </Example>
      <Props
        title="Props EventTable"
        rows={[
          ["rows", "HseEvent[]", "Baris yang sudah disaring. Tabel mengurutkan dan membagi halaman sendiri."],
          ["now", "number", "Waktu sekarang untuk kolom Umur. Pakai useNow supaya ikut berjalan."],
          ["canEdit", "boolean", "Tampilkan kotak pilih dan tombol aksi massal. False untuk Viewer."],
          ["onOpen", "(id: string) => void", "Dipanggil saat baris dipilih."],
          ["onUpdate", "(ids, status) => Promise<void>", "Menyimpan perubahan status. Tombol aksi menunggu sampai selesai."],
        ]}
      />
      <Section title="Catatan">
        <p className="max-w-prose">
          Baris berstatus Closed tidak bisa dipilih. Halaman kembali ke 1 setiap kali <Code>rows</Code> berganti, misalnya saat kata kunci cari berubah.
        </p>
      </Section>
    </>
  )
}
