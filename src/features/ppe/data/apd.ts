/**
 * Dummy data for the APD page. Every getter aggregates the same list of
 * violations per site, so the cards, charts and table always agree.
 * Each getter stands in for one API call; `?demo=` works as on Overview.
 */

import { apdTypes } from "@/shared/config/apd"
import ppe1Evidence from "@/features/ppe/assets/ppe1.webp"
import { severityMeta, type EventStatus, type Severity } from "@/shared/config/events"
import { topicOn } from "@/shared/config/modules"
import { camerasAt, currentProfil, master, shiftOf, siteById, zonaById, zonesOfSite } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { inPlace, placed, placeId, placeLabel, placesIn, shiftOptions, sitesIn } from "@/shared/data/scope"
import { userSites } from "@/shared/auth/session"
import { cameraEmits } from "@/shared/data/skenario"
import { ticker } from "@/shared/lib/ticker"
import { getLang, locale, tr } from "@/shared/lib/i18n"
import { periodStart } from "@/shared/lib/periods"

export { shiftLabel } from "@/shared/data/master"

export type ViolationStatus = EventStatus

/** The person's box in the evidence frame, in percent of the image, so it stays in place at any size. */
export type Box = { x: number; y: number; w: number; h: number }

export type Violation = {
  id: string
  /** APD ids from `apdTypes`. A person missing two items is one violation with two labels. */
  apd: string[]
  site: string
  zona: Option
  kamera: string
  shift: string
  waktu: Date
  status: ViolationStatus
  catatan?: string
  /** URL of the evidence frame. Empty in the dummy data, so the UI shows its placeholder. */
  bukti?: string
  box: Box
}

/** "Tanpa helm dan rompi" / "No helmet and vest" */
export const violationTitle = (v: Violation) =>
  `${tr("Tanpa", "No")} ${new Intl.ListFormat(getLang(), { type: "conjunction" }).format(v.apd.map((id) => (apdTypes.find((t) => t.id === id)?.label ?? id).toLowerCase()))}`

const rank = (s: Severity) => severityMeta[s].rank

/** The most severe of the missing items, from the APD config. */
export const severityOf = (v: Violation) => v.apd.map((id) => apdTypes.find((t) => t.id === id)?.severity ?? "rendah").sort((a, b) => rank(a) - rank(b))[0]

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Violations peak around the shift changes at 06, 14 and 22, and drop at night. */
const hourWeight = Array.from({ length: 24 }, (_, h) => {
  const fromChange = Math.min(...[6, 14, 22].map((s) => Math.abs(h - s)))
  return fromChange === 0 ? 5 : fromChange === 1 ? 2.5 : h < 5 ? 0.5 : 1
})
/** The loading dock (factory) and Loading Point 02 (mine) are the worst. A zone added later weighs 1. */
const zoneWeight: Record<string, number> = {
  produksi: 1,
  gudang: 0.6,
  workshop: 1.3,
  loading: 2,
  utilitas: 0.5,
  "loading-02": 2.2,
  "pit-timur": 1.4,
  "jalan-stockpile": 1.1,
  "hr-03": 1.1,
  crusher: 1.3,
  conveyor: 1.2,
  "akses-kantor": 0.4,
  "patroli-peledakan": 0.6,
}
/** People detected per zone per day at each site. Compliance is counted per person, not per frame. */
const peoplePerDay: Record<string, number> = {
  produksi: 120,
  gudang: 90,
  workshop: 110,
  loading: 100,
  utilitas: 80,
  "jalan-stockpile": 60,
  "hr-03": 60,
  crusher: 110,
  conveyor: 70,
  "akses-cpp": 90,
  "zona-terbatas-tangki": 25,
  "loading-02": 90,
  bbm: 50,
  "akses-kantor": 140,
  "hutan-penyangga": 15,
  "pit-timur": 60,
  "patroli-peledakan": 20,
}
const peopleAt = (zona: string) => peoplePerDay[zona] ?? 80

/** The site's zones that have a camera: PPE is only detected where one is watching. */
const watched = (site: string) => zonesOfSite(site).flatMap((z) => (camerasAt(site, z.id).length ? [z.id] : []))
const apdWeight = apdTypes.map((_, i) => [0.35, 0.25, 0.2, 0.12, 0.08][i] ?? 0.1)

