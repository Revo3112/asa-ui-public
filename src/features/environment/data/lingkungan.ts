/**
 * Dummy environment sensors. A mock socket sends one reading per sensor per second:
 * a random walk that now and then spikes past its limits, plus one sensor that goes
 * quiet for 45 s every 5 min, so thresholds, alarms and stale status all show in a demo.
 * `?demo=` works as on Overview.
 */

import { sensorTypes, type Threshold } from "@/shared/config/lingkungan"
import { topicOn } from "@/shared/config/modules"
import { master, zoneName } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { inPlace, placed, sitesIn } from "@/shared/data/scope"

export type Reading = { t: number; v: number }
export type Bucket = { t: number; avg: number; min: number; max: number }
export type SensorStatus = "aman" | "waspada" | "bahaya" | "offline"

export type Sensor = { id: string; type: string; site: string; zona: Option; label: string }

/** Active sensors of one site, from master data, in sensor type order. */
export const sensorsOf = (site: string): Sensor[] =>
  sensorTypes.flatMap((type) =>
    master()
      .sensor.filter((s) => s.aktif && s.site === site && s.jenis === type.id)
      .map((s) => ({ id: s.id, type: s.jenis, site: s.site, zona: { id: s.zona, label: zoneName(s.zona) }, label: s.nama })),
  )

/** Active sensors the filters cover, labelled for the view. */
const sensorsIn = (f: Filters) => {
  const here = inPlace(f)
  return sitesIn(f).flatMap((site) =>
    sensorsOf(site)
      .filter((s) => here(s.site, s.zona.id))
      .map(placed(f)),
  )
}

/** This one stops sending for 45 s every 5 min. */
const FLAKY = "debu-cikarang-gudang"
const SECOND = 1000
const HISTORY_MS = 60 * 60_000

const typeOf = (s: Sensor) => sensorTypes.find((t) => t.id === s.type)!

export function getSensors(f: Filters) {
  return respond(f, () => sensorsIn(f), [] as Sensor[])
}

// ---- Thresholds: per sensor type, editable by admins ----

const thresholds = new Map(sensorTypes.map((t) => [t.id, t.threshold]))

/** The limits in force right now, for code outside React. */
export const thresholdOf = (typeId: string) => thresholds.get(typeId)!

export function getThresholds(f: Filters) {
  return respond(f, () => Object.fromEntries(thresholds), {} as Record<string, Threshold>)
}

export function saveThreshold(typeId: string, threshold: Threshold) {
  return new Promise<Threshold>((resolve) =>
    setTimeout(() => {
      thresholds.set(typeId, threshold)
      resolve(threshold)
    }, 400),
  )
}

// ---- The mock server: a simulation per site, advanced lazily to the current second ----

type Walk = { value: number; base: number; spike?: { until: number; target: number } }
type Simulation = { rand: () => number; t: number; walks: Map<string, Walk>; buffers: Map<string, Reading[]> }

const simulations = new Map<string, Simulation>()

function simulation(site: string) {
  let sim = simulations.get(site)
  if (!sim) {
    const rand = seeded(`lingkungan|${site}`)
    const start = Math.floor((Date.now() - HISTORY_MS) / SECOND) * SECOND
    sim = { rand, t: start, walks: new Map(), buffers: new Map() }
    simulations.set(site, sim)
  }
  advance(sim, sensorsOf(site))
  return sim
}

/** Readings so far for one sensor. A sensor added in master data starts empty. */
const bufferOf = (sim: Simulation, id: string) => sim.buffers.get(id) ?? []

