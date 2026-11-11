// #region import
import { useState } from "react"
import { Button } from "@heroui/react"
import { Download, FileText } from "lucide-react"

import { useFilters } from "@/shared/components/filter-bar"
import { SummaryReport } from "@/features/events/components/summary-report"
import { useWidgetData } from "@/shared/components/widget"
import { getEventList, type HseEvent } from "@/features/events/data/events"
import { downloadCsv } from "@/shared/lib/csv"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./export.tsx?raw"

// #region csv
function exportCsv(rows: HseEvent[]) {
  downloadCsv(
    `event-${new Date().toLocaleDateString("sv-SE")}.csv`,
    ["ID", "Waktu", "Kejadian", "Zona"],
    rows.map((e) => [e.id, e.waktu.toLocaleString("sv-SE"), e.judul, e.zona.label]),
  )
}

function CsvButton() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getEventList(filters), key)
  return (
    <Button size="sm" variant="secondary" isDisabled={!query.data?.length} onPress={() => query.data && exportCsv(query.data)}>
      <Download aria-hidden />
      Export CSV
    </Button>
  )
}
// #endregion

// #region pdf
function PdfButton() {
  const { filters } = useFilters()
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onPress={() => setIsOpen(true)}>
        <FileText aria-hidden />
        Ringkasan PDF
      </Button>
      <SummaryReport isOpen={isOpen} onOpenChange={setIsOpen} filters={filters} />
    </>
  )
}
// #endregion

export function ExportStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Dua jalur export: CSV untuk diolah di Excel, dan ringkasan PDF satu halaman A4 untuk manajemen. Keduanya dibuat di browser, jadi tetap jalan di jaringan tertutup.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="Export CSV"
        description="Tombol nonaktif selama data dimuat atau saat kosong. File memakai titik koma dan BOM supaya Excel berbahasa Indonesia langsung membaca kolom dengan benar."
        code={snippet(source, "csv")}
      >
        <CsvButton />
      </Example>
      <Example title="Ringkasan PDF" description="Membuka pratinjau dulu. PDF baru diunduh setelah pratinjau siap." code={snippet(source, "pdf")}>
        <PdfButton />
      </Example>
      <Props
        title="downloadCsv"
        rows={[
          ["filename", "string", "Nama file yang diunduh."],
          ["header", "string[]", "Judul kolom."],
          ["rows", "string[][]", "Isi per baris, urutannya sama dengan header."],
        ]}
      />
      <Section title="Catatan">
        <p className="max-w-prose">
          Untuk puluhan ribu baris dari API sungguhan, buat file di server dan ganti <Code>onPress</Code> dengan tautan unduh. Batasannya dicatat di <Code>src/shared/lib/csv.ts</Code>.
        </p>
      </Section>
    </>
  )
}
