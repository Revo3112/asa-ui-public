import { getSummary } from "@/features/ppe/data/apd"
import { decisions, kpis, type Decision, type Kpis } from "@/features/decisions/data/keputusan"
import { mapSites, type MapSite } from "@/features/devices/data/peta"
import { type Filters, type Option, periodDays } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { placeId, placeLabel, placesIn } from "@/shared/data/scope"
import { locale } from "@/shared/lib/i18n"

export type Overview = { sites: MapSite[]; kpis: Kpis; attention: Decision[] }

/** Everything the overview shows, in one call: the map, the four numbers, and what needs attention. */
export const getOverview = (filters: Filters) =>
  respond(
    filters,
    (): Overview => ({ sites: mapSites(filters), kpis: kpis(filters), attention: decisions(filters).slice(0, 5) }),
    { sites: [], kpis: { unhandled: 0, unhandledBreached: 0, pendingReview: 0, overdue: 0, openActions: 0, gaps: 0, gapIds: [] }, attention: [] },
  )

/** Today's PPE compliance, for the overview card. */
export const getPpeToday = (filters: Filters) => getSummary({ ...filters, periode: "today" })

const scope = (filters: Filters) => [filters.site, filters.zona, filters.shift].join("|")

export type TrendPoint = { hari: string; kepatuhan: number; pelanggaran: number }

/** Always the last 7 days: this widget is the weekly trend whatever the period filter says. */
export function getTrend(filters: Filters) {
  const rand = seeded(`trend|${scope(filters)}`)
  const today = new Date()
  const points = Array.from({ length: 7 }, (_, i): TrendPoint => {
    const day = new Date(today)
    day.setDate(today.getDate() - 6 + i)
    return {
      hari: day.toLocaleDateString(locale(), { weekday: "short", day: "numeric" }),
      kepatuhan: Math.round((90 + rand() * 8) * 10) / 10,
      pelanggaran: Math.round(10 + rand() * 20),
    }
  })
  return respond(filters, () => points, [] as TrendPoint[])
}

export type ZoneRisk = Option & { pelanggaran: number }

export function getRiskyZones(filters: Filters) {
  const rand = seeded(`zones|${filters.periode}|${scope(filters)}`)
  const days = periodDays[filters.periode] ?? 1
  const rows = placesIn(filters)
    .map((p): ZoneRisk => ({ id: placeId(filters, p.site, p.zona), label: placeLabel(filters, p.site, p.zona), pelanggaran: Math.round((2 + rand() * 9) * days) }))
    .sort((a, b) => b.pelanggaran - a.pelanggaran)
  return respond(filters, () => rows, [] as ZoneRisk[])
}