function advance(sim: Simulation, sensors: Sensor[]) {
  // A sensor seen for the first time, at start or after it was added in master data, starts near normal.
  for (const s of sensors) {
    if (sim.walks.has(s.id)) continue
    const { normal, threshold } = typeOf(s)
    const base = normal + (sim.rand() - 0.5) * 0.3 * (threshold.waspada - normal)
    sim.walks.set(s.id, { value: base, base })
    sim.buffers.set(s.id, [])
  }
  const now = Math.floor(Date.now() / SECOND) * SECOND
  for (; sim.t < now;) {
    sim.t += SECOND
    for (const s of sensors) {
      const walk = sim.walks.get(s.id)!
      const { threshold } = typeOf(s)
      const span = Math.abs(threshold.bahaya - walk.base)
      // Roughly one spike per sensor every 12 minutes, peaking between the warning and danger limits or just past danger.
      if (!walk.spike && sim.rand() < 1 / 720) {
        const reach = 0.75 + sim.rand() * 0.45
        walk.spike = { until: sim.t + (20 + sim.rand() * 50) * SECOND, target: walk.base + Math.sign(threshold.bahaya - walk.base) * span * reach }
      }
      if (walk.spike && sim.t > walk.spike.until) walk.spike = undefined
      const target = walk.spike?.target ?? walk.base
      walk.value += (target - walk.value) * (walk.spike ? 0.15 : 0.05) + (sim.rand() - 0.5) * span * 0.05
      if (s.id === FLAKY && sim.t % (300 * SECOND) < 45 * SECOND) continue
      const buffer = sim.buffers.get(s.id)!
      buffer.push({ t: sim.t, v: Math.max(0, walk.value) })
      while (buffer.length && buffer[0].t < sim.t - HISTORY_MS) buffer.shift()
    }
  }
}

/** The last hour of readings, to fill the live charts before the socket takes over. */
export function getRecent(f: Filters) {
  return respond(f, () => Object.fromEntries(sensorsIn(f).map((s) => [s.id, [...bufferOf(simulation(s.site), s.id)]])), {} as Record<string, Reading[]>)
}

/**
 * Sends every new reading once a second and returns an unsubscribe function.
 * ponytail: timer stand-in for the WebSocket. Replace the body with `new WebSocket(url)`; callers stay the same.
 */
export function subscribeReadings(f: Filters, onBatch: (batch: { id: string; reading: Reading }[]) => void) {
  if (f.demo || !topicOn("environment.reading")) return () => {}
  const wanted = sensorsIn(f)
  const sent = new Map(sitesIn(f).map((site) => [site, simulation(site).t]))
  const timer = setInterval(() => {
    const batch = wanted.flatMap((s) => {
      const since = sent.get(s.site) ?? 0
      return bufferOf(simulation(s.site), s.id)
        .filter((r) => r.t > since)
        .map((reading) => ({ id: s.id, reading }))
    })
    for (const site of sent.keys()) sent.set(site, simulation(site).t)
    if (batch.length) onBatch(batch)
  }, SECOND)
  return () => clearInterval(timer)
}

/** About 300 buckets of average, minimum and maximum per sensor for a past range. */
export function getHistory(f: Filters, from: number, to: number) {
  return respond(
    f,
    () => {
      const step = Math.max(60_000, Math.ceil((to - from) / 300 / 60_000) * 60_000)
      return Object.fromEntries(
        sensorsIn(f).map((s) => {
          const { normal, threshold } = typeOf(s)
          const rand = seeded(`history|${s.id}|${step}`)
          const span = Math.abs(threshold.bahaya - normal)
          const buckets: Bucket[] = []
          for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
            // A daily cycle peaking mid-afternoon, plus noise and the odd excursion.
            const daily = Math.sin(((new Date(t).getHours() - 9) / 24) * 2 * Math.PI) * span * 0.25
            const excursion = rand() < 0.03 ? span * (0.7 + rand() * 0.5) : 0
            const avg = normal + Math.sign(threshold.bahaya - normal) * (daily + excursion) + (rand() - 0.5) * span * 0.1
            const spread = span * (0.05 + rand() * 0.1)
            buckets.push({ t, avg: Math.max(0, avg), min: Math.max(0, avg - spread), max: Math.max(0, avg + spread + excursion * 0.3) })
          }
          return [s.id, buckets]
        }),
      )
    },
    {} as Record<string, Bucket[]>,
  )
}

// ---- Exposure and alarms over days, for the risk score and the weekly comparison ----

