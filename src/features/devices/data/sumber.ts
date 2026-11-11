/**
 * Monitoring sources: cameras, uplinks (satellite or fibre), edge analytics servers, Aegis poles
 * and Manpacks. If any of them is down, coverage is down. The status is a snapshot; outage history
 * is a separate list of health events with a start and, once restored, an end.
 *
 * Camera status comes from data/cctv.ts so the CCTV page and this one agree. Everything else
 * follows the demo story in data/skenario.ts. `?demo=` works as on Overview.
 */

import type { SourceStatus, Tier } from "@/shared/config/indikasi"
import { cameraStatusOf, liveCameraHealth } from "@/features/cctv/data/cctv"
import { indicationsIn, tierOf, uplinkOf } from "@/features/indications/data/indikasi"
import { master, siteMinutes, zonaById, type PerangkatJenis } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { sitesIn } from "@/shared/data/scope"
import { healthEvents, linkWindows, quietSince, telemetryOf, type HealthEvent, type Telemetry } from "@/shared/data/skenario"
import { tr } from "@/shared/lib/i18n"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export type SourceJenis = "kamera" | PerangkatJenis

export const sourceJenisLabel: Record<SourceJenis, string> = {
  get kamera() { return tr("Kamera", "Camera") },
  uplink: "Uplink",
  get edge() { return tr("Server analitik edge", "Edge analytics server") },
  aegis: "Aegis Intelligence Pole",
  manpack: "Manpack Surveillance",
}

export type Source = {
  id: string
  nama: string
  jenis: SourceJenis
  site: string
  zona?: Option
  status: SourceStatus
  lastSeen: Date
  /** Why it is not online, from its open health event. */
  alasan?: string
  telemetry: Telemetry
  /** Cameras: what runs their detection, and the link their events take. */
  tier?: Tier
  perangkat?: string
  uplink?: string
  media?: "satelit" | "fiber" | "4g"
  tipe?: string
  mount?: string
  dipasang?: Date
  /** Poles: when the last indication came in, for the idle-pole rule. */
  lastIndication?: Date
}

// ---- Health history ----

/**
 * Story events plus camera outages seen live, newest first. A story outage on a camera that has
 * come back since counts as restored then.
 */
export function allHealthEvents(): HealthEvent[] {
  const live = liveCameraHealth()
  const story = healthEvents().map((h) => {
    if (h.kind !== "camera-offline" || h.restoredAt) return h
    const now = cameraStatusOf(h.source)
    return now.online ? { ...h, restoredAt: now.since } : h
  })
  return [...live, ...story].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
}

const siteOfSource = (id: string) => master().kamera.find((k) => k.id === id)?.site ?? master().perangkat.find((p) => p.id === id)?.site ?? ""

export const getHealthEvents = (f: Filters) =>
  respond(
    f,
    () => {
      const sites = sitesIn(f)
      return allHealthEvents().filter((h) => sites.includes(siteOfSource(h.source)))
    },
    [] as HealthEvent[],
  )

// ---- Snapshot ----

const open = (id: string) => allHealthEvents().filter((h) => h.source === id && !h.restoredAt)

function statusFromHealth(id: string): { status: SourceStatus; alasan?: string } {
  const now = open(id)
  const offline = now.find((h) => h.kind === "camera-offline" || h.kind === "link-outage")
  if (offline) return { status: "offline", alasan: offline.reason }
  const degraded = now.find((h) => h.kind === "camera-degraded" || h.kind === "link-degraded" || h.kind === "power-low")
  if (degraded) return { status: "degraded", alasan: degraded.reason }
  return { status: "online" }
}

/** Every source at the filtered sites, as the control room sees it now. */
export function sourcesIn(f: Pick<Filters, "site" | "zona">): Source[] {
  const sites = sitesIn(f)
  const now = Date.now()
  const rand = seeded(`sumber|${Math.floor(now / MINUTE)}`)
  const lastIndications = new Map<string, number>()
  for (const e of indicationsIn({ ...f, periode: "30d", shift: "all", severity: "all", apd: "all", tipe: "all", zona: "all" } as Filters)) {
    if (!lastIndications.has(e.perangkat)) lastIndications.set(e.perangkat, e.waktu.getTime())
  }

  const cameras: Source[] = master()
    .kamera.filter((k) => k.aktif && sites.includes(k.site))
    .map((k) => {
      const live = cameraStatusOf(k.id)
      const health = statusFromHealth(k.id)
      const status: SourceStatus = !live.online ? "offline" : health.status === "degraded" ? "degraded" : "online"
      return {
        id: k.id,
        nama: k.nama,
        jenis: "kamera",
        site: k.site,
        zona: { id: k.zona, label: zonaById(k.zona)?.nama ?? k.zona },
        status,
        lastSeen: live.online ? new Date(now - (status === "degraded" ? 6 : rand() * 1.5) * MINUTE) : live.since,
        alasan: status === "online" ? undefined : (health.alasan ?? tr("Stream berhenti terdeteksi oleh server.", "The server detected the stream stopped.")),
        telemetry: {},
        tier: tierOf(k),
        perangkat: k.perangkat,
        uplink: uplinkOf(k),
        tipe: k.tipe,
        mount: k.mount,
      }
    })

  const devices: Source[] = master()
    .perangkat.filter((p) => p.aktif && sites.includes(p.site))
    .map((p) => {
      const health = statusFromHealth(p.id)
      return {
        id: p.id,
        nama: p.nama,
        jenis: p.jenis,
        site: p.site,
        zona: p.zona ? { id: p.zona, label: zonaById(p.zona)?.nama ?? p.zona } : undefined,
        status: health.status,
        lastSeen: new Date(now - (health.status === "offline" ? 30 : rand() * 0.8) * MINUTE),
        alasan: health.alasan,
        telemetry: telemetryOf(p.id),
        media: p.media,
        uplink: p.jenis === "edge" ? p.uplink : p.jenis === "uplink" ? undefined : p.id,
        dipasang: p.dipasang ? new Date(p.dipasang) : undefined,
        lastIndication: p.jenis === "aegis" || p.jenis === "manpack" ? new Date(lastIndications.get(p.id) ?? quietSince(p.id) ?? (p.dipasang ? Date.parse(p.dipasang) : now)) : undefined,
      }
    })

  const zonaFilter = (s: Source) => f.zona === "all" || !s.zona || f.zona === s.zona.id || f.zona === `${s.site}/${s.zona.id}`
  return [...devices, ...cameras].filter(zonaFilter)
}

