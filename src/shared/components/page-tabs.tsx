import type { ReactNode } from "react"
import { Tabs } from "@heroui/react"

export type PageTab = { id: string; label: string; content: ReactNode }

/** Secondary panels one at a time instead of stacked, so a page shows one thing per glance. */
export function PageTabs({ label, tabs }: { label: string; tabs: PageTab[] }) {
  return (
    <Tabs>
      <Tabs.ListContainer>
        <Tabs.List aria-label={label}>
          {tabs.map((t) => (
            <Tabs.Tab key={t.id} id={t.id} className="whitespace-nowrap">
              {t.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {tabs.map((t) => (
        <Tabs.Panel key={t.id} id={t.id} className="pt-4">
          {t.content}
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}
