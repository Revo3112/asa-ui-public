/**
 * Who passed the gate cameras, and where a person went afterwards.
 *
 * Every face the gate cameras see is matched against the people registered for the site (employees,
 * contractors, visitors who gave consent). A match is logged; a face with no match is an
 * "Orang tak dikenal" indication and goes to review, so the log and the AI Indications page always
 * agree. The trail (jejak) follows one person across the counting cameras by re-identification.
 *
 * ponytail: the roster, the passes and the trail are generated; the edge sends match results only,
 * never the face template, and the roster is kept by HR/security.
 */

import type { Severity } from "@/shared/config/events"
import { indicationsOf } from "@/features/indications/data/indikasi"
import { activeShifts, currentProfil, master, siteById, zonaById, type Kamera } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { inPlace, placeLabel, sitesIn } from "@/shared/data/scope"
import { periodStart } from "@/shared/lib/periods"
import { tr } from "@/shared/lib/i18n"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const DAYS = 30

export type Peran = "karyawan" | "kontraktor" | "tamu"
export const peranLabel: Record<Peran, string> = {
  get karyawan() { return tr("Karyawan", "Employee") },
  get kontraktor() { return tr("Kontraktor", "Contractor") },
  get tamu() { return tr("Tamu", "Visitor") },
}

export type Orang = { id: string; nama: string; peran: Peran; site: string; shift: string }

export type FaceRecord = {
  id: string
  waktu: Date
  site: string
  zona: Option
  kamera: string
  arah: "masuk" | "keluar"
  /** The registered person it matched; none for an unknown face. */
  orang?: Orang
  /** The indication raised for an unknown face. */
  indikasiId?: string
  severity?: Severity
}

const first = ["Agus", "Budi", "Citra", "Dedi", "Eko", "Fajar", "Gita", "Hadi", "Indra", "Joko", "Kurnia", "Lina", "Made", "Nur", "Putra", "Rahmat", "Siti", "Tono", "Umar", "Vina", "Wahyu", "Yudi", "Zainal", "Andi", "Bayu", "Dewi", "Fikri", "Hendra", "Iwan", "Rudi", "Slamet", "Yanto", "Ratna", "Arif", "Benny", "Daniel", "Ketut", "Samuel", "Yohanes", "Rizky"]
const last = ["Saputra", "Wijaya", "Pratama", "Siregar", "Nugroho", "Hidayat", "Simanjuntak", "Kurniawan", "Setiawan", "Lubis", "Purba", "Santoso", "Gunawan", "Harahap", "Situmorang", "Wibowo", "Rahman", "Tanjung", "Sitompul", "Ramadhan"]

/** Cameras that check faces: the gate cameras. */
export const faceCameras = (site: string) => master().kamera.filter((k) => k.aktif && k.site === site && k.fungsi?.includes("orang-tak-dikenal"))
/** Cameras that count and re-identify people, for the trail. */
export const countingCameras = (site: string) => master().kamera.filter((k) => k.aktif && k.site === site && k.fungsi?.includes("hitung-orang"))

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** How many people the site has registered: enough to fill its zones on the day shift. */
function rosterSize(site: string) {
  const zones = siteById(site)?.zona ?? []
  const cap = zones.reduce((sum, z) => sum + (zonaById(z)?.kapasitas ?? 0), 0)
  return Math.max(30, Math.round(cap * 1.4))
}

const rosters = new Map<string, Orang[]>()

