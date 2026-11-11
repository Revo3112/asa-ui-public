// #region import
import { Chip } from "@heroui/react"

import { statusMeta } from "@/features/environment/components/sensor-panels"
import { SeverityChip } from "@/shared/components/severity-chip"
import { eventStatus, severityMeta, type Severity } from "@/shared/config/events"
// #endregion
import { Code, CodeBlock, Example, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./badge.tsx?raw"

// #region severity
function Severities() {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(severityMeta) as Severity[]).map((s) => (
        <SeverityChip key={s} severity={s} />
      ))}
    </div>
  )
}
// #endregion

// #region status
function Statuses() {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.values(eventStatus).map((s) => (
        <Chip key={s.label} size="sm" color={s.color}>
          {s.label}
        </Chip>
      ))}
    </div>
  )
}
// #endregion

// #region sensor
function SensorStatuses() {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.values(statusMeta).map((s) => (
        <Chip key={s.label} size="sm" color={s.color}>
          {s.label}
        </Chip>
      ))}
    </div>
  )
}
// #endregion

export function BadgeStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Badge memakai Chip HeroUI. Label dan warnanya tidak ditulis di komponen, tapi dibaca dari config, jadi tabel, feed, drawer, dan tile kamera selalu sepakat soal arti merah dan kuning.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example title="Severity" description="Kritis, tinggi, sedang, rendah dari severityMeta. Kritis berwarna solid supaya beda dari Tinggi." code={snippet(source, "severity")}>
        <Severities />
      </Example>
      <Example title="Status event" description="Alur Open, Acknowledged, Closed dari eventStatus." code={snippet(source, "status")}>
        <Statuses />
      </Example>
      <Example title="Status sensor" description="Aman, waspada, bahaya, dan tidak ada data dari statusMeta." code={snippet(source, "sensor")}>
        <SensorStatuses />
      </Example>
      <Section title="Mengubah label atau warna">
        <p className="max-w-prose">
          Edit <Code>src/shared/config/events.ts</Code> untuk severity dan status event. Warna yang tersedia adalah warna Chip HeroUI: <Code>danger</Code>, <Code>warning</Code>, <Code>success</Code>,{" "}
          <Code>accent</Code>, <Code>default</Code>.
        </p>
      </Section>
    </>
  )
}
