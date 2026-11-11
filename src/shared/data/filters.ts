import { apdTypes } from "@/shared/config/apd"
import { eventTypes, severityMeta } from "@/shared/config/events"
import { kategoriDefs } from "@/shared/config/indikasi"
import { tr } from "@/shared/lib/i18n"

export type Filters = { periode: string; site: string; zona: string; shift: string; apd: string; tipe: string; severity: string; kategori: string; demo?: string }

export type Option = { id: string; label: string }

/** Fixed filter choices. Site, zona and shift come from master data, see `scope.ts`. */
export const filterOptions = {
  // Getters, so the labels follow the interface language.
  get periode(): Option[] {
    return [
      { id: "today", label: tr("Hari ini", "Today") },
      { id: "7d", label: tr("7 hari terakhir", "Last 7 days") },
      { id: "30d", label: tr("30 hari terakhir", "Last 30 days") },
    ]
  },
  get apd(): Option[] {
    return [{ id: "all", label: tr("Semua APD", "All PPE") }, ...apdTypes]
  },
  get tipe(): Option[] {
    return [{ id: "all", label: tr("Semua tipe", "All types") }, ...Object.entries(eventTypes).map(([id, label]) => ({ id, label }))]
  },
  get severity(): Option[] {
    return [{ id: "all", label: tr("Semua severity", "All severities") }, ...Object.entries(severityMeta).map(([id, s]) => ({ id, label: s.label }))]
  },
  get kategori(): Option[] {
    return [{ id: "all", label: tr("Semua kategori", "All categories") }, ...kategoriDefs.map((k) => ({ id: k.id, label: k.label }))]
  },
}

/** `site` is filled from the header's site picker; see `useFilters`. */
export const defaultFilters: Filters = { periode: "today", site: "", zona: "all", shift: "all", apd: "all", tipe: "all", severity: "all", kategori: "all" }

export const periodDays: Record<string, number> = { today: 1, "7d": 7, "30d": 30 }
