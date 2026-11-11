/**
 * One event model for every page. PPE events are the APD violations themselves, camera
 * events follow the CCTV status, and environment and ERT events live here. Overview, APD,
 * CCTV and this page all read from the same records, so their numbers agree in a demo.
 */

import { severityMeta, type EventStatus, type EventType, type Severity } from "@/shared/config/events"
import { sensorTypes } from "@/shared/config/lingkungan"
import { eventTypeOn, topicOn } from "@/shared/config/modules"
import { findViolation, ppeInPeriod, severityOf, subscribeViolations, updateViolations, violationTitle, type Box, type Violation } from "@/features/ppe/data/apd"
import { offlineCameras } from "@/features/cctv/data/cctv"
import { sensorsOf, thresholdOf, type Reading } from "@/features/environment/data/lingkungan"
import { camerasAt, master, shiftOf, siteById, zonaById, zonesOfSite } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { inPlace, placed, sitesIn } from "@/shared/data/scope"
import { currentUserName, userSites } from "@/shared/auth/session"
import { ticker } from "@/shared/lib/ticker"
import { tr } from "@/shared/lib/i18n"
import { periodStart } from "@/shared/lib/periods"

export type HistoryEntry = { status: EventStatus; at: Date; by: string; catatan?: string }

export type HseEvent = {
  id: string
  tipe: EventType
  judul: string
  /** The camera, sensor or team that raised it. */
  sumber: string
  site: string
  zona: Option
  shift: string
  severity: Severity
  status: EventStatus
  waktu: Date
  /** URL of the evidence frame. Empty in the dummy data. */
  bukti?: string
  /** PPE only: the person's box in the evidence frame, in percent of the image. */
  box?: Box
  /** Lingkungan only: the sensor, what it read, and the limit it crossed. */
  sensor?: { id: string; type: string; nilai: number; batas: number }
  catatan?: string
  riwayat: HistoryEntry[]
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const officers = ["Rina Hartati", "Dimas Prakoso", "Sari Wulandari", "Yosef Manurung"]

// ---- Status history: stored once something changes, otherwise derived from the status ----

const histories = new Map<string, HistoryEntry[]>()

function historyOf(id: string, status: EventStatus, waktu: Date, catatan?: string): HistoryEntry[] {
  const stored = histories.get(id)
  if (stored) return stored
  const rand = seeded(`riwayat|${id}`)
  const now = Date.now()
  const entries: HistoryEntry[] = [{ status: "open", at: waktu, by: "Sistem" }]
  let at = waktu.getTime()
  for (const step of ["acknowledged", "closed"] as const) {
    if (status === "open" || (step === "closed" && status !== "closed")) break
    at = Math.min(now, at + (step === "acknowledged" ? 5 + rand() * 55 : 30 + rand() * 210) * MINUTE)
    entries.push({ status: step, at: new Date(at), by: officers[Math.floor(rand() * officers.length)], catatan: step === "closed" ? catatan : undefined })
  }
  return entries
}

export function toEvent(v: Violation): HseEvent {
  return {
    id: v.id,
    tipe: "ppe",
    judul: violationTitle(v),
    sumber: v.kamera,
    site: v.site,
    zona: v.zona,
    shift: v.shift,
    severity: severityOf(v),
    status: v.status,
    waktu: v.waktu,
    bukti: v.bukti,
    box: v.box,
    catatan: v.catatan,
    riwayat: historyOf(v.id, v.status, v.waktu, v.catatan),
  }
}

// ---- Environment, camera and ERT events: 60 days per site ----

const ertKinds: { judul: string; severity: Severity }[] = [
  { get judul() { return tr("Latihan evakuasi", "Evacuation drill") }, severity: "rendah" },
  { get judul() { return tr("P3K: luka ringan", "First aid: minor injury") }, severity: "sedang" },
  { get judul() { return tr("Tumpahan bahan kimia kecil", "Small chemical spill") }, severity: "kritis" },
  { get judul() { return tr("Alarm kebakaran, tidak terbukti", "Fire alarm, not confirmed") }, severity: "sedang" },
]

function statusForAge(age: number, r: number): EventStatus {
  if (age < 4 * 60 * MINUTE) return r < 0.7 ? "open" : "acknowledged"
  if (age < DAY) return r < 0.3 ? "open" : r < 0.7 ? "acknowledged" : "closed"
  return r < 0.05 ? "open" : r < 0.2 ? "acknowledged" : "closed"
}

type Stored = Omit<HseEvent, "riwayat">
const stores = new Map<string, Stored[]>()

function makeEnvironmentEvent(rand: () => number, t: number, id: string, site: string): Stored | null {
  const pool = sensorsOf(site)
  if (!pool.length) return null
  const sensor = pool[Math.floor(rand() * pool.length)]
  const type = sensorTypes.find((x) => x.id === sensor.type)!
  const th = thresholdOf(type.id)
  const level = rand() < 0.35 ? "bahaya" : "waspada"
  const batas = th[level]
  const nilai = batas + (th.arah === "atas" ? 1 : -1) * Math.abs(th.bahaya - th.waspada) * (0.05 + rand() * 0.3)
  const waktu = new Date(t)
  return {
    id,
    tipe: "lingkungan",
    judul: tr(`${type.label} melewati batas ${level}`, `${type.label} past the ${level === "bahaya" ? "danger" : "warning"} limit`),
    sumber: sensor.label,
    site,
    zona: sensor.zona,
    shift: shiftOf(waktu, site),
    severity: level === "bahaya" ? "tinggi" : "sedang",
    status: "open",
    waktu,
    sensor: { id: sensor.id, type: type.id, nilai, batas },
  }
}

function storeOf(site: string) {
  let rows = stores.get(site)
  if (rows) return rows
  const rand = seeded(`events|${site}`)
  const prefix = `EVT-${siteById(site)?.kode ?? site}-`
  const zonesHere = zonesOfSite(site)
  const zoneOption = (id: string) => ({ id, label: zonaById(id)?.nama ?? id })
  const now = Date.now()
  rows = []
  const add = (row: Stored | null) => {
    if (!row || row.waktu.getTime() > now) return
    row.status = statusForAge(now - row.waktu.getTime(), rand())
    rows!.push(row)
  }
  for (let d = 59; d >= 0; d--) {
    const day = new Date(now)
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - d)
    const at = () => day.getTime() + rand() * DAY
    const next = () => `${prefix}${String(rows!.length + 1).padStart(4, "0")}`
    for (let i = 1 + Math.floor(rand() * 3); i > 0; i--) add(makeEnvironmentEvent(rand, at(), next(), site))
    const cams = camerasAt(site)
    if (rand() < 0.4 && cams.length) {
      const cam = cams[Math.floor(rand() * cams.length)]
      const waktu = new Date(at())
      add({
        id: next(),
        tipe: "kamera",
        judul: tr("Kamera offline", "Camera offline"),
        sumber: cam.id,
        site,
        zona: zoneOption(cam.zona),
        shift: shiftOf(waktu, site),
        severity: "sedang",
        status: "open",
        waktu,
      })
    }
    if (rand() < 0.35 && zonesHere.length) {
      const kind = ertKinds[Math.floor(rand() * ertKinds.length)]
      const waktu = new Date(at())
      const zona = zonesHere[Math.floor(rand() * zonesHere.length)].id
      add({ id: next(), tipe: "ert", ...kind, sumber: tr("Tim ERT", "ERT team"), site, zona: zoneOption(zona), shift: shiftOf(waktu, site), status: "open", waktu })
    }
  }
  stores.set(site, rows)
  return rows
}

