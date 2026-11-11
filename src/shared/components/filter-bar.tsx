import { Button, Label, ListBox, Popover, Select } from "@heroui/react"
import { SlidersHorizontal } from "lucide-react"
import { useLocation, useSearchParams } from "react-router"

import type { EventType } from "@/shared/config/events"
import { eventTypeOn } from "@/shared/config/modules"
import { useMaster } from "@/shared/data/master"
import { defaultFilters, filterOptions, type Filters, type Option } from "@/shared/data/filters"
import { shiftOptions, siteOptions, zoneOptions } from "@/shared/data/scope"
import { activeSite, useSession } from "@/shared/auth/session"
import { useSettings } from "@/shared/data/settings"
import { cn } from "@/shared/lib/utils"
import { tr } from "@/shared/lib/i18n"

export type FilterKey = keyof Omit<Filters, "demo">

// Site comes before zona: the zona choices depend on the site.
const fields: { key: FilterKey; label: string }[] = [
  { key: "periode", get label() { return tr("Tanggal", "Date") } },
  { key: "site", label: "Site" },
  { key: "zona", get label() { return tr("Zona", "Zone") } },
  { key: "shift", label: "Shift" },
  { key: "apd", get label() { return tr("Jenis APD", "PPE type") } },
  { key: "tipe", get label() { return tr("Tipe event", "Event type") } },
  { key: "severity", label: "Severity" },
  { key: "kategori", get label() { return tr("Kategori", "Category") } },
]

const baseFields: FilterKey[] = ["periode", "site", "zona", "shift"]
// Literal class names so Tailwind generates them.
const columns: Record<number, string> = { 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }

/** The choices for one filter. Site, zona and shift come from master data; zona follows the picked site. */
export function choicesOf(key: FilterKey, f: Filters): Option[] {
  if (key === "site") return siteOptions()
  if (key === "zona") return zoneOptions(f.site)
  if (key === "shift") return shiftOptions()
  if (key === "tipe") return filterOptions.tipe.filter((o) => o.id === "all" || eventTypeOn(o.id as EventType))
  return filterOptions[key]
}

/**
 * Pages whose filters start somewhere else than the app-wide default. The decision page looks at a
 * week by default, because one morning rarely holds enough confirmed findings to show a pattern.
 */
const pageDefaults: Record<string, Partial<Filters>> = {
  "/keputusan": { periode: "7d" },
  "/analisis": { periode: "7d" },
  "/rekomendasi": { periode: "7d" },
  "/asisten": { periode: "7d" },
  // Review quality and trends need enough completed reviews to mean anything.
  "/kualitas": { periode: "30d" },
}

/** The defaults right now: the site is whatever the header picker says, plus the page's own. */
const defaultsNow = (path?: string): Filters => ({ ...defaultFilters, site: activeSite(), ...(path ? pageDefaults[path] : {}) })

/**
 * Filters live in the URL, so a drill-down link or a shared link opens with them already set.
 * The site starts from the header picker and can be changed here without touching the header.
 * `key` changes only when a filter changes, not when a table-only param like `kamera` does.
 */
export function useFilters() {
  // Reads the master and session stores during render, which the React Compiler would cache once.
  "use no memo"
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  useMaster()
  useSession()
  useSettings()
  const filters: Filters = { ...defaultsNow(pathname), demo: params.get("demo") ?? undefined }
  for (const { key } of fields) {
    const value = params.get(key)
    if (value && choicesOf(key, filters).some((o) => o.id === value)) filters[key] = value
  }
  return { filters, key: `${filters.site}|${drillQuery(filters, {})}|${filters.demo ?? ""}` }
}

/**
 * Query string for a drill-down link: the current filters plus the ones the click adds. Compared
 * against the app-wide defaults, not this page's, so the link keeps a page default (the decision
 * page's week) when it lands on a page that starts from today.
 */
export function drillQuery(filters: Filters, extra: Partial<Filters>) {
  const merged: Filters = { ...filters, ...extra }
  const defaults = defaultsNow()
  const params = new URLSearchParams()
  for (const { key } of fields) if (merged[key] !== defaults[key]) params.set(key, merged[key])
  return params.toString()
}

/** Sets URL params in place. `null` or a filter's default value removes the param. */
export function useSetParams() {
  const [, setParams] = useSearchParams()
  const { pathname } = useLocation()
  return (values: Record<string, string | null>) =>
    setParams(
      (params) => {
        const defaults = defaultsNow(pathname)
        for (const [key, value] of Object.entries(values)) {
          if (value === null || value === defaults[key as keyof Filters]) params.delete(key)
          else params.set(key, value)
        }
        return params
      },
      { replace: true },
    )
}

/** One filter as a Select that writes to the URL. */
export function FilterSelect({ field }: { field: FilterKey }) {
  const { filters } = useFilters()
  const setParams = useSetParams()
  const label = fields.find((f) => f.key === field)?.label
  const choices = choicesOf(field, filters)

  return (
    <Select
      value={filters[field]}
      // A new site keeps the zone only if that site has it too.
      onChange={(value) => value && setParams(field === "site" ? { site: String(value), zona: null } : { [field]: String(value) })}
      isDisabled={choices.length < 2}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {choices.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

/**
 * Date, site, zone and shift, plus the page's own filters. Shared by every page, so they filter the
 * same way. `base` replaces the first four for a page whose period is fixed, e.g. a weekly view.
 */
export function FilterBar({ extra = [], base = baseFields }: { extra?: FilterKey[]; base?: FilterKey[] }) {
  const keys = [...base, ...extra]
  return (
    <div role="group" aria-label={tr("Filter data", "Filter data")} className={cn("grid grid-cols-2 gap-3", keys.length % 2 ? "[&>:last-child]:col-span-2 lg:[&>:last-child]:col-span-1" : "", columns[keys.length])}>
      {keys.map((key) => (
        <FilterSelect key={key} field={key} />
      ))}
    </div>
  )
}

/**
 * The filters as one small button that says what is picked ("30 days · All zones · All shifts"),
 * opening the dropdowns in a popover. For pages that must fit one screen.
 */
export function FilterButton({ fields: keys }: { fields: FilterKey[] }) {
  const { filters } = useFilters()
  const summary = keys.map((k) => choicesOf(k, filters).find((o) => o.id === filters[k])?.label ?? filters[k]).join(" · ")
  return (
    <Popover>
      <Button size="sm" variant="secondary" aria-label={tr(`Filter: ${summary}`, `Filters: ${summary}`)}>
        <SlidersHorizontal aria-hidden />
        <span className="max-w-[60vw] truncate">{summary}</span>
      </Button>
      <Popover.Content placement="bottom start" className="w-72">
        <Popover.Dialog className="flex flex-col gap-3 p-3">
          {keys.map((k) => (
            <FilterSelect key={k} field={k} />
          ))}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
