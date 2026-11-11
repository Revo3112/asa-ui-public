/**
 * Vehicles at the gates and the fuel queue.
 *
 * Plate cameras read every plate (TNKB) and check it against the site's vehicle list and blacklist.
 * A registered vehicle is logged; an unregistered or blacklisted one is a "Kendaraan tak terdaftar"
 * indication and goes to review, so the log and AI Indications agree. The fuel-bay cameras measure
 * the queue: how many vehicles wait and for how long. Past the limit it alarms here, it is not a
 * violation.
 *
 * ponytail: the vehicle list, the passes and the queue are generated; the edge sends plate reads and
 * a queue count per bay.
 */

import type { Severity } from "@/shared/config/events"
import { indicationsOf, platFor } from "@/features/indications/data/indikasi"
import { camerasAt, currentProfil, master, siteName, zonaById, type Kamera } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { inPlace, placeLabel, placesIn, sitesIn } from "@/shared/data/scope"
import { periodStart } from "@/shared/lib/periods"
import { tr } from "@/shared/lib/i18n"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const DAYS = 30

/** The queue alarms above this many vehicles, or when the longest wait passes this many minutes. */
export const ANTRIAN_MAKS = 6
export const TUNGGU_MAKS = 15

export type PlatStatus = "terdaftar" | "tak-terdaftar" | "daftar-hitam"
export const platStatusMeta: Record<PlatStatus, { label: string; color: "success" | "warning" | "danger" }> = {
  terdaftar: { get label() { return tr("Terdaftar", "Registered") }, color: "success" },
  "tak-terdaftar": { get label() { return tr("Tak terdaftar", "Unregistered") }, color: "warning" },
  "daftar-hitam": { get label() { return tr("Daftar hitam", "Blacklisted") }, color: "danger" },
}

export type Kendaraan = { plat: string; jenis: string }

export type GateRecord = {
  id: string
  waktu: Date
  site: string
  zona: Option
  kamera: string
  plat: string
  jenis: string
  arah: "masuk" | "keluar"
  status: PlatStatus
  indikasiId?: string
  severity?: Severity
}

const jenisTambang = () => [tr("Dump truck", "Dump truck"), tr("Light vehicle", "Light vehicle"), tr("Truk tangki BBM", "Fuel tanker"), tr("Bus karyawan", "Staff bus"), tr("Truk vendor", "Vendor truck")]
const jenisPabrik = () => [tr("Truk kontainer", "Container truck"), tr("Truk boks", "Box truck"), tr("Pikap", "Pickup"), tr("Mobil operasional", "Company car"), tr("Bus karyawan", "Staff bus")]

/** Cameras that read plates. */
export const plateCameras = (site: string) => master().kamera.filter((k) => k.aktif && k.site === site && k.fungsi?.includes("kendaraan-tak-terdaftar"))

const fleets = new Map<string, Kendaraan[]>()

/** The vehicles registered for the site. Dump trucks dominate at a mine. */
export function fleetOf(site: string): Kendaraan[] {
  const key = `${currentProfil()}|${site}`
  let list = fleets.get(key)
  if (list) return list
  const rand = seeded(`armada|${key}`)
  const jenis = currentProfil() === "tambang" ? jenisTambang() : jenisPabrik()
  const weights = [0.45, 0.25, 0.1, 0.08, 0.12]
  const pickJenis = () => {
    let r = rand()
    for (let i = 0; i < jenis.length; i++) if ((r -= weights[i]!) < 0) return jenis[i]!
    return jenis[0]!
  }
  list = Array.from({ length: 48 }, () => ({ plat: platFor(site, rand), jenis: pickJenis() }))
  fleets.set(key, list)
  return list
}

const logs = new Map<string, GateRecord[]>()

/** Thirty days of plate reads at the site, newest first: registered vehicles in and out, plus the indications. */
export function gateLogOf(site: string): GateRecord[] {
  const key = `${currentProfil()}|${site}`
  let rows = logs.get(key)
  if (rows) return rows
  rows = []
  const cams = plateCameras(site)
  const now = Date.now()
  const label = (k: Kamera) => ({ id: k.zona, label: zonaById(k.zona)?.nama ?? k.zona })
  if (cams.length) {
    const rand = seeded(`plat|${key}`)
    const fleet = fleetOf(site)
    let no = 0
    for (let d = DAYS; d >= 0; d--) {
      const day = new Date(now)
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - d)
      for (const k of cams) {
        // Busier in the day; a fuel bay sees the hauling fleet all day.
        const trips = Math.round((/bbm|spbu/.test(k.zona) ? 26 : 16) * (0.7 + rand() * 0.6))
        for (let i = 0; i < trips; i++) {
          const h = rand() < 0.8 ? 6 + rand() * 13 : rand() * 24
          const t = day.getTime() + h * 60 * MINUTE
          if (t > now) continue
          const v = fleet[Math.floor(rand() * fleet.length)]!
          rows.push({ id: `PL-${key.split("|")[1]}-${++no}`, waktu: new Date(t), site, zona: label(k), kamera: k.id, plat: v.plat, jenis: v.jenis, arah: rand() < 0.5 ? "masuk" : "keluar", status: "terdaftar" })
        }
      }
    }
  }
  const from = now - (DAYS + 1) * DAY
  for (const e of indicationsOf(site)) {
    if (e.kategori !== "kendaraan-tak-terdaftar" || e.waktu.getTime() < from || !e.plat) continue
    rows.push({ id: `PL-${e.id}`, waktu: e.waktu, site, zona: e.zona, kamera: e.kamera, plat: e.plat, jenis: tr("Tidak diketahui", "Unknown"), arah: "masuk", status: e.severity === "tinggi" ? "daftar-hitam" : "tak-terdaftar", indikasiId: e.id, severity: e.severity })
  }
  rows.sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
  logs.set(key, rows)
  return rows
}