function pick(rand: () => number, weights: number[]) {
  let r = rand() * weights.reduce((a, b) => a + b, 0)
  const i = weights.findIndex((w) => (r -= w) < 0)
  return i < 0 ? weights.length - 1 : i
}

function makeViolation(rand: () => number, t: number, id: string, site: string): Violation | null {
  // Only cameras that were watching then: a pole before it was deployed, or one left idle, sees nothing.
  const zonesHere = watched(site).filter((z) => camerasAt(site, z).some((k) => cameraEmits(k, t)))
  if (!zonesHere.length) return null
  const zona =
    zonesHere[
      pick(
        rand,
        zonesHere.map((z) => zoneWeight[z] ?? 1),
      )
    ]
  const cams = camerasAt(site, zona).filter((k) => cameraEmits(k, t))
  const first = pick(rand, apdWeight)
  const apd = [apdTypes[first].id]
  const second = pick(rand, apdWeight)
  if (rand() < 0.15 && second !== first) apd.push(apdTypes[second].id)

  const age = Date.now() - t
  const r = rand()
  const status: ViolationStatus =
    age < 4 * HOUR
      ? r < 0.7
        ? "open"
        : "acknowledged"
      : age < DAY
        ? r < 0.3
          ? "open"
          : r < 0.7
            ? "acknowledged"
            : "closed"
        : // A small backlog up to a week old; anything older has been handled.
          age < 7 * DAY && r < 0.02
          ? "acknowledged"
          : "closed"

  const w = 15 + rand() * 15
  const h = 45 + rand() * 20
  const waktu = new Date(t)
  return {
    id,
    apd,
    site,
    zona: { id: zona, label: zonaById(zona)?.nama ?? zona },
    kamera: cams[Math.floor(rand() * cams.length)].id,
    shift: shiftOf(waktu, site),
    waktu,
    status,
    bukti: apd.includes("helm") ? ppe1Evidence : undefined,
    box: { x: 5 + rand() * (90 - w), y: 5 + rand() * (90 - h), w, h },
  }
}

const store = new Map<string, Violation[]>()
let liveId = 9000

/** 60 days per site, newest first: enough for a 30-day period and the one before it. */
function violationsOf(site: string) {
  let rows = store.get(site)
  if (rows) return rows
  const rand = seeded(`apd|${site}`)
  const prefix = `APD-${siteById(site)?.kode ?? site}-`
  const now = Date.now()
  rows = []
  for (let d = 59; d >= 0; d--) {
    const day = new Date(now)
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - d)
    const weekend = day.getDay() === 0 || day.getDay() === 6
    // A mine has far fewer people in camera view than a factory floor.
    const base = currentProfil() === "tambang" ? 8 : 30
    const count = Math.round(base * (weekend ? 0.6 : 1) * (0.8 + rand() * 0.4))
    for (let i = 0; i < count; i++) {
      const t = day.getTime() + pick(rand, hourWeight) * HOUR + rand() * HOUR
      const v = t <= now && makeViolation(rand, t, `${prefix}${String(rows.length + 1).padStart(4, "0")}`, site)
      if (v) rows.push(v)
    }
  }
  rows.sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
  store.set(site, rows)
  return rows
}

const keeps = (f: Filters, anyApd = false) => {
  const here = inPlace(f)
  return (v: Violation) => here(v.site, v.zona.id) && (f.shift === "all" || v.shift === f.shift) && (anyApd || f.apd === "all" || v.apd.includes(f.apd))
}

const newestFirst = (a: Violation, b: Violation) => b.waktu.getTime() - a.waktu.getTime()

/** Violations in the period (or the same-length period before it) that match the filters. */
function inPeriod(f: Filters, { previous = false, anyApd = false } = {}) {
  const now = Date.now()
  const start = periodStart(f.periode, now)
  const [from, to] = previous ? [start - (now - start), start] : [start, Infinity]
  const keep = keeps(f, anyApd)
  const sites = sitesIn(f)
  const rows = sites.flatMap(violationsOf).filter((v) => v.waktu.getTime() >= from && v.waktu.getTime() < to && keep(v))
  return sites.length > 1 ? rows.sort(newestFirst) : rows
}