/** Cameras the CCTV page shows offline right now, as open events. */
const cameraEventId = (cameraId: string, since: Date) => `EVT-${cameraId.replace("CAM-", "K")}-${since.getTime().toString(36).slice(-4).toUpperCase()}`

const cameraEvents = (): Stored[] =>
  offlineCameras().map(({ camera, since }) => ({
    id: cameraEventId(camera.id, since),
    tipe: "kamera",
    judul: tr("Kamera offline", "Camera offline"),
    sumber: camera.id,
    site: camera.site,
    zona: camera.zona,
    shift: shiftOf(since, camera.site),
    severity: "sedang",
    status: histories.get(cameraEventId(camera.id, since))?.at(-1)?.status ?? "open",
    waktu: since,
  }))

const withHistory = (row: Stored): HseEvent => ({ ...row, riwayat: historyOf(row.id, row.status, row.waktu, row.catatan) })

function inScope(f: Filters) {
  const now = Date.now()
  const from = periodStart(f.periode, now)
  const here = inPlace(f)
  return (e: { waktu: Date; site: string; zona: Option; shift: string }) =>
    e.waktu.getTime() >= from && here(e.site, e.zona.id) && (f.shift === "all" || e.shift === f.shift)
}

/** Events of a switched-off module drop out with its filter option; their records stay. */
const matchesType = (f: Filters) => (e: HseEvent) =>
  eventTypeOn(e.tipe) && (f.tipe === "all" || e.tipe === f.tipe) && (f.severity === "all" || e.severity === f.severity)

function eventsFor(f: Filters) {
  const keep = inScope(f)
  const others = [...cameraEvents(), ...sitesIn(f).flatMap(storeOf)].filter(keep).map(withHistory)
  return [...ppeInPeriod(f).map(toEvent), ...others]
    .filter(matchesType(f))
    .sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
    .map(placed(f))
}

