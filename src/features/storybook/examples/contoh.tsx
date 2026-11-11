// #region import
import { HardHat } from "lucide-react"

import { KpiCard } from "@/shared/components/kpi-card"
// #endregion
import { CodeBlock, Example, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./contoh.tsx?raw"

// #region dasar
function Dasar() {
  return <KpiCard icon={HardHat} label="Contoh" value="1" />
}
// #endregion

export function ContohStory() {
  return (
    <>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example title="Dasar" code={snippet(source, "dasar")}>
        <Dasar />
      </Example>
    </>
  )
}