export const getSources = (f: Filters) => respond(f, () => sourcesIn(f), [] as Source[])

// ---- Series ----

export type SeriesPoint = { t: number; v: number }
export type Series = { id: string; site: string; label: string; points: SeriesPoint[] }

/** Last 24 hours, one point per hour, ending at the source's live value. */
function hours() {
  const end = Math.floor(Date.now() / HOUR) * HOUR
  return Array.from({ length: 25 }, (_, i) => end - (24 - i) * HOUR)
}

/** Uplink per terminal: site terminals, poles and Manpacks. Zero while a link was down, low while degraded. */
export function uplinkSeriesIn(f: Pick<Filters, "site">): Series[] {
  const sites = sitesIn(f)
  return master()
    .perangkat.filter((p) => p.aktif && sites.includes(p.site) && (p.jenis === "uplink" || p.jenis === "aegis" || p.jenis === "manpack"))
    .map((p) => {
      const live = telemetryOf(p.id).uplinkMbps ?? 10
      const normal = p.jenis === "uplink" && p.media === "satelit" ? Math.max(live, 17) : p.jenis === "uplink" ? live : Math.max(live, 7)
      const rand = seeded(`uplink|${p.id}`)
      const outages = linkWindows(p.id, "link-outage")
      const degraded = linkWindows(p.id, "link-degraded")
      const ts = hours()
      const points = ts.map((t, i) => {
        if (i === ts.length - 1) return { t, v: live }
        if (outages.some((w) => t + HOUR > w.from && t < w.to)) return { t, v: 0 }
        if (degraded.some((w) => t + HOUR > w.from && t < w.to)) return { t, v: Math.round((2.4 + rand() * 1.6) * 10) / 10 }
        return { t, v: Math.round(normal * (0.8 + rand() * 0.3) * 10) / 10 }
      })
      return { id: p.id, site: p.site, label: `${p.id} · ${p.nama}`, points }
    })
}

/**
 * Battery per pole and Manpack: charging while the sun is up at the site, draining at night,
 * ending at the live reading. Drawn backwards from now so the last point always matches.
 */
export function powerSeriesIn(f: Pick<Filters, "site">): Series[] {
  const sites = sitesIn(f)
  return master()
    .perangkat.filter((p) => p.aktif && sites.includes(p.site) && (p.jenis === "aegis" || p.jenis === "manpack"))
    .map((p) => {
      const tel = telemetryOf(p.id)
      const live = tel.battery ?? 60
      // A pole on a cloudy day barely charges; the one in the story is about to run out.
      const gain = (tel.solarW ?? 200) / 100
      const ts = hours()
      const values: number[] = []
      let v = live
      for (let i = ts.length - 1; i >= 0; i--) {
        values[i] = Math.round(Math.max(3, Math.min(100, v)))
        const hour = siteMinutes(new Date(ts[i]), p.site) / 60
        const sun = hour >= 7 && hour < 17
        // Going back in time: undo this hour's charge or drain.
        v += sun ? -gain : p.jenis === "manpack" ? 6 : 2.4
      }
      return { id: p.id, site: p.site, label: `${p.id} · ${p.nama}`, points: ts.map((t, i) => ({ t, v: values[i] })) }
    })
}

export const getUplinkSeries = (f: Filters) => respond(f, () => uplinkSeriesIn(f), [] as Series[])
export const getPowerSeries = (f: Filters) => respond(f, () => powerSeriesIn(f), [] as Series[])

export type LagPoint = { id: string; t: number; lag: number; uplink: string; site: string }

/** Sync lag of every indication detected in the last 24 hours: seconds from the edge to the control room. */
export function syncLagToday(f: Filters): LagPoint[] {
  return indicationsIn(f, { from: Date.now() - 24 * HOUR })
    .map((e) => ({ id: e.id, t: e.waktu.getTime(), lag: e.syncLagDetik, uplink: e.uplink, site: e.site }))
    .sort((a, b) => a.t - b.t)
}

export const getSyncLag = (f: Filters) => respond(f, () => syncLagToday(f), [] as LagPoint[])