/** The people registered for the site. Most work the day shift. */
export function rosterOf(site: string): Orang[] {
  const key = `${currentProfil()}|${site}`
  let list = rosters.get(key)
  if (list) return list
  const rand = seeded(`roster|${key}`)
  const shifts = activeShifts()
  // Day shift first in the master list; it gets the most people.
  const weights = shifts.map((_, i) => (i === 0 ? 0.6 : i === 1 ? (shifts.length > 2 ? 0.27 : 0.4) : 0.13))
  const pickShift = () => {
    let r = rand() * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < shifts.length; i++) if ((r -= weights[i]!) < 0) return shifts[i]!.id
    return shifts[0]!.id
  }
  const used = new Set<string>()
  list = Array.from({ length: rosterSize(site) }, (_, i): Orang => {
    let nama = ""
    do nama = `${first[Math.floor(rand() * first.length)]} ${last[Math.floor(rand() * last.length)]}`
    while (used.has(nama) && used.size < first.length * last.length)
    used.add(nama)
    const r = rand()
    const peran: Peran = r < 0.7 ? "karyawan" : r < 0.93 ? "kontraktor" : "tamu"
    return { id: `ORG-${siteById(site)?.kode ?? site}-${String(i + 1).padStart(3, "0")}`, nama, peran, site, shift: peran === "tamu" ? shifts[0]!.id : pickShift() }
  })
  rosters.set(key, list)
  return list
}

const logs = new Map<string, FaceRecord[]>()

/** Thirty days of gate passes at the site, newest first: every registered person in and out, plus the unknown faces. */
export function faceLogOf(site: string): FaceRecord[] {
  const key = `${currentProfil()}|${site}`
  let rows = logs.get(key)
  if (rows) return rows
  const cams = faceCameras(site)
  rows = []
  const now = Date.now()
  if (cams.length) {
    const rand = seeded(`wajah|${key}`)
    const shiftById = new Map(activeShifts().map((s) => [s.id, s]))
    const record = (o: Orang, t: number, arah: FaceRecord["arah"], k: Kamera, n: number) => {
      if (t > now) return
      rows!.push({ id: `FC-${o.id}-${n}-${arah === "masuk" ? "M" : "K"}`, waktu: new Date(t), site, zona: { id: k.zona, label: zonaById(k.zona)?.nama ?? k.zona }, kamera: k.id, arah, orang: o })
    }
    for (let d = DAYS; d >= 0; d--) {
      const day = new Date(now)
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - d)
      for (const o of rosterOf(site)) {
        // Visitors come now and then; staff most days.
        if (rand() > (o.peran === "tamu" ? 0.12 : 0.86)) continue
        const sh = shiftById.get(o.shift)
        if (!sh) continue
        const start = minutesOf(sh.mulai)
        let end = minutesOf(sh.selesai)
        if (end <= start) end += 24 * 60
        const inAt = o.peran === "tamu" ? (9 + rand() * 5) * 60 : start - 25 + rand() * 30
        const outAt = o.peran === "tamu" ? inAt + 60 + rand() * 150 : end + rand() * 25
        const k = cams[Math.floor(rand() * cams.length)]!
        record(o, day.getTime() + inAt * MINUTE, "masuk", k, DAYS - d)
        record(o, day.getTime() + outAt * MINUTE, "keluar", cams[Math.floor(rand() * cams.length)]!, DAYS - d)
      }
    }
  }
  const from = now - (DAYS + 1) * DAY
  for (const e of indicationsOf(site)) {
    if (e.kategori !== "orang-tak-dikenal" || e.waktu.getTime() < from) continue
    rows.push({ id: `FC-${e.id}`, waktu: e.waktu, site, zona: e.zona, kamera: e.kamera, arah: "masuk", indikasiId: e.id, severity: e.severity })
  }
  rows.sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
  logs.set(key, rows)
  return rows
}

/** The people inside the site at `t`: whose last pass before it was in, and not more than a shift ago. */
export function onSiteAt(site: string, t: number): Orang[] {
  const last = new Map<string, FaceRecord>()
  for (const r of faceLogOf(site)) {
    const at = r.waktu.getTime()
    // Newest first: past the window nothing else counts.
    if (at < t - 16 * 60 * MINUTE) break
    if (!r.orang || at > t) continue
    if (!last.has(r.orang.id)) last.set(r.orang.id, r)
  }
  return [...last.values()].filter((r) => r.arah === "masuk").map((r) => r.orang!)
}

export type AksesData = {
  rows: FaceRecord[]
  /** Distinct registered people seen. */
  orang: number
  tamu: number
  takDikenal: number
}

