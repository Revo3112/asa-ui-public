// #region import
import { ApdWidget, HeatmapWidget } from "@/features/ppe/components/apd-charts"
import { useFilters } from "@/shared/components/filter-bar"
import { TrendWidget, ZoneWidget } from "@/features/overview/components/overview-charts"
// #endregion
import { Code, CodeBlock, Example, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./charts.tsx?raw"

// #region line
function Trend() {
  const { key } = useFilters()
  return <TrendWidget key={key} />
}
// #endregion

// #region bar
function Zones() {
  const { key } = useFilters()
  return <ZoneWidget key={key} />
}
// #endregion

// #region donut
function ByApd() {
  const { key } = useFilters()
  return <ApdWidget key={key} className="max-w-xl" />
}
// #endregion

// #region heatmap
function ByHour() {
  const { key } = useFilters()
  return <HeatmapWidget key={key} />
}
// #endregion

export function ChartsStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Empat bentuk grafik yang dipakai dashboard, masing-masing sudah dibungkus Widget dengan judul, skeleton, kosong, dan error. Semua membaca filter dari URL, jadi tinggal dipasang di halaman.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example title="Line: tren mingguan" description="Kepatuhan atau jumlah pelanggaran tujuh hari terakhir. Tombol di pojok mengganti metrik." code={snippet(source, "line")}>
        <Trend />
      </Example>
      <Example title="Bar: zona paling rawan" description="Pelanggaran per zona sebagai baris meter, terbanyak di atas. Pilih zona untuk membuka halaman APD dengan zona itu." code={snippet(source, "bar")}>
        <Zones />
      </Example>
      <Example title="Donut: pelanggaran per jenis APD" description="Pilih potongan untuk memfilter halaman ke jenis APD itu." code={snippet(source, "donut")}>
        <ByApd />
      </Example>
      <Example title="Heatmap: jam × hari" description="Pelanggaran per jam dan hari dalam periode filter. Makin pekat merahnya makin banyak. Pilih sel untuk menyaring ke jam dan hari itu." code={snippet(source, "heatmap")}>
        <ByHour />
      </Example>
      <Section title="Membuat grafik baru">
        <p className="max-w-prose">
          Widget di atas disusun dari komponen di <Code>src/shared/charts/evilcharts/charts</Code> (line, bar, area, pie, radar, radial, composed) di atas Recharts. Warna seri diambil dari token{" "}
          <Code>--chart-1</Code> sampai <Code>--chart-5</Code>, jadi ikut tema dan branding klien.
        </p>
      </Section>
    </>
  )
}
