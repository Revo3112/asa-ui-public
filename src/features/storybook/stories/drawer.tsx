// #region import
import { useState } from "react"
import { Button, Skeleton } from "@heroui/react"

import { EventDrawer } from "@/features/events/components/event-drawer"
import { useFilters } from "@/shared/components/filter-bar"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import { eventTypes, type EventStatus } from "@/shared/config/events"
import { getEventList, updateEvents, type HseEvent } from "@/features/events/data/events"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./drawer.tsx?raw"

// #region drawer
function DrawerByType() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getEventList(filters), key)
  const [changed, setChanged] = useState<Record<string, HseEvent>>({})
  const [openId, setOpenId] = useState<string>()
  const [isOpen, setIsOpen] = useState(false)

  const events = query.data?.map((e) => changed[e.id] ?? e)
  // The newest event of each type, so every shape of the drawer is one click away.
  const samples = events && (["ppe", "lingkungan", "kamera"] as const).flatMap((tipe) => events.find((e) => e.tipe === tipe) ?? [])

  const update = async (ids: string[], status: EventStatus, catatan?: string) => {
    const updated = await updateEvents(filters, ids, status, catatan)
    setChanged((c) => ({ ...c, ...Object.fromEntries(updated.map((e) => [e.id, e])) }))
  }

  return (
    <WidgetBody query={{ ...query, data: samples }} skeleton={<Skeleton className="h-9 w-80 rounded-lg" />} isEmpty={(list) => list.length === 0} empty="Tidak ada event untuk filter ini.">
      {(list) => (
        <div className="flex flex-wrap gap-2">
          {list.map((e) => (
            <Button
              key={e.id}
              variant="secondary"
              onPress={() => {
                setOpenId(e.id)
                setIsOpen(true)
              }}
            >
              Buka event {eventTypes[e.tipe]}
            </Button>
          ))}
          <EventDrawer event={events?.find((e) => e.id === openId)} isOpen={isOpen} onOpenChange={setIsOpen} onUpdate={update} linkToEventPage />
        </div>
      )}
    </WidgetBody>
  )
}
// #endregion

export function DrawerStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Satu drawer kanan untuk semua tipe event. Isinya menyesuaikan tipe: foto bukti untuk PPE, grafik sensor 30 menit untuk lingkungan, tautan ke Monitor CCTV untuk kamera offline. Di bawahnya status,
        riwayat, catatan, dan tombol langkah berikutnya.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="Per tipe event"
        description="Buka tiap tipe; Escape menutup drawer. Catatan dan tombol Acknowledge atau Close hanya muncul kalau Anda sudah masuk dengan peran selain Viewer."
        code={snippet(source, "drawer")}
      >
        <DrawerByType />
      </Example>
      <Props
        title="Props EventDrawer"
        rows={[
          ["event?", "HseEvent", "Event yang ditampilkan. Tetap kirim event terakhir setelah ditutup supaya isinya tidak hilang saat drawer bergeser keluar."],
          ["isOpen", "boolean", "Drawer terbuka atau tidak."],
          ["onOpenChange", "(isOpen: boolean) => void", "Dipanggil saat ditutup lewat tombol, backdrop, atau Escape."],
          ["onUpdate", "(ids, status, catatan?) => Promise<void>", "Menyimpan langkah status beserta catatan."],
          ["linkToEventPage?", "boolean", "Tambah tombol Buka di Event & laporan, untuk drawer yang dibuka di luar halaman itu."],
        ]}
      />
      <Section title="Catatan">
        <p className="max-w-prose">
          Tombol langkah hanya muncul untuk peran yang boleh menangani event; Viewer hanya membaca. Aturannya di <Code>canHandleEvents</Code> pada <Code>src/shared/auth/session.ts</Code>.
        </p>
      </Section>
    </>
  )
}