/** People detected in the period, at one place or across the places and shift the filters keep. */
function people(f: Filters, place?: { site: string; zona: string }) {
  const now = Date.now()
  const hours = (now - periodStart(f.periode, now)) / HOUR
  const places = place ? [place] : placesIn(f).filter((p) => watched(p.site).includes(p.zona))
  const perDay = places.reduce((sum, p) => sum + peopleAt(p.zona), 0)
  return (perDay * hours) / 24 / (f.shift === "all" ? 1 : Math.max(1, shiftOptions().length - 1))
}

/**
 * ponytail: the people count is an estimate from hours elapsed, so just after midnight it is tiny
 * while the live stream keeps adding a violation every 20 seconds, and compliance fell to 0%. Every
 * violation is someone the camera saw, so the mock assumes at least 12 people seen per violation
 * (compliance never below ~92%). The real API counts people tracked by the detector.
 */
const seen = (violations: number, estimate: number) => Math.max(estimate, violations * 12)
const percent = (violations: number, estimate: number) => {
  const total = seen(violations, estimate)
  return total > 0 ? Math.round(Math.max(0, 1 - violations / total) * 1000) / 10 : 100
}

/** `orang` is how many people the cameras saw in the period; `pelanggar` how many of them lacked PPE. */
export type ApdSummary = { kepatuhan: number; sebelumnya: number; orang: number; pelanggar: number }

export function getSummary(f: Filters) {
  return respond(
    f,
    (): ApdSummary => {
      const v = inPeriod(f).length
      return { kepatuhan: percent(v, people(f)), sebelumnya: percent(inPeriod(f, { previous: true }).length, people(f)), orang: Math.round(seen(v, people(f))), pelanggar: v }
    },
    null as ApdSummary | null,
  )
}

export type ComplianceBy = "zona" | "kamera" | "shift"
export type ComplianceRow = Option & { kepatuhan: number; pelanggaran: number }

/** Compliance per zone, camera or shift, lowest first. */
export function getCompliance(f: Filters, by: ComplianceBy) {
  return respond(
    f,
    () => {
      const rows = inPeriod(f)
      const count = (match: (v: Violation) => boolean) => rows.filter(match).length
      const kept = placesIn(f).filter((p) => watched(p.site).includes(p.zona))
      const shifts = shiftOptions().filter((s) => s.id !== "all")
      const groups =
        by === "zona"
          ? kept.map((p) => ({
              id: placeId(f, p.site, p.zona),
              label: placeLabel(f, p.site, p.zona),
              total: people(f, p),
              match: (v: Violation) => v.site === p.site && v.zona.id === p.zona,
            }))
          : by === "kamera"
            ? kept.flatMap((p) => {
                const cams = camerasAt(p.site, p.zona)
                return cams.map((c) => ({
                  id: c.id,
                  label: `${c.id} · ${placeLabel(f, p.site, p.zona)}`,
                  total: people(f, p) / cams.length,
                  match: (v: Violation) => v.kamera === c.id,
                }))
              })
            : shifts
                .filter((s) => f.shift === "all" || s.id === f.shift)
                .map((s) => ({ ...s, total: people({ ...f, shift: "all" }) / shifts.length, match: (v: Violation) => v.shift === s.id }))
      return groups
        .map(({ id, label, total, match }): ComplianceRow => {
          const pelanggaran = count(match)
          return { id, label, pelanggaran, kepatuhan: percent(pelanggaran, total) }
        })
        .sort((a, b) => a.kepatuhan - b.kepatuhan)
    },
    [] as ComplianceRow[],
  )
}

export type ApdCount = { apd: string; pelanggaran: number }

/** Violations per APD type in config order. Ignores the APD filter, so the chart can show which one is picked. */
export function getApdBreakdown(f: Filters) {
  return respond(
    f,
    () => {
      const rows = inPeriod(f, { anyApd: true })
      return apdTypes.map((t): ApdCount => ({ apd: t.id, pelanggaran: rows.filter((v) => v.apd.includes(t.id)).length }))
    },
    [] as ApdCount[],
  )
}

/** Counts indexed `[weekday][hour]`, with weekday as in `Date.getDay()` (0 is Sunday). */
export function getHeatmap(f: Filters) {
  return respond(
    f,
    () => {
      const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
      for (const v of inPeriod(f)) grid[v.waktu.getDay()][v.waktu.getHours()]++
      return grid
    },
    [] as number[][],
  )
}

