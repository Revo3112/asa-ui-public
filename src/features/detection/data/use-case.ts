/**
 * One AI use case on its own page (PPE, restricted zones):
 * the indications of that category only, how they compare with the previous period, where and when
 * they happen, and which cameras run the model. Everything is read from the same indications the
 * review workflow uses, so the numbers match the AI Indications page with that category filtered.
 */

import type { Severity } from "@/shared/config/events"
import { pendingReview, type Kategori } from "@/shared/config/indikasi"
import { findingOf, indicationsIn, type AiEvent } from "@/features/indications/data/indikasi"
import { master } from "@/shared/data/master"
import type { Filters } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"
import { inPlace, placed, placeId, placeLabel } from "@/shared/data/scope"
import { locale } from "@/shared/lib/i18n"
import { slaBreached } from "@/shared/lib/rules"
import { periodStart } from "@/shared/lib/periods"

export type UseCaseBucket = { label: string } & Record<Severity, number>
export type UseCaseZone = { id: string; label: string; count: number; urgent: number; href: string }
export type UseCaseCamera = { id: string; nama: string; zona: string; count: number }

export type UseCaseData = {
  rows: AiEvent[]
  previous: number
  urgent: number
  waiting: number
  slaMissed: number
  /** Confirmed over completed reviews. A review result, not detector accuracy. */
  confirmed: { n: number; of: number }
  buckets: UseCaseBucket[]
  /** "hour" for today, "day" otherwise. */
  bucket: "hour" | "day"
  zones: UseCaseZone[]
  /** Cameras that run this model in scope, busiest first. */
  cameras: UseCaseCamera[]
  /** Cameras in scope that don't run it, so a gap in coverage is visible. */
  camerasWithout: number
  peakHour?: { hour: number; count: number }
}

const DAY = 86_400_000
const empty = (label: string): UseCaseBucket => ({ label, kritis: 0, tinggi: 0, sedang: 0, rendah: 0 })

/** `kategori` can be several categories shown on one page. */
export function useCase(f: Filters, kategori: Kategori | Kategori[], now = Date.now()): UseCaseData {
  const kinds = Array.isArray(kategori) ? kategori : [kategori]
  const scope = { ...f, kategori: kinds.length === 1 ? kinds[0]! : "all", severity: "all" }
  const start = periodStart(f.periode, now)
  const all = indicationsIn(scope, { from: start - (now - start) }).filter((e) => kinds.includes(e.kategori))
  const rows = all.filter((e) => e.waktu.getTime() >= start).map(placed(f))
  const previous = all.length - rows.length

  const reviewed = rows.filter((e) => !pendingReview.includes(e.workflow) && findingOf(e))
  const waitingRows = rows.filter((e) => pendingReview.includes(e.workflow))

  // Per hour today, per day otherwise.
  const bucket = f.periode === "today" ? "hour" : "day"
  const buckets: UseCaseBucket[] = []
  if (bucket === "hour") {
    for (let h = 0; h <= new Date(now).getHours(); h++) buckets.push(empty(`${String(h).padStart(2, "0")}.00`))
    for (const e of rows) buckets[e.waktu.getHours()]![e.severity]++
  } else {
    const days = Math.max(1, Math.round((now - start) / DAY))
    const first = new Date(now - (days - 1) * DAY)
    first.setHours(0, 0, 0, 0)
    for (let d = 0; d < days; d++) buckets.push(empty(new Date(first.getTime() + d * DAY).toLocaleDateString(locale(), { day: "numeric", month: "short" })))
    for (const e of rows) {
      const i = Math.floor((e.waktu.getTime() - first.getTime()) / DAY)
      if (buckets[i]) buckets[i][e.severity]++
    }
  }

  const byZone = new Map<string, UseCaseZone>()
  for (const e of rows) {
    const key = `${e.site}/${e.zona.id}`
    const z =
      byZone.get(key) ??
      byZone
        .set(key, {
          id: key,
          label: placeLabel(f, e.site, e.zona.id),
          count: 0,
          urgent: 0,
          href: `/indikasi?${new URLSearchParams({ site: f.site, zona: placeId(f, e.site, e.zona.id), ...(kinds.length === 1 ? { kategori: kinds[0]! } : {}), periode: f.periode, status: "semua" })}`,
        })
        .get(key)!
    z.count++
    if (e.severity === "kritis" || e.severity === "tinggi") z.urgent++
  }

  const here = inPlace(f)
  const inScope = master().kamera.filter((k) => k.aktif && here(k.site, k.zona))
  const running = inScope.filter((k) => kinds.some((x) => k.fungsi?.includes(x)))
  const perCamera = new Map<string, number>()
  for (const e of rows) perCamera.set(e.kamera, (perCamera.get(e.kamera) ?? 0) + 1)

  const hours = new Array<number>(24).fill(0)
  for (const e of rows) hours[e.waktu.getHours()]!++
  const peak = Math.max(...hours)

  return {
    rows,
    previous,
    urgent: rows.filter((e) => e.severity === "kritis" || e.severity === "tinggi").length,
    waiting: waitingRows.length,
    slaMissed: waitingRows.filter((e) => slaBreached({ severity: e.severity, t: e.waktu.getTime(), ackAt: e.ackAt?.getTime() }, now)).length,
    confirmed: { n: reviewed.filter((e) => findingOf(e)!.outcome === "confirmed").length, of: reviewed.length },
    buckets,
    bucket,
    zones: [...byZone.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    cameras: running
      .map((k) => ({ id: k.id, nama: k.nama, zona: placeLabel(f, k.site, k.zona), count: perCamera.get(k.id) ?? 0 }))
      .sort((a, b) => b.count - a.count),
    camerasWithout: inScope.length - running.length,
    peakHour: peak > 0 ? { hour: hours.indexOf(peak), count: peak } : undefined,
  }
}

const none = (): UseCaseData => ({ rows: [], previous: 0, urgent: 0, waiting: 0, slaMissed: 0, confirmed: { n: 0, of: 0 }, buckets: [], bucket: "day", zones: [], cameras: [], camerasWithout: 0 })

export const getUseCase = (f: Filters, kategori: Kategori | Kategori[]) => respond(f, () => useCase(f, kategori), none())
