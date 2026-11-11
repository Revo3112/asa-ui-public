/**
 * The rules engine: every computed signal on the decision pages, as pure functions over plain
 * records. Thresholds come from config/rules.ts; nothing here knows about React or the mock store,
 * so the same code can move to the backend, and lib/rules.check.ts runs it under plain Node.
 *
 * Each rule says what it found and why, so a decision card can show its evidence.
 */

import { rules as defaults, type Rules, type SeverityKey } from "../config/rules.ts"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const urgent = (s: SeverityKey) => s === "kritis" || s === "tinggi"

// ---- Indications ----

export type RuleEvent = {
  id: string
  site: string
  zona: string
  kategori: string
  detektor: string
  severity: SeverityKey
  workflow: string
  /** Detection time, epoch ms. */
  t: number
  /** Acknowledgement time, epoch ms. */
  ackAt?: number
  shift: "siang" | "malam" | string
  outcome?: "confirmed" | "no-violation" | "false-alarm" | "inconclusive"
  /** When the review was completed, epoch ms. */
  reviewedAt?: number
}

/** Kritis or Tinggi still waiting in New, Acknowledged or In review. */
export const isUnhandled = (e: Pick<RuleEvent, "severity" | "workflow">, r: Rules = defaults) =>
  urgent(e.severity) && (r.unhandledWorkflow as readonly string[]).includes(e.workflow)

/** Acknowledged later than the SLA allows, or not yet acknowledged and already older than it. */
export function slaBreached(e: Pick<RuleEvent, "severity" | "t" | "ackAt">, now: number, r: Rules = defaults) {
  const limit = r.ackSlaMinutes[e.severity] * MINUTE
  return e.ackAt !== undefined ? e.ackAt - e.t > limit : now - e.t > limit
}

/** Breach rate per severity, acknowledged events and overdue unacknowledged ones counted alike. */
export function slaBySeverity(events: RuleEvent[], now: number, r: Rules = defaults) {
  return (Object.keys(r.ackSlaMinutes) as SeverityKey[]).map((severity) => {
    const rows = events.filter((e) => e.severity === severity)
    const breached = rows.filter((e) => slaBreached(e, now, r)).length
    return { severity, total: rows.length, breached, rate: rows.length ? breached / rows.length : 0, limitMinutes: r.ackSlaMinutes[severity] }
  })
}

export type RepeatGroup = { site: string; zona: string; kategori: string; count: number; ids: string[] }

/** ≥ N confirmed findings at the same site + zone + category in the last W days. */
export function repeatFindings(events: RuleEvent[], now: number, r: Rules = defaults): RepeatGroup[] {
  const from = now - r.repeatFinding.days * DAY
  const groups = new Map<string, RepeatGroup>()
  for (const e of events) {
    if (e.outcome !== "confirmed" || e.t < from) continue
    const key = `${e.site}|${e.zona}|${e.kategori}`
    const g = groups.get(key) ?? { site: e.site, zona: e.zona, kategori: e.kategori, count: 0, ids: [] }
    g.count++
    g.ids.push(e.id)
    groups.set(key, g)
  }
  return [...groups.values()].filter((g) => g.count >= r.repeatFinding.count).sort((a, b) => b.count - a.count)
}

export type DetectorSignal = { detektor: string; reviews: number; falseAlarms: number; share: number; candidate: boolean }

/** False-alarm share per detector over completed reviews. A high share is a tuning candidate, not a precision figure. */
export function detectorSignals(events: RuleEvent[], r: Rules = defaults): DetectorSignal[] {
  const by = new Map<string, { reviews: number; falseAlarms: number }>()
  for (const e of events) {
    if (!e.outcome) continue
    const d = by.get(e.detektor) ?? { reviews: 0, falseAlarms: 0 }
    d.reviews++
    if (e.outcome === "false-alarm") d.falseAlarms++
    by.set(e.detektor, d)
  }
  return [...by]
    .map(([detektor, d]) => {
      const share = d.reviews ? d.falseAlarms / d.reviews : 0
      return { detektor, ...d, share, candidate: d.reviews >= r.tuningCandidate.minReviews && share >= r.tuningCandidate.share }
    })
    .sort((a, b) => b.share - a.share)
}

const isNight = (shift: string) => /malam|night/i.test(shift)

/** SLA breach rate at night minus by day, in percentage points; flagged at the threshold with enough events on both sides. */
export function nightSlaGap(events: RuleEvent[], now: number, r: Rules = defaults) {
  const rate = (rows: RuleEvent[]) => (rows.length ? rows.filter((e) => slaBreached(e, now, r)).length / rows.length : 0)
  const night = events.filter((e) => isNight(e.shift))
  const day = events.filter((e) => !isNight(e.shift))
  const gap = (rate(night) - rate(day)) * 100
  return {
    dayRate: rate(day),
    nightRate: rate(night),
    dayCount: day.length,
    nightCount: night.length,
    gapPoints: gap,
    flagged: gap >= r.nightSlaGap.points && day.length >= r.nightSlaGap.minEvents && night.length >= r.nightSlaGap.minEvents,
  }
}

export type Anomaly = { site: string; zona: string; last24h: number; baselineDaily: number; ratio: number; ids: string[] }

