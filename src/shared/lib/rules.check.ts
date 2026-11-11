// Run with `node src/shared/lib/rules.check.ts` (Node 23.6+ strips the types).
import assert from "node:assert/strict"

import { rules } from "../config/rules.ts"
import {
  anomalies,
  backlogForecast,
  detectorSignals,
  idlePole,
  isLinkDegraded,
  isUnhandled,
  nightSlaGap,
  powerRisk,
  repeatFindings,
  slaBreached,
  zoneRiskScores,
  type RuleEvent,
} from "./rules.ts"

const MIN = 60_000
const DAY = 24 * 60 * MIN
const now = Date.UTC(2026, 9, 30, 4, 0)

const ev = (over: Partial<RuleEvent> = {}): RuleEvent => ({
  id: "E",
  site: "s",
  zona: "z",
  kategori: "apd",
  detektor: "d",
  severity: "tinggi",
  workflow: "new",
  t: now - 10 * MIN,
  shift: "siang",
  ...over,
})

// Unhandled: Kritis/Tinggi waiting in New, Acknowledged or In review only.
assert.ok(isUnhandled(ev({ severity: "kritis", workflow: "new" })))
assert.ok(isUnhandled(ev({ severity: "tinggi", workflow: "in-review" })))
assert.ok(!isUnhandled(ev({ severity: "sedang", workflow: "new" })), "Sedang is never unhandled")
assert.ok(!isUnhandled(ev({ severity: "kritis", workflow: "review-completed" })), "a reviewed Kritis is handled")

// Ack SLA: Kritis 15 min.
assert.ok(!slaBreached(ev({ severity: "kritis", t: now - 10 * MIN }), now), "10 min unacknowledged Kritis is within SLA")
assert.ok(slaBreached(ev({ severity: "kritis", t: now - 16 * MIN }), now), "16 min unacknowledged Kritis breaches")
assert.ok(slaBreached(ev({ severity: "kritis", t: now - 60 * MIN, ackAt: now - 40 * MIN }), now), "acknowledged after 20 min breaches")
assert.ok(!slaBreached(ev({ severity: "rendah", t: now - 400 * MIN }), now), "Rendah has 480 min")

// Repeat finding: 5 confirmed, same site + zone + category, 7 days.
const confirmed = (i: number, over: Partial<RuleEvent> = {}) => ev({ id: `C${i}`, outcome: "confirmed", t: now - i * DAY * 0.5, ...over })
assert.equal(repeatFindings([1, 2, 3, 4].map((i) => confirmed(i)), now).length, 0, "four is not a repeat")
assert.equal(repeatFindings([1, 2, 3, 4, 5].map((i) => confirmed(i)), now)[0].count, 5, "five is")
assert.equal(repeatFindings([1, 2, 3, 4, 20].map((i) => confirmed(i)), now).length, 0, "one outside 7 days doesn't count")
assert.equal(repeatFindings([1, 2, 3, 4, 5].map((i) => confirmed(i, { kategori: i === 5 ? "zona-terlarang" : "apd" })), now).length, 0, "categories don't mix")

// Detector tuning candidate: ≥ 25% false alarms with ≥ 20 reviews.
const reviews = (n: number, fa: number) => Array.from({ length: n }, (_, i) => ev({ id: `R${i}`, outcome: i < fa ? "false-alarm" : "confirmed" }))
assert.ok(detectorSignals(reviews(20, 5))[0].candidate, "5 of 20 is a candidate")
assert.ok(!detectorSignals(reviews(19, 10))[0].candidate, "fewer than 20 reviews is not")
assert.ok(!detectorSignals(reviews(20, 4))[0].candidate, "20% is not")

// Night SLA gap: ≥ 8 points with ≥ 10 per shift.
const shiftRows = (shift: string, n: number, breached: number) =>
  Array.from({ length: n }, (_, i) => ev({ id: `${shift}${i}`, shift, severity: "kritis", t: now - 60 * MIN, ackAt: now - 60 * MIN + (i < breached ? 20 : 5) * MIN }))
assert.ok(nightSlaGap([...shiftRows("siang", 10, 1), ...shiftRows("malam", 10, 2)], now).flagged, "20% vs 10% is a gap")
assert.ok(!nightSlaGap([...shiftRows("siang", 9, 0), ...shiftRows("malam", 10, 5)], now).flagged, "too few day events")

// Anomaly: last 24 h ≥ 2× the 28-day daily mean and ≥ 3.
const base = Array.from({ length: 28 }, (_, i) => ev({ id: `B${i}`, t: now - (i + 1.5) * DAY }))
const burst = (n: number) => Array.from({ length: n }, (_, i) => ev({ id: `N${i}`, t: now - (i + 1) * 60 * MIN }))
assert.equal(anomalies([...base, ...burst(3)], now).length, 1, "3 against a mean of 1 is an anomaly")
assert.equal(anomalies([...base, ...burst(2)], now).length, 0, "2 is below the minimum")

// Backlog forecast: pending ÷ 7-day pace.
const done = Array.from({ length: 14 }, (_, i) => ev({ id: `D${i}`, outcome: "confirmed", reviewedAt: now - i * 0.4 * DAY }))
assert.equal(backlogForecast([...done, ev({ id: "P1" }), ev({ id: "P2" }), ev({ id: "P3" }), ev({ id: "P4" })], now).days, 2, "4 pending at 2 a day is 2 days")

// Sources.
assert.ok(isLinkDegraded(3.1) && !isLinkDegraded(5) && !isLinkDegraded(undefined))
assert.ok(powerRisk({ id: "P", site: "s", jenis: "aegis", battery: 22, runtimeHours: 7 }), "22% is a power risk")
assert.ok(powerRisk({ id: "P", site: "s", jenis: "aegis", battery: 60, runtimeHours: 9 }), "9 h runtime on a pole is a power risk")
assert.ok(!powerRisk({ id: "M", site: "s", jenis: "manpack", battery: 58, runtimeHours: 5 }), "runtime only counts for poles")
assert.ok(!powerRisk({ id: "E", site: "s", jenis: "edge", battery: 1 }), "only poles and Manpacks")
assert.ok(idlePole({ id: "P", site: "s", jenis: "aegis", dipasang: now - 18 * DAY, lastIndication: now - 8 * DAY }, now), "quiet 8 days, deployed 18")
assert.ok(!idlePole({ id: "P", site: "s", jenis: "aegis", dipasang: now - 5 * DAY }, now), "deployed only 5 days")

// Zone risk score: the weights add up to 100 and each part stays within its weight.
assert.equal(Object.values(rules.riskWeights).reduce((a, b) => a + b, 0), 100)
const [top, low] = zoneRiskScores([
  { site: "s", zona: "a", confirmed: 20, urgent: 20, maxSameCategory7d: 9, last7: 30, prev7: 10, offlineSources: 1, degradedSources: 1, envExposure: 0.5, envSensors: 2 },
  { site: "s", zona: "b", confirmed: 2, urgent: 0, maxSameCategory7d: 1, last7: 2, prev7: 6, offlineSources: 0, degradedSources: 0 },
])
assert.equal(top.zona, "a")
assert.equal(top.score, 100, "the worst possible zone scores 100")
assert.ok(low.parts.trend === 0, "a falling trend adds nothing")
assert.ok(low.score < 20)
assert.equal(low.parts.lingkungan, 0, "a zone without sensor data adds nothing for environment")

console.log("rules ok")