/** PPE violations in the period, any APD type, as the store holds them. The unified event list builds on this. */
export const ppeInPeriod = (f: Filters) => inPeriod({ ...f, apd: "all" })

/** Looks a violation up on any site, labelled for the view. */
export function findViolation(f: Pick<Filters, "site">, id: string) {
  for (const s of master().site) {
    const v = violationsOf(s.id).find((x) => x.id === id)
    if (v) return placed(f)(v)
  }
  return undefined
}

/** The latest violations caught by one camera, whatever the period. */
export function getCameraViolations(f: Filters, kamera: string, limit = 8) {
  const site = master().kamera.find((c) => c.id === kamera)?.site ?? ""
  return respond(
    f,
    () =>
      violationsOf(site)
        .filter((v) => v.kamera === kamera)
        .slice(0, limit)
        .map(placed(f)),
    [] as Violation[],
  )
}

export function getViolations(f: Filters) {
  return respond(f, () => inPeriod(f).map(placed(f)), [] as Violation[])
}

/** Every stored violation of a site, newest first. The review workflow wraps each one as an AI indication. */
export const ppeRecords = (site: string) => violationsOf(site)

type StatusListener = (v: Violation, status: ViolationStatus, catatan?: string) => void
const statusListeners = new Set<StatusListener>()

/**
 * Called after the simple flow (Acknowledge → Close) changes a violation, so the review workflow
 * can follow. The workflow itself writes `status` directly and doesn't come through here.
 */
export function onViolationStatus(listener: StatusListener) {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

/** Changes the status of the given violations, on whichever site they are. */
export function updateViolations(ids: string[], status: ViolationStatus, catatan?: string) {
  const wanted = new Set(ids)
  return new Promise<Violation[]>((resolve) =>
    setTimeout(
      () =>
        resolve(
          master()
            .site.flatMap((s) => violationsOf(s.id))
            .filter((v) => wanted.has(v.id))
            .map((v) => {
              v.status = status
              if (catatan) v.catatan = catatan
              statusListeners.forEach((l) => l(v, status, catatan))
              return { ...v }
            }),
        ),
      300 + Math.random() * 300,
    ),
  )
}

/**
 * Pushes a new violation every 20 seconds and returns an unsubscribe function.
 * ponytail: timer stand-in for the WebSocket, as in `subscribeEvents`.
 */
export function subscribeViolations(f: Filters, onViolation: (v: Violation) => void) {
  if (f.demo || !topicOn("ppe.violation")) return () => {}
  const keep = keeps(f)
  return liveViolations((v) => keep(v) && onViolation(placed(f)(v)))
}

const liveRand = seeded(`apd-live|${Date.now()}`)

/** One new violation somewhere on the user's sites, shared by every subscriber. */
const liveViolations = ticker(20_000, () => {
  const sites = userSites()
  const site = sites[Math.floor(liveRand() * sites.length)]
  const v = site && makeViolation(liveRand, Date.now(), `APD-${siteById(site)?.kode ?? site}-${liveId++}`, site)
  if (!v) return null
  v.status = "open"
  violationsOf(site).unshift(v)
  return v
})

export type CompliancePoint = { hari: string; kepatuhan: number }

/**
 * Compliance per finished day over the period (at least the last 7 days), from the same counts as
 * the card. Today is left out: a few hours in, its count is too small to compare with a full day.
 */
export function getComplianceTrend(f: Filters) {
  return respond(
    f,
    () => {
      const now = Date.now()
      const days = Math.max(7, Math.round((now - periodStart(f.periode, now)) / DAY))
      const keep = keeps(f)
      const rows = sitesIn(f).flatMap(violationsOf).filter(keep)
      const perDay = people({ ...f, periode: "today" }) / Math.max(1 / 24, (now - periodStart("today", now)) / DAY)
      return Array.from({ length: days }, (_, i): CompliancePoint => {
        const day = new Date(now)
        day.setHours(0, 0, 0, 0)
        day.setDate(day.getDate() - (days - i))
        const from = day.getTime()
        const to = from + DAY
        const n = rows.filter((v) => v.waktu.getTime() >= from && v.waktu.getTime() < to).length
        return { hari: day.toLocaleDateString(locale(), { day: "numeric", month: "short" }), kepatuhan: percent(n, perDay) }
      })
    },
    [] as CompliancePoint[],
  )
}