export type PlatData = { rows: GateRecord[]; masuk: number; keluar: number; tidakTerdaftar: number }

export function plat(f: Filters, now = Date.now()): PlatData {
  const start = periodStart(f.periode, now)
  const here = inPlace(f)
  const rows = sitesIn(f)
    .flatMap(gateLogOf)
    .filter((r) => r.waktu.getTime() >= start && here(r.site, r.zona.id))
    .map((r) => ({ ...r, zona: { id: r.zona.id, label: placeLabel(f, r.site, r.zona.id) } }))
    .sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
  return { rows, masuk: rows.filter((r) => r.arah === "masuk").length, keluar: rows.filter((r) => r.arah === "keluar").length, tidakTerdaftar: rows.filter((r) => r.status !== "terdaftar").length }
}

export const getPlat = (f: Filters) => respond(f, () => plat(f), { rows: [], masuk: 0, keluar: 0, tidakTerdaftar: 0 } as PlatData)

// ---- Fuel queue ----

const SLOT = 5 * MINUTE

/** Queue length at a bay at `t`: peaks at shift change and before the midday break, quiet at night. */
function queueAt(site: string, zona: string, t: number) {
  const h = new Date(t).getHours() + new Date(t).getMinutes() / 60
  const peak = (c: number, w: number, height: number) => height * Math.exp(-((h - c) ** 2) / (2 * w * w))
  const shape = currentProfil() === "tambang" ? peak(6.2, 0.7, 7) + peak(11.5, 0.8, 4) + peak(17.8, 0.7, 7.5) : peak(8, 0.8, 5) + peak(13.5, 0.8, 4.5)
  const noise = seeded(`antrian|${currentProfil()}|${site}|${zona}|${Math.floor(t / SLOT)}`)()
  return Math.max(0, Math.round(shape * (0.75 + noise * 0.5) + noise * 1.5 - 0.3))
}

export type Antri = { plat: string; jenis: string; menit: number }
export type BayAntrian = { site: string; zona: string; label: string; kamera?: string; panjang: number; tungguMaks: number; tungguRata: number; kendaraan: Antri[]; lewat: boolean }
export type AntrianPoint = { jam: string; panjang: number; tunggu: number }
export type AntrianData = { bays: BayAntrian[]; series: AntrianPoint[] }

const waitOf = (n: number, i: number, noise: number) => Math.round((n - i) * 2.3 + noise * 3)

export function antrian(f: Filters, now = Date.now()): AntrianData {
  const places = placesIn(f).filter((p) => /bbm|spbu/.test(p.zona) && camerasAt(p.site, p.zona).some((k) => k.fungsi?.includes("antrian-kendaraan")))
  const bays = places.map(({ site, zona }): BayAntrian => {
    const n = queueAt(site, zona, now)
    const rand = seeded(`antri|${site}|${zona}|${Math.floor(now / SLOT)}`)
    // Different vehicles: drawn from the fleet without putting any back.
    const fleet = [...fleetOf(site)]
    const kendaraan = Array.from({ length: Math.min(n, fleet.length) }, (_, i) => {
      const v = fleet.splice(Math.floor(rand() * fleet.length), 1)[0]!
      return { ...v, menit: Math.max(1, waitOf(n, i, rand())) }
    })
    const tungguMaks = kendaraan[0]?.menit ?? 0
    const tungguRata = n ? Math.round(kendaraan.reduce((a, b) => a + b.menit, 0) / n) : 0
    const k = camerasAt(site, zona).find((c) => c.fungsi?.includes("antrian-kendaraan"))
    return { site, zona, label: f.site === "all" ? `${zonaById(zona)?.nama ?? zona} · ${siteName(site)}` : (zonaById(zona)?.nama ?? zona), kamera: k?.id, panjang: n, tungguMaks, tungguRata, kendaraan, lewat: n > ANTRIAN_MAKS || tungguMaks > TUNGGU_MAKS }
  })
  const day0 = new Date(now)
  day0.setHours(0, 0, 0, 0)
  const series: AntrianPoint[] = []
  for (let h = 0; h <= new Date(now).getHours(); h++) {
    let panjang = 0
    let tunggu = 0
    for (const p of places)
      for (let m = 0; m < 60; m += 5) {
        const t = day0.getTime() + (h * 60 + m) * MINUTE
        if (t > now) break
        const n = queueAt(p.site, p.zona, t)
        panjang = Math.max(panjang, n)
        tunggu = Math.max(tunggu, waitOf(n, 0, 0.5))
      }
    series.push({ jam: `${String(h).padStart(2, "0")}.00`, panjang, tunggu })
  }
  return { bays, series }
}

export const getAntrian = (f: Filters) => respond(f, () => antrian(f), { bays: [], series: [] } as AntrianData)
