// #region import
import { FilterBar, FilterSelect, useFilters } from "@/shared/components/filter-bar"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./filter-bar.tsx?raw"

// #region base
function BaseFilters() {
  const { filters } = useFilters()
  return (
    <div className="flex flex-col gap-3">
      <FilterBar />
      <p className="text-sm text-muted">
        Di URL: periode={filters.periode}, site={filters.site}, zona={filters.zona}, shift={filters.shift}
      </p>
    </div>
  )
}
// #endregion

// #region extra
function PageFilters() {
  return <FilterBar extra={["apd", "severity"]} />
}
// #endregion

// #region single
function OneFilter() {
  return (
    <div className="max-w-60">
      <FilterSelect field="tipe" />
    </div>
  )
}
// #endregion

export function FilterBarStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Tanggal, site, zona, dan shift, dipakai sama di semua halaman. Nilainya disimpan di URL, jadi tautan drill-down atau tautan yang dibagikan langsung terbuka dengan filter yang sama.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="Filter dasar"
        description="Ganti salah satu pilihan, lalu lihat baris di bawahnya dan address bar ikut berubah. Pilihan zona mengikuti site yang dipilih."
        code={snippet(source, "base")}
      >
        <BaseFilters />
      </Example>
      <Example title="Dengan filter halaman" description="Halaman bisa menambah filternya sendiri lewat extra. Grid melebar sampai enam kolom di desktop." code={snippet(source, "extra")}>
        <PageFilters />
      </Example>
      <Example title="Satu filter" description="FilterSelect dipakai sendiri, misalnya di toolbar Monitor CCTV yang hanya butuh zona." code={snippet(source, "single")}>
        <OneFilter />
      </Example>
      <Props
        title="Props FilterBar"
        rows={[["extra?", "FilterKey[]", 'Filter tambahan setelah tanggal, site, zona, shift: "apd", "tipe", atau "severity".']]}
      />
      <Section title="Membaca filter">
        <p className="max-w-prose">
          Komponen data memanggil <Code>useFilters()</Code>. Hasilnya <Code>filters</Code> untuk API dan{" "}
          <Code>key</Code> yang berubah hanya saat filter berubah. Pasang <Code>key</Code> itu pada widget supaya
          widget dimuat ulang dari awal.
        </p>
      </Section>
    </>
  )
}
