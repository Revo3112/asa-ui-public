import { kategoriDefs, outcomeMeta, pendingReview, type Kategori, type Outcome } from "@/shared/config/indikasi"
import { findingOf, indicationsIn, toRule, type AiEvent } from "@/features/indications/data/indikasi"
import type { Filters } from "@/shared/data/filters"
import { master, shiftLabel } from "@/shared/data/master"
import { respond } from "@/shared/data/mock-api"
import { backlogForecast, detectorSignals, slaBreached } from "@/shared/lib/rules"
import { tr } from "@/shared/lib/i18n"

const HOUR = 60 * 60_000
const DAY = 24 * HOUR
const recent = (f: Filters, days: number) => indicationsIn({ ...f, kategori: "all" }, { from: Date.now() - days * DAY })
const completed = (f: Filters) => indicationsIn(f).filter((event) => findingOf(event))

export type OutcomeMix = { outcome: Outcome; label: string; count: number }[]

/** Completed reviews only: pending is never counted as right or wrong. */
export function outcomeMix(f: Filters): OutcomeMix {
  const rows = completed(f)
  return (Object.keys(outcomeMeta) as Outcome[]).map((outcome) => ({
    outcome,
    label: outcomeMeta[outcome].label,
    count: rows.filter((event) => findingOf(event)!.outcome === outcome).length,
  }))
}

export type BandRow = { band: string; n: number } & Record<Outcome, number>

/** Share of each outcome per detector-score band. Does the score carry information? */
export function confidenceBands(f: Filters): BandRow[] {
  const rows = completed(f)
  const bands = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
  return bands.map((low) => {
    const inBand = rows.filter((event) => event.confidence >= low && (low === 0.9 ? event.confidence <= 1 : event.confidence < low + 0.1))
    const outcomes = Object.keys(outcomeMeta) as Outcome[]
    const raw = outcomes.map((outcome) => (inBand.length ? (inBand.filter((event) => findingOf(event)!.outcome === outcome).length / inBand.length) * 100 : 0))
    const floor = raw.map(Math.floor)
    // Hand the rounding leftovers to the largest remainders, so a stacked bar is exactly 100%.
    let remaining = inBand.length ? 100 - floor.reduce((sum, value) => sum + value, 0) : 0
    raw.map((value, index) => ({ index, remainder: value - floor[index] }))
      .sort((a, b) => b.remainder - a.remainder)
      .forEach(({ index }) => remaining-- > 0 && floor[index]++)
    const share = Object.fromEntries(outcomes.map((outcome, index) => [outcome, floor[index]])) as Record<Outcome, number>
    return { band: `${low.toFixed(1)}–${(low + 0.1).toFixed(1)}`, n: inBand.length, ...share }
  })
}

export type ShiftRow = { shift: string; label: string; indications: number; confirmedRate: number; reviews: number; slaBreachRate: number }

export function shiftStats(f: Filters): ShiftRow[] {
  const now = Date.now()
  const events = indicationsIn({ ...f, shift: "all" })
  return master()
    .shift.filter((shift) => shift.aktif)
    .map((shift) => {
      const rows = events.filter((event) => event.shift === shift.id)
      const reviewed = rows.filter((event) => findingOf(event))
      return {
        shift: shift.id,
        label: shiftLabel(shift.id),
        indications: rows.length,
        reviews: reviewed.length,
        confirmedRate: reviewed.length ? reviewed.filter((event) => findingOf(event)!.outcome === "confirmed").length / reviewed.length : 0,
        slaBreachRate: rows.length ? rows.filter((event) => slaBreached({ severity: event.severity, t: event.waktu.getTime(), ackAt: event.ackAt?.getTime() }, now)).length / rows.length : 0,
      }
    })
}

type DetectorRow = ReturnType<typeof detectorSignals>[number] & { kategori?: Kategori; status?: string; href: string }

export function detectorRows(f: Filters): DetectorRow[] {
  return detectorSignals(indicationsIn(f).map(toRule)).map((detector) => {
    const category = kategoriDefs.find((item) => item.detektor === detector.detektor)
    return {
      ...detector,
      kategori: category?.id,
      status: category?.status,
      href: `/indikasi?${new URLSearchParams({ kategori: category?.id ?? "all", periode: f.periode, status: "selesai" })}`,
    }
  })
}

export type BacklogBucket = { id: string; label: string; count: number; ids: string[] }

/** Indications still waiting for an outcome, by how long they have waited. */
export function backlogAging(f: Filters) {
  const now = Date.now()
  const waiting = recent(f, 30).filter((event) => pendingReview.includes(event.workflow))
  const age = (event: AiEvent) => now - event.waktu.getTime()
  const buckets: [string, string, number, number][] = [
    ["1j", tr("< 1 jam", "< 1 hour"), 0, HOUR],
    ["4j", tr("1–4 jam", "1–4 hours"), HOUR, 4 * HOUR],
    ["24j", tr("4–24 jam", "4–24 hours"), 4 * HOUR, DAY],
    ["3h", tr("1–3 hari", "1–3 days"), DAY, 3 * DAY],
    ["lama", tr("> 3 hari", "> 3 days"), 3 * DAY, Infinity],
  ]
  const forecast = backlogForecast(recent(f, 30).map(toRule), now)
  return {
    buckets: buckets.map(([id, label, low, high]): BacklogBucket => {
      const rows = waiting.filter((event) => age(event) >= low && age(event) < high)
      return { id, label, count: rows.length, ids: rows.map((event) => event.id) }
    }),
    forecast,
  }
}

export const getOutcomeMix = (filters: Filters) => respond(filters, () => outcomeMix(filters), [] as OutcomeMix)
export const getConfidenceBands = (filters: Filters) => respond(filters, () => confidenceBands(filters), [] as BandRow[])
export const getShiftStats = (filters: Filters) => respond(filters, () => shiftStats(filters), [] as ShiftRow[])
export const getDetectorRows = (filters: Filters) => respond(filters, () => detectorRows(filters), [] as DetectorRow[])
export const getBacklogAging = (filters: Filters) => respond(filters, () => backlogAging(filters), null as ReturnType<typeof backlogAging> | null)
