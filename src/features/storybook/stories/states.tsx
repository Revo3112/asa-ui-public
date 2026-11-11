// #region import
import { useState } from "react"
import { Skeleton, ToggleButton, ToggleButtonGroup } from "@heroui/react"

import { useFilters, useSetParams } from "@/shared/components/filter-bar"
import { TrendWidget } from "@/features/overview/components/overview-charts"
import { Widget, WidgetBody, type WidgetQuery } from "@/shared/components/widget"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./states.tsx?raw"

const states = [
  { id: "data", label: "Ada data" },
  { id: "loading", label: "Memuat" },
  { id: "empty", label: "Kosong" },
  { id: "error", label: "Error" },
]

function StatePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <ToggleButtonGroup aria-label="State" size="sm" selectionMode="single" disallowEmptySelection selectedKeys={[value]} onSelectionChange={(keys) => onChange(String([...keys][0]))}>
      {states.map((s, i) => (
        <ToggleButton key={s.id} id={s.id}>
          {i > 0 && <ToggleButtonGroup.Separator />}
          {s.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

// #region body
function ZoneList() {
  const [state, setState] = useState("data")
  // Stands in for useWidgetData; "Coba lagi" on the error goes back to data.
  const query: WidgetQuery<string[]> =
    state === "error"
      ? { error: new Error("Server tidak merespons. Coba beberapa saat lagi."), isLoading: false, retry: () => setState("data") }
      : { data: state === "loading" ? undefined : state === "empty" ? [] : ["Gudang A", "Area produksi", "Workshop"], isLoading: state === "loading", retry: () => {} }
  return (
    <Widget title="Zona site ini" action={<StatePicker value={state} onChange={setState} />} className="max-w-xl">
      <WidgetBody query={query} skeleton={<Skeleton className="h-24 rounded-lg" />} isEmpty={(list) => list.length === 0} empty="Belum ada zona. Tambahkan di Master data, Zona.">
        {(list) => (
          <ul className="flex flex-col gap-1">
            {list.map((zona) => (
              <li key={zona}>{zona}</li>
            ))}
          </ul>
        )}
      </WidgetBody>
    </Widget>
  )
}
// #endregion

// #region demo
function DemoParam() {
  const { filters, key } = useFilters()
  const setParams = useSetParams()
  return (
    <div className="flex flex-col gap-3">
      <StatePicker value={filters.demo ?? "data"} onChange={(id) => setParams({ demo: id === "data" ? null : id })} />
      <TrendWidget key={key} />
    </div>
  )
}
// #endregion

export function StatesStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Setiap widget data punya tiga state selain data: skeleton saat memuat, pesan kosong yang bilang kenapa kosong, dan error dengan tombol Coba lagi. WidgetBody memilih yang tepat, jadi satu widget
        gagal tidak menjatuhkan seluruh halaman.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="WidgetBody"
        description="Pilih state di pojok kartu. Di aplikasi, query datang dari useWidgetData; di sini dibuat manual supaya tiap state bisa dilihat."
        code={snippet(source, "body")}
      >
        <ZoneList />
      </Example>
      <Example
        title="Di widget sungguhan"
        description="Parameter ?demo=loading|empty|error di URL memaksa semua data dummy ke state itu, di halaman mana pun. Pilihan di bawah menulis parameter itu."
        code={snippet(source, "demo")}
      >
        <DemoParam />
      </Example>
      <Props
        title="Props WidgetBody"
        rows={[
          ["query", "WidgetQuery<T>", "Hasil useWidgetData: data, error, isLoading, retry."],
          ["skeleton", "ReactNode", "Bentuk kasar isi widget selama memuat."],
          ["isEmpty", "(data: T) => boolean", "Kapan data dianggap kosong."],
          ["empty", "string", "Pesan kosong. Sebutkan sebabnya dan langkah berikutnya bila ada."],
          ["children", "(data: T) => ReactNode", "Isi widget saat data ada."],
        ]}
      />
      <Section title="Catatan">
        <p className="max-w-prose">
          Tabel punya state kosongnya sendiri lewat <Code>renderEmptyState</Code>, untuk kasus data ada tapi semua tersaring oleh pencarian.
        </p>
      </Section>
    </>
  )
}