const HOUR = 3_600_000
/** Hourly averages for the last 35 days, one series per sensor, built once per site per hour. */
const hourly = new Map<string, { at: number; series: Map<string, Bucket[]> }>()

function hourlyOf(site: string) {
  const now = Math.floor(Date.now() / HOUR) * HOUR
  const cached = hourly.get(site)
  if (cached?.at === now) return cached.series
  const series = new Map<string, Bucket[]>()
  for (const s of sensorsOf(site)) {
    const { normal, threshold } = typeOf(s)
    const rand = seeded(`hourly|${s.id}`)
    const span = Math.abs(threshold.bahaya - normal)
    // ponytail: where the demo story puts the problems: dust on crushers and haul roads, CO at fuel
    // and workshops, noise on crushers and conveyors. Those sensors go past their limits far more often.
    const z = s.zona.id
    const dirty = (s.type === "debu" && /crusher|haul|hr-|stockpile|loading/.test(z)) || (s.type === "co" && /bbm|workshop/.test(z)) || (s.type === "bising" && /crusher|conveyor|workshop/.test(z))
    const odds = dirty ? 0.14 : 0.03
    const buckets: Bucket[] = []
    for (let t = now - 35 * 24 * HOUR; t <= now; t += HOUR) {
      // Same shape as the history charts: a daily cycle, noise, and the odd excursion past the limits.
      const daily = Math.sin(((new Date(t).getHours() - 9) / 24) * 2 * Math.PI) * span * 0.25
      const excursion = rand() < odds ? span * (0.7 + rand() * 0.5) : 0
      const avg = Math.max(0, normal + Math.sign(threshold.bahaya - normal) * (daily + excursion) + (rand() - 0.5) * span * 0.1)
      buckets.push({ t, avg, min: avg, max: avg })
    }
    series.set(s.id, buckets)
  }
  hourly.set(site, { at: now, series })
  return series
}

const level = (s: Sensor, v: number): "aman" | "waspada" | "bahaya" => {
  const th = thresholdOf(s.type)
  const past = (limit: number) => (th.arah === "atas" ? v >= limit : v <= limit)
  return past(th.bahaya) ? "bahaya" : past(th.waspada) ? "waspada" : "aman"
}

/**
 * How much of [from, to) the zone's worst sensor spent past its limits: a danger hour counts 1, a
 * warning hour `warnWeight`. 0 with no sensors (nothing measured, not "safe").
 */
export function envExposure(site: string, zona: string, from: number, to: number, warnWeight: number) {
  const sensors = sensorsOf(site).filter((s) => s.zona.id === zona)
  if (!sensors.length) return { sensors: 0, exposure: 0 }
  const series = hourlyOf(site)
  const worst = Math.max(
    ...sensors.map((s) => {
      const hours = (series.get(s.id) ?? []).filter((b) => b.t >= from && b.t < to)
      if (!hours.length) return 0
      const weight = hours.reduce((sum, b) => sum + ({ aman: 0, waspada: warnWeight, bahaya: 1 } as const)[level(s, b.avg)], 0)
      return weight / hours.length
    }),
  )
  return { sensors: sensors.length, exposure: worst }
}

/** Alarms started in [from, to) across the filters: every crossing into warning or danger, and into danger alone. */
export function envAlarms(f: Pick<Filters, "site" | "zona">, from: number, to: number) {
  const here = inPlace(f)
  let alarms = 0
  let danger = 0
  for (const site of sitesIn(f)) {
    const series = hourlyOf(site)
    for (const s of sensorsOf(site).filter((x) => here(x.site, x.zona.id))) {
      let prev: "aman" | "waspada" | "bahaya" = "aman"
      for (const b of series.get(s.id) ?? []) {
        const now = level(s, b.avg)
        if (b.t >= from && b.t < to) {
          if (now !== "aman" && prev === "aman") alarms++
          if (now === "bahaya" && prev !== "bahaya") danger++
        }
        prev = now
      }
    }
  }
  return { alarms, danger }
}