/** Zones where the last 24 h is ≥ R × the daily mean of the previous baseline days, and at least K. */
export function anomalies(events: RuleEvent[], now: number, r: Rules = defaults): Anomaly[] {
  const dayAgo = now - DAY
  const baseFrom = dayAgo - r.anomaly.baselineDays * DAY
  const by = new Map<string, { site: string; zona: string; recent: string[]; base: number }>()
  for (const e of events) {
    if (e.t < baseFrom) continue
    const key = `${e.site}|${e.zona}`
    const g = by.get(key) ?? { site: e.site, zona: e.zona, recent: [], base: 0 }
    if (e.t >= dayAgo) g.recent.push(e.id)
    else g.base++
    by.set(key, g)
  }
  return [...by.values()]
    .map((g) => {
      const baselineDaily = g.base / r.anomaly.baselineDays
      return { site: g.site, zona: g.zona, last24h: g.recent.length, baselineDaily, ratio: baselineDaily ? g.recent.length / baselineDaily : Infinity, ids: g.recent }
    })
    .filter((a) => a.last24h >= r.anomaly.min && a.last24h >= r.anomaly.ratio * a.baselineDaily)
    .sort((a, b) => b.ratio - a.ratio)
}

/** Days to clear the review backlog at the pace of the last 7 days. Infinity when nothing was reviewed. */
export function backlogForecast(events: RuleEvent[], now: number) {
  const pending = events.filter((e) => !e.outcome).length
  const done7 = events.filter((e) => e.reviewedAt !== undefined && e.reviewedAt >= now - 7 * DAY).length
  const perDay = done7 / 7
  return { pending, perDay, days: perDay ? pending / perDay : pending ? Infinity : 0 }
}

// ---- Sources ----

export const isLinkDegraded = (mbps: number | undefined, r: Rules = defaults) => mbps !== undefined && mbps < r.linkDegradedMbps

export type RuleDevice = { id: string; jenis: string; battery?: number; runtimeHours?: number; dipasang?: number; lastIndication?: number; zona?: string; site: string }

/** Battery below the threshold, or a pole with less runtime than the threshold: an outage is coming. */
export function powerRisk(d: RuleDevice, r: Rules = defaults) {
  if (d.jenis !== "aegis" && d.jenis !== "manpack") return false
  if (d.battery !== undefined && d.battery < r.powerRisk.socPercent) return true
  return d.jenis === "aegis" && d.runtimeHours !== undefined && d.runtimeHours < r.powerRisk.runtimeHours
}

/** A pole deployed long enough that has seen nothing for a week: a relocation candidate. */
export function idlePole(d: RuleDevice, now: number, r: Rules = defaults) {
  if (d.jenis !== "aegis" || d.dipasang === undefined) return false
  const deployedDays = (now - d.dipasang) / DAY
  const quietDays = (now - (d.lastIndication ?? d.dipasang)) / DAY
  return deployedDays > r.idlePole.deployedDays && quietDays >= r.idlePole.quietDays
}

// ---- Zone risk score ----

export type ZoneInput = {
  site: string
  zona: string
  /** Confirmed findings in the volume window. */
  confirmed: number
  /** Of those, Kritis or Tinggi. */
  urgent: number
  /** Most confirmed findings of one category in the repeat window. */
  maxSameCategory7d: number
  /** Indications in the last 7 days and the 7 before. */
  last7: number
  prev7: number
  offlineSources: number
  degradedSources: number
  /** Share of the window the zone's worst sensor was past its limits (danger 1, warning `riskEnv.warnWeight`), 0–1. */
  envExposure?: number
  /** Environment sensors in the zone; none means the part is 0 because nothing was measured. */
  envSensors?: number
}

export type ZoneScore = {
  site: string
  zona: string
  score: number
  parts: { volume: number; severity: number; repeat: number; trend: number; coverage: number; lingkungan: number }
  /** Environment sensors in the zone, so "0 environment" can say it wasn't measured. */
  sensors: number
}

/**
 * 0–100, explainable: volume (relative to the busiest zone) · severity mix · repeat · 7-day trend ·
 * coverage uncertainty · environment (time the zone's sensors spent past their limits). Each part is returned so the page can show what drives the score.
 */
export function zoneRiskScores(zones: ZoneInput[], r: Rules = defaults): ZoneScore[] {
  const w = r.riskWeights
  const max = Math.max(1, ...zones.map((z) => z.confirmed))
  return zones
    .map((z) => {
      const ratio = z.prev7 ? z.last7 / z.prev7 : z.last7 ? r.riskTrend.up : 1
      const trend = ratio >= r.riskTrend.up ? Math.min(w.trend, (w.trend * 7) / 15 + (ratio - r.riskTrend.up) * 10) : ratio <= r.riskTrend.down ? 0 : (w.trend * 7) / 15
      const parts = {
        volume: (w.volume * z.confirmed) / max,
        severity: z.confirmed ? (w.severity * z.urgent) / z.confirmed : 0,
        repeat: Math.min(w.repeat, (w.repeat * z.maxSameCategory7d) / r.repeatFinding.count),
        trend,
        coverage: Math.min(w.coverage, z.offlineSources * r.riskCoverage.offline + z.degradedSources * r.riskCoverage.degraded),
        lingkungan: Math.min(w.lingkungan, (w.lingkungan * (z.envExposure ?? 0)) / r.riskEnv.fullShare),
      }
      const rounded = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 10) / 10])) as ZoneScore["parts"]
      return { site: z.site, zona: z.zona, score: Math.round(Object.values(parts).reduce((a, b) => a + b, 0)), parts: rounded, sensors: z.envSensors ?? 0 }
    })
    .sort((a, b) => b.score - a.score)
}
