// #region import
import { Cctv, HardHat, ShieldAlert } from "lucide-react"

import { KpiCard, KpiGrid } from "@/shared/components/kpi-card"
// #endregion
import { CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./kpi-card.tsx?raw"

// #region tone
function KpiTones() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <KpiCard icon={HardHat} label="Kepatuhan APD" value="94,2%" note="tone default" />
      <KpiCard icon={ShieldAlert} label="Event open" value="5" tone="warning" note="tone warning" />
      <KpiCard icon={Cctv} label="Kamera online" value="14/16" tone="danger" note="tone danger" />
    </div>
  )
}
// #endregion

// #region grid
function KpiRow() {
  return (
    <KpiGrid>
      {["Satu", "Dua", "Tiga", "Empat", "Lima"].map((label, i) => (
        <KpiCard key={label} icon={HardHat} label={label} value={String(i + 1)} />
      ))}
    </KpiGrid>
  )
}
// #endregion

export function KpiCardStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Ikon, label, nilai, dan satu catatan. Nilai berwarna hanya untuk status waspada atau bahaya yang nyata, jadi mata langsung jatuh ke angka yang perlu ditindak.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example title="Tone" description="Tiga tone: default, warning, danger. Angkanya contoh props, bukan data site mana pun." code={snippet(source, "tone")}>
        <KpiTones />
      </Example>
      <Example
        title="KpiGrid"
        description="Satu baris di desktop. Di HP dan tablet jadi slider: geser atau ketuk titik di bawah, kartu berikutnya mengintip di tepi."
        code={snippet(source, "grid")}
      >
        <KpiRow />
      </Example>
      <Props
        title="Props KpiCard"
        rows={[
          ["icon", "LucideIcon", "Ikon di samping label."],
          ["label", "string", "Nama metrik."],
          ["value", "ReactNode", "Nilai yang ditampilkan besar."],
          ["note?", "string", "Satu baris konteks: target, pembanding, atau item yang terdampak."],
          ["tone?", '"default" | "warning" | "danger"', "Warnai nilai hanya saat statusnya memang waspada atau bahaya."],
          ["className?", "string", "Kelas tambahan untuk Card."],
        ]}
      />
    </>
  )
}
