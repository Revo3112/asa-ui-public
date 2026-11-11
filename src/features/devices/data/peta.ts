/**
 * The map: every site at its location, and every camera and device at its own point with its
 * status and any urgent indication waiting on it. One place to see where things are wrong.
 *
 * ponytail: the master data has the site centres only. Zones are laid out on a ring around the
 * centre and cameras around their zone, deterministically, so the same camera always sits in the
 * same spot. A real deployment stores each device's surveyed coordinates (fixed CCTV, a pole where
 * it was set up) and the live GPS fix of moving ones (Manpack).
 */

import type { Severity } from "@/shared/config/events"
import { kategoriDef, type SourceStatus } from "@/shared/config/indikasi"
import { indicationsIn } from "@/features/indications/data/indikasi"
import { master, siteById } from "@/shared/data/master"
import type { Filters } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"
import { sitesIn } from "@/shared/data/scope"
import { sourcesIn, type SourceJenis } from "@/features/devices/data/sumber"
import { isUnhandled } from "@/shared/lib/rules"

export type LatLng = [number, number]

export type MapAlert = { id: string; judul: string; severity: Severity; waktu: Date; site: string }

export type MapPoint = {
  id: string
  nama: string
  jenis: SourceJenis
  site: string
  zona?: string
  pos: LatLng
  status: SourceStatus
  alasan?: string
  /** Kritis/Tinggi indications nobody has handled yet, newest first. */
  alerts: MapAlert[]
  /** Moving devices: who carries it. */
  carrier?: string
  /** Analytics this camera runs. */
  fungsi?: string[]
}

export type MapTone = "ok" | "warning" | "danger"

export type MapSite = {
  id: string
  nama: string
  alamat: string
  pos: LatLng
  tone: MapTone
  cameras: { online: number; total: number }
  devicesDown: number
  alerts: number
  points: MapPoint[]
}

/** Indonesia, for the first view. */
export const indonesia: { center: LatLng; zoom: number } = { center: [-2.4, 117.6], zoom: 5 }

// ponytail: who carries each Manpack, from the shift roster in a real build.
const carriers: Record<string, string> = { "MANPACK-01": "Dimas Prakoso · HSE Officer" }

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h
}

/** A zone's spot: on a ring about 1–1.5 km around the site centre. */
function zonePos(center: LatLng, zones: string[], zona: string): LatLng {
  const i = Math.max(0, zones.indexOf(zona))
  const angle = (i / Math.max(1, zones.length)) * Math.PI * 2 + (hash(zona) % 30) / 100
  const r = 0.009 + (hash(zona) % 5) * 0.0012
  return [center[0] + Math.sin(angle) * r, center[1] + Math.cos(angle) * r]
}

/** A point near `base`, 60–250 m off, stable per id. */
function near(base: LatLng, id: string, spread = 0.0022): LatLng {
  const h = hash(id)
  const angle = ((h % 360) / 180) * Math.PI
  const r = spread * (0.25 + ((h >> 9) % 75) / 100)
  return [base[0] + Math.sin(angle) * r, base[1] + Math.cos(angle) * r]
}

const parseGps = (gps?: string): LatLng | undefined => {
  const m = gps?.match(/(-?\d+[.,]\d+)\s*,\s*(-?\d+[.,]\d+)/)
  return m ? [Number(m[1]!.replace(",", ".")), Number(m[2]!.replace(",", "."))] : undefined
}

const toneOf = (alerts: number, down: number): MapTone => (alerts > 0 ? "danger" : down > 0 ? "warning" : "ok")

export function mapSites(f: Pick<Filters, "site">): MapSite[] {
  const all = { ...f, zona: "all" }
  const sources = sourcesIn(all)
  // What is waiting right now: Kritis/Tinggi from the last day that nobody has handled.
  const urgent = indicationsIn({ ...all, periode: "today", shift: "all", severity: "all", kategori: "all", apd: "all", tipe: "all" } as Filters).filter((e) => isUnhandled(e))
  const byCamera = new Map<string, MapAlert[]>()
  for (const e of urgent) {
    const list = byCamera.get(e.kamera) ?? byCamera.set(e.kamera, []).get(e.kamera)!
    list.push({ id: e.id, judul: e.judul || kategoriDef(e.kategori).label, severity: e.severity, waktu: e.waktu, site: e.site })
  }
  const kamera = new Map(master().kamera.map((k) => [k.id, k]))

  return sitesIn(f).flatMap((id): MapSite[] => {
    const s = siteById(id)
    if (!s?.koordinat) return []
    const center = s.koordinat
    const points: MapPoint[] = sources
      .filter((src) => src.site === id)
      .map((src) => {
        const zona = src.zona?.id
        const zoneSpot = zona ? zonePos(center, s.zona, zona) : center
        const gps = parseGps(src.telemetry.gps)
        // Edge servers and uplinks sit at the site's control room, at the centre.
        const pos = gps ?? (src.jenis === "edge" || src.jenis === "uplink" ? near(center, src.id, 0.0012) : src.jenis === "kamera" ? near(zoneSpot, src.id) : zoneSpot)
        return {
          id: src.id,
          nama: src.nama,
          jenis: src.jenis,
          site: id,
          zona: src.zona?.label,
          pos,
          status: src.status,
          alasan: src.alasan,
          alerts: src.jenis === "kamera" ? (byCamera.get(src.id) ?? []) : [],
          carrier: carriers[src.id],
          fungsi: kamera.get(src.id)?.fungsi,
        }
      })
    // A pole or a Manpack also carries its camera's alerts, so the device on the map lights up.
    for (const p of points) {
      if (p.jenis !== "aegis" && p.jenis !== "manpack") continue
      p.alerts = points.filter((c) => c.jenis === "kamera" && kamera.get(c.id)?.perangkat === p.id).flatMap((c) => c.alerts)
    }
    const cams = points.filter((p) => p.jenis === "kamera")
    const devicesDown = points.filter((p) => p.status !== "online").length
    const alerts = cams.reduce((n, c) => n + c.alerts.length, 0)
    return [
      {
        id,
        nama: s.nama,
        alamat: s.alamat,
        pos: center,
        tone: toneOf(alerts, devicesDown),
        cameras: { online: cams.filter((c) => c.status === "online" || c.status === "degraded").length, total: cams.length },
        devicesDown,
        alerts,
        points,
      },
    ]
  })
}

export const getMapSites = (f: Filters) => respond(f, () => mapSites(f), [] as MapSite[])
