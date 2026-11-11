/**
 * How many people are in each zone, against its capacity, and the evacuation headcount.
 *
 * The total comes from the gates (who is inside the site, see data/akses.ts); the counting cameras
 * say how it spreads over the zones. A zone above its capacity raises an alarm on this page only:
 * it is a number to act on, not a violation to review. The muster headcount compares the people the
 * gates say are inside with the people the muster-point cameras count.
 *
 * ponytail: the spread per zone is generated from the zone's capacity and a few busy hours; the edge
 * sends a count per camera every few seconds.
 */

import { countingCameras, onSiteAt, type Orang } from "@/features/access/data/akses"
import { camerasAt, currentProfil, master, siteName, zonaById, zoneName } from "@/shared/data/master"
import type { Filters } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { placeLabel, placesIn, sitesIn } from "@/shared/data/scope"
import { tr } from "@/shared/lib/i18n"

const MINUTE = 60_000
const SLOT = 5 * MINUTE

/** Zones that are counted: a capacity and at least one counting camera. */
function countedZones(site: string) {
  const cams = countingCameras(site)
  return (master().site.find((s) => s.id === site)?.zona ?? []).filter((z) => (zonaById(z)?.kapasitas ?? 0) > 0 && cams.some((k) => k.zona === z))
}

/** The zone that gets crowded at its busy hours: the loading point at midday, the gate at shift change. */
function busyFactor(zona: string, hour: number) {
  if (/loading/.test(zona) && hour >= 10 && hour < 13) return 1.9
  if (/akses|gerbang/.test(zona) && (hour === 6 || hour === 7 || hour === 17 || hour === 18)) return 1.6
  if (/gudang/.test(zona) && hour >= 14 && hour < 16) return 1.5
  return 1
}

/** People per counted zone at `t`: the people inside the site spread by capacity, busy hours and a little noise. */
export function zoneCountsAt(site: string, t: number): Record<string, number> {
  const zones = countedZones(site)
  const inside = onSiteAt(site, t).length
  const slot = Math.floor(t / SLOT)
  const hour = new Date(t).getHours()
  const w = zones.map((z) => (zonaById(z)?.kapasitas ?? 0) * busyFactor(z, hour) * (0.75 + seeded(`${currentProfil()}|${site}|${z}|${slot}`)() * 0.5))
  const total = w.reduce((a, b) => a + b, 0) || 1
  // Some are always where no camera looks (toilets, offices, the vehicle).
  const seen = inside * 0.85
  return Object.fromEntries(zones.map((z, i) => [z, Math.round((seen * w[i]!) / total)]))
}

export type ZonaKepadatan = { site: string; zona: string; label: string; count: number; kapasitas: number; kamera: string[]; lewatSejak?: Date }
export type Lewat = { site: string; zona: string; label: string; from: Date; to?: Date; puncak: number; kapasitas: number }
export type ArusPoint = { jam: string; masuk: number; keluar: number }

export type KepadatanData = {
  zones: ZonaKepadatan[]
  total: number
  /** Over-capacity spells today, newest first; `to` is empty while it lasts. */
  lewat: Lewat[]
  arus: ArusPoint[]
}

const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function kepadatan(f: Filters, now = Date.now()): KepadatanData {
  const places = placesIn(f)
  const zones: ZonaKepadatan[] = []
  const lewat: Lewat[] = []
  const day0 = startOfDay(now)
  for (const site of sitesIn(f)) {
    const counted = countedZones(site).filter((z) => places.some((p) => p.site === site && p.zona === z))
    if (!counted.length) continue
    // Walk today in five-minute steps for the over-capacity spells.
    const open = new Map<string, Lewat>()
    for (let t = day0; t <= now; t += SLOT) {
      const counts = zoneCountsAt(site, t)
      for (const z of counted) {
        const cap = zonaById(z)!.kapasitas!
        const n = counts[z] ?? 0
        const spell = open.get(z)
        if (n > cap) {
          if (spell) spell.puncak = Math.max(spell.puncak, n)
          else open.set(z, { site, zona: z, label: placeLabel(f, site, z), from: new Date(t), puncak: n, kapasitas: cap })
        } else if (spell) {
          spell.to = new Date(t)
          lewat.push(spell)
          open.delete(z)
        }
      }
    }
    lewat.push(...open.values())
    const counts = zoneCountsAt(site, now)
    for (const z of counted)
      zones.push({
        site,
        zona: z,
        label: placeLabel(f, site, z),
        count: counts[z] ?? 0,
        kapasitas: zonaById(z)!.kapasitas!,
        kamera: camerasAt(site, z).filter((k) => k.fungsi?.includes("hitung-orang")).map((k) => k.id),
        lewatSejak: open.get(z)?.from,
      })
  }

  // People through the counting lines per hour today: arrivals and departures follow the gate log.
  const arus: ArusPoint[] = []
  for (let h = 0; h <= new Date(now).getHours(); h++) {
    const from = day0 + h * 60 * MINUTE
    const to = Math.min(from + 60 * MINUTE, now)
    let masuk = 0
    let keluar = 0
    for (const site of sitesIn(f)) {
      const before = new Set(onSiteAt(site, from).map((o) => o.id))
      const after = new Set(onSiteAt(site, to).map((o) => o.id))
      for (const id of after) if (!before.has(id)) masuk++
      for (const id of before) if (!after.has(id)) keluar++
    }
    arus.push({ jam: `${String(h).padStart(2, "0")}.00`, masuk, keluar })
  }

  zones.sort((a, b) => b.count / b.kapasitas - a.count / a.kapasitas)
  lewat.sort((a, b) => b.from.getTime() - a.from.getTime())
  return { zones, total: zones.reduce((sum, z) => sum + z.count, 0), lewat, arus }
}