export function akses(f: Filters, now = Date.now()): AksesData {
  const start = periodStart(f.periode, now)
  const here = inPlace(f)
  const rows = sitesIn(f)
    .flatMap(faceLogOf)
    .filter((r) => r.waktu.getTime() >= start && here(r.site, r.zona.id))
    .map((r) => ({ ...r, zona: { id: r.zona.id, label: placeLabel(f, r.site, r.zona.id) } }))
    .sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
  const people = new Map(rows.flatMap((r) => (r.orang ? [[r.orang.id, r.orang] as const] : [])))
  return {
    rows,
    orang: people.size,
    tamu: [...people.values()].filter((o) => o.peran === "tamu").length,
    takDikenal: rows.filter((r) => !r.orang).length,
  }
}

export const getAkses = (f: Filters) => respond(f, () => akses(f), { rows: [], orang: 0, tamu: 0, takDikenal: 0 } as AksesData)

// ---- Trail ----

export type JejakStop = { waktu: Date; zona: string; kamera: string; jenis: "masuk" | "terlihat" | "keluar" | "terakhir" }
export type Jejak = { label: string; peran?: Peran; stops: JejakStop[] }

/**
 * Where one person went, from the gate pass that started it: the gate, then the counting cameras
 * that re-identified them, then the gate on the way out. For an unknown face the trail ends where
 * they were last seen, which is what security needs to find them.
 */
export function jejakOf(f: Filters, recordId: string): Jejak | undefined {
  const all = sitesIn(f).flatMap(faceLogOf)
  const start = all.find((r) => r.id === recordId)
  if (!start) return undefined
  const site = start.site
  const label = (k: Kamera) => placeLabel(f, site, k.zona)
  const cams = countingCameras(site).filter((k) => !faceCameras(site).some((g) => g.id === k.id))
  const gate = master().kamera.find((k) => k.id === start.kamera)
  const rand = seeded(`jejak|${recordId}`)
  const now = Date.now()
  const stops: JejakStop[] = [{ waktu: start.waktu, zona: gate ? label(gate) : start.zona.label, kamera: start.kamera, jenis: "masuk" }]

  if (!start.orang) {
    let t = start.waktu.getTime()
    const n = 1 + Math.floor(rand() * 3)
    for (let i = 0; i < n && cams.length; i++) {
      t += (4 + rand() * 14) * MINUTE
      if (t > now) break
      const k = cams[Math.floor(rand() * cams.length)]!
      stops.push({ waktu: new Date(t), zona: label(k), kamera: k.id, jenis: i === n - 1 ? "terakhir" : "terlihat" })
    }
    if (stops.length > 1) stops[stops.length - 1]!.jenis = "terakhir"
    return { label: tr("Orang tak dikenal", "Unknown person"), stops }
  }

  // The matching exit: the person's next pass out after this one.
  const exit = start.arah === "masuk" ? all.filter((r) => r.orang?.id === start.orang!.id && r.arah === "keluar" && r.waktu > start.waktu).at(-1) : undefined
  const until = Math.min(exit?.waktu.getTime() ?? start.waktu.getTime() + 8 * 60 * MINUTE, now)
  const span = until - start.waktu.getTime()
  const n = Math.min(5, Math.max(1, Math.floor(span / (90 * MINUTE))))
  let prev = ""
  for (let i = 1; i <= n && cams.length; i++) {
    const t = start.waktu.getTime() + (span * i) / (n + 1) + (rand() - 0.5) * 20 * MINUTE
    let k = cams[Math.floor(rand() * cams.length)]!
    if (k.zona === prev && cams.length > 1) k = cams[(cams.indexOf(k) + 1) % cams.length]!
    prev = k.zona
    stops.push({ waktu: new Date(t), zona: label(k), kamera: k.id, jenis: "terlihat" })
  }
  if (exit) stops.push({ waktu: exit.waktu, zona: placeLabel(f, site, exit.zona.id), kamera: exit.kamera, jenis: "keluar" })
  else if (stops.length > 1) stops[stops.length - 1]!.jenis = "terakhir"
  return { label: start.orang.nama, peran: start.orang.peran, stops }
}
