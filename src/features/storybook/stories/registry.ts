import type { JSX } from "react"

import { BadgeStory } from "@/features/storybook/stories/badge"
import { CameraStory } from "@/features/storybook/stories/camera"
import { ChartsStory } from "@/features/storybook/stories/charts"
import { DrawerStory } from "@/features/storybook/stories/drawer"
import { EventFeedStory } from "@/features/storybook/stories/event-feed"
import { EvidenceStory } from "@/features/storybook/stories/evidence"
import { ExportStory } from "@/features/storybook/stories/export"
import { FilterBarStory } from "@/features/storybook/stories/filter-bar"
import { GaugeStory } from "@/features/storybook/stories/gauge"
import { KpiCardStory } from "@/features/storybook/stories/kpi-card"
import { StatesStory } from "@/features/storybook/stories/states"
import { TableStory } from "@/features/storybook/stories/table"
import { WorkflowStory } from "@/features/storybook/stories/workflow"

export type Story = {
  /** The page lives at /storybook/<slug>. */
  slug: string
  label: string
  /** Sidebar category; stories with the same group sit together, in this list's order. */
  group: string
  /** Where the component lives, shown under the page title. */
  source: string
  Component: () => JSX.Element
}

export const stories: Story[] = [
  { slug: "kpi-card", label: "Kartu KPI", group: "Ringkasan", source: "src/shared/components/kpi-card.tsx", Component: KpiCardStory },
  { slug: "grafik", label: "Grafik", group: "Ringkasan", source: "src/features/overview/components/overview-charts.tsx", Component: ChartsStory },
  { slug: "gauge-sensor", label: "Gauge sensor", group: "Ringkasan", source: "src/features/environment/components/sensor-gauge.tsx", Component: GaugeStory },
  { slug: "feed-event", label: "Feed event", group: "Event & bukti", source: "src/features/events/components/event-feed.tsx", Component: EventFeedStory },
  { slug: "tabel", label: "Tabel", group: "Event & bukti", source: "src/features/events/components/event-table.tsx", Component: TableStory },
  { slug: "foto-bukti", label: "Viewer foto bukti", group: "Event & bukti", source: "src/features/events/components/event-drawer.tsx", Component: EvidenceStory },
  { slug: "drawer-detail", label: "Drawer detail", group: "Event & bukti", source: "src/features/events/components/event-drawer.tsx", Component: DrawerStory },
  { slug: "badge", label: "Badge status & severity", group: "Event & bukti", source: "src/shared/config/events.ts", Component: BadgeStory },
  { slug: "alur-review", label: "Status & form alur review", group: "Alur review", source: "src/shared/components/status-chip.tsx", Component: WorkflowStory },
  { slug: "kamera", label: "Tile & grid kamera", group: "Kamera", source: "src/features/cctv/components/camera-tile.tsx", Component: CameraStory },
  { slug: "filter-bar", label: "Filter bar", group: "Kontrol", source: "src/shared/components/filter-bar.tsx", Component: FilterBarStory },
  { slug: "export", label: "Tombol export", group: "Kontrol", source: "src/shared/lib/csv.ts", Component: ExportStory },
  { slug: "state", label: "State kosong, loading, error", group: "Kontrol", source: "src/shared/components/widget.tsx", Component: StatesStory },
]

export const groups = [...new Set(stories.map((s) => s.group))]