/** Every event for the filters, all statuses, newest first. */
export function getEventList(f: Filters) {
  return respond(f, () => eventsFor(f), [] as HseEvent[])
}

export function getLatestEvents(f: Filters, limit: number) {
  return respond(f, () => eventsFor(f).slice(0, limit), [] as HseEvent[])
}

const findStored = (id: string) => [...cameraEvents(), ...master().site.flatMap((s) => storeOf(s.id))].find((e) => e.id === id)

/** Looks an event up by id on any site whatever the filters, for links like `/event?id=…`. */
export function findEvent(f: Pick<Filters, "site">, id: string): HseEvent | undefined {
  const violation = findViolation(f, id)
  if (violation) return toEvent(violation)
  const row = findStored(id)
  return row && placed(f)(withHistory(row))
}

/** Moves events along the status flow, records who did it, and returns them as they now are. */
export async function updateEvents(f: Pick<Filters, "site">, ids: string[], status: EventStatus, catatan?: string) {
  const ppe = ids.filter((id) => findViolation(f, id))
  if (ppe.length) await updateViolations(ppe, status, catatan)
  else await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 300))
  const at = new Date()
  return ids.flatMap((id) => {
    const before = findEvent(f, id)
    if (!before) return []
    const stored = findStored(id)
    if (stored) {
      stored.status = status
      if (catatan) stored.catatan = catatan
    }
    histories.set(id, [...before.riwayat, { status, at, by: currentUserName(), catatan }])
    return [findEvent(f, id)!]
  })
}

/**
 * Pushes new events as they happen and returns an unsubscribe function: PPE violations from
 * the APD stream, plus an environment alarm about every 45 seconds.
 * ponytail: timer stand-in for the WebSocket, as in `subscribeViolations`.
 */
export function subscribeEvents(f: Filters, onEvent: (event: HseEvent) => void) {
  if (f.demo) return () => {}
  const keep = matchesType(f)
  const emit = (event: HseEvent) => keep(event) && onEvent(event)
  const offPpe = subscribeViolations(f, (v) => emit(toEvent(v)))
  const inView = inScope(f)
  const offEnvironment = topicOn("environment.alarm") ? liveEnvironment((row) => inView(row) && emit(placed(f)(withHistory(row)))) : () => {}
  return () => {
    offPpe()
    offEnvironment()
  }
}

const liveRand = seeded(`events-live|${Date.now()}`)
let liveNo = 1

/** One environment alarm somewhere on the user's sites about every 45 seconds, shared by every subscriber. */
const liveEnvironment = ticker(45_000, () => {
  const sites = userSites()
  const site = sites[Math.floor(liveRand() * sites.length)]
  const row = site && makeEnvironmentEvent(liveRand, Date.now(), `EVT-L${String(liveNo++).padStart(4, "0")}`, site)
  if (row) storeOf(site).unshift(row)
  return row
})

/** Readings from 15 minutes before to 15 minutes after an environment event, peaking at the value that raised it. */
export function getSensorTrace(event: HseEvent): Reading[] {
  if (!event.sensor) return []
  const type = sensorTypes.find((t) => t.id === event.sensor!.type)!
  const rand = seeded(`trace|${event.id}`)
  const t0 = event.waktu.getTime()
  const span = Math.abs(event.sensor.nilai - type.normal)
  return Array.from({ length: 31 }, (_, i) => {
    const t = t0 + (i - 15) * MINUTE
    const bump = Math.exp(-(((i - 15) / 4) ** 2))
    return { t, v: type.normal + Math.sign(event.sensor!.nilai - type.normal) * span * bump + (rand() - 0.5) * span * 0.12 }
  })
}

/** Most urgent first: severity, then the oldest still open. */
export const byUrgency = (a: HseEvent, b: HseEvent) => severityMeta[a.severity].rank - severityMeta[b.severity].rank || a.waktu.getTime() - b.waktu.getTime()

/** "Terbuka 3 jam" until it is closed, then "Selesai dalam 2 jam". The status itself shows next to it. */
export function ageLabel(event: HseEvent, now: number, duration: (ms: number) => string) {
  if (event.status !== "closed") return tr(`Terbuka ${duration(now - event.waktu.getTime())}`, `Open ${duration(now - event.waktu.getTime())}`)
  const closed = event.riwayat.findLast((h) => h.status === "closed")
  return closed ? tr(`Selesai dalam ${duration(closed.at.getTime() - event.waktu.getTime())}`, `Closed in ${duration(closed.at.getTime() - event.waktu.getTime())}`) : tr("Selesai", "Closed")
}
