// #region import
import { useState } from "react"
import { Label, Slider } from "@heroui/react"

import { SensorGauge } from "@/features/environment/components/sensor-gauge"
import { sensorTypes } from "@/shared/config/lingkungan"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./gauge.tsx?raw"

// #region states
function GaugeStates() {
  const [suhu, bising, , co, oksigen] = sensorTypes
  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
      <SensorGauge type={suhu} value={30.4} />
      <SensorGauge type={bising} value={88} />
      <SensorGauge type={oksigen} value={17.6} />
      <SensorGauge type={co} />
    </div>
  )
}
// #endregion

// #region live
function LiveGauge() {
  const type = sensorTypes[0]
  const [value, setValue] = useState(type.normal)
  return (
    <div className="mx-auto flex max-w-xs flex-col gap-4">
      <SensorGauge type={type} value={value} />
      <Slider value={value} onChange={(v) => setValue(v as number)} minValue={24} maxValue={40} step={0.1}>
        <Label>Geser nilai suhu</Label>
        <Slider.Output />
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
    </div>
  )
}
// #endregion

export function GaugeStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Satu nilai sensor di atas pita aman, waspada, dan bahaya dari threshold-nya. Pita dibalik untuk sensor yang bahaya saat nilainya turun, seperti oksigen.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="Status"
        description="Aman, waspada, bahaya (oksigen, arah bawah), dan sensor tanpa data. Nilainya contoh props, bukan bacaan sensor."
        code={snippet(source, "states")}
      >
        <GaugeStates />
      </Example>
      <Example title="Nilai berubah" description="Jarum bergerak dengan pegas saat nilai baru masuk. Geser slider untuk melihat status berganti di 32 dan 35 °C." code={snippet(source, "live")}>
        <LiveGauge />
      </Example>
      <Props
        title="Props SensorGauge"
        rows={[
          ["type", "SensorType", "Jenis sensor dari config/lingkungan: label, satuan, desimal, nilai normal, threshold bawaan."],
          ["value?", "number", "Bacaan terakhir. Kosong: jarum hilang dan status Tidak ada data."],
          ["threshold?", "Threshold", "Batas waspada dan bahaya site ini. Bawaan: threshold milik type."],
          ["className?", "string", "Kelas tambahan, biasanya lebar."],
        ]}
      />
      <Section title="Catatan">
        <p className="max-w-prose">
          Skala dial dihitung dari nilai normal dan kedua batas, ditambah ruang setengah rentang di kiri dan kanan. Untuk dial lain, susun sendiri dari primitif di <Code>src/shared/charts/gauge</Code>.
        </p>
      </Section>
    </>
  )
}