export const getKepadatan = (f: Filters) => respond(f, () => kepadatan(f), { zones: [], total: 0, lewat: [], arus: [] } as KepadatanData)

// ---- Muster (evacuation headcount) ----

export type TitikKumpul = { id: string; nama: string; site: string; zona: string; kamera?: string }

/** One muster point per site, at the gate or the office access, watched by its camera. */
export function titikKumpul(site: string): TitikKumpul | undefined {
  const zones = master().site.find((s) => s.id === site)?.zona ?? []
  const z = zones.find((x) => /gerbang|akses-kantor/.test(x)) ?? zones.find((x) => /akses/.test(x))
  if (!z) return undefined
  const k = camerasAt(site, z).find((c) => c.fungsi?.includes("hitung-orang"))
  return { id: `TK-${site}`, nama: tr(`Titik kumpul ${zoneName(z)}`, `Muster point ${zoneName(z)}`), site, zona: z, kamera: k?.id }
}

/** Drills started this session, per site. ponytail: the server keeps the drill and its headcount. */
const drills = new Map<string, { startedAt: number; expected: Orang[]; stoppedAt?: number }>()
const listeners = new Set<() => void>()
export const subscribeDrills = (l: () => void) => (listeners.add(l), () => listeners.delete(l))
const notify = () => listeners.forEach((l) => l())

/** How long the headcount takes to settle in the demo. */
const SETTLE_MS = 40_000

export function startDrill(site: string) {
  drills.set(site, { startedAt: Date.now(), expected: onSiteAt(site, Date.now()) })
  notify()
}

export function stopDrill(site: string) {
  const d = drills.get(site)
  if (d) d.stoppedAt = Date.now()
  notify()
}

export type Headcount = {
  titik: TitikKumpul
  label: string
  /** The people the gates say are inside. */
  expected: number
  counted: number
  /** Not at the muster point yet, with where a counting camera last saw them. */
  missing: { orang: Orang; terakhir: string }[]
  state: "siap" | "berjalan" | "selesai"
  startedAt?: Date
}

/** The headcount at each muster point in scope. Before a drill it is ready, with the number expected. */
export function headcounts(f: Filters, now = Date.now()): Headcount[] {
  return sitesIn(f).flatMap((site): Headcount[] => {
    const titik = titikKumpul(site)
    if (!titik) return []
    const label = f.site === "all" ? `${titik.nama} · ${siteName(site)}` : titik.nama
    const d = drills.get(site)
    if (!d) return [{ titik, label, expected: onSiteAt(site, now).length, counted: 0, missing: [], state: "siap" }]
    const at = d.stoppedAt ?? now
    const rand = seeded(`drill|${site}|${d.startedAt}`)
    // A few never arrive within the drill: the ones the HSE team must go and find.
    const stragglers = new Set(d.expected.filter(() => rand() < 0.05).slice(0, 4).map((o) => o.id))
    const progress = Math.min(1, (at - d.startedAt) / SETTLE_MS)
    const arrived = d.expected.filter((o) => !stragglers.has(o.id)).slice(0, Math.round(progress * (d.expected.length - stragglers.size)))
    const arrivedIds = new Set(arrived.map((o) => o.id))
    const zones = countedZones(site).filter((z) => z !== titik.zona)
    const missing = d.expected
      .filter((o) => !arrivedIds.has(o.id))
      .map((o) => ({ orang: o, terakhir: zones.length ? placeLabel(f, site, zones[Math.floor(seeded(o.id)() * zones.length)]!) : "—" }))
    return [{ titik, label, expected: d.expected.length, counted: arrived.length, missing: progress >= 1 ? missing : [], state: d.stoppedAt ? "selesai" : "berjalan", startedAt: new Date(d.startedAt) }]
  })
}
