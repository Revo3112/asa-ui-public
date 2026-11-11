/**
 * Every threshold the rules engine uses, in one place. The values are the illustrative defaults from
 * the developer brief: they become configuration agreed with the customer, never constants in a
 * component. Pages print them next to the numbers they drive, so a reader can see the rule.
 *
 * Pure data with no imports, so the rule checks in lib/rules.check.ts can run it under plain Node.
 */

export type SeverityKey = "kritis" | "tinggi" | "sedang" | "rendah"

export const rules = {
  /** Minutes from detection to acknowledgement before the SLA is breached. */
  ackSlaMinutes: { kritis: 15, tinggi: 30, sedang: 120, rendah: 480 } satisfies Record<SeverityKey, number>,

  /** Kritis/Tinggi still waiting in one of these workflow states counts as unhandled. */
  unhandledWorkflow: ["new", "acknowledged", "in-review"] as const,

  /** ≥ `count` confirmed findings at the same site + zone + category within `days`. */
  repeatFinding: { count: 5, days: 7 },

  /** Uplink below this is degraded. */
  linkDegradedMbps: 5,
  /** A camera with no frame for this long is stale. */
  cameraStaleMinutes: 5,
  /** A source with no health report for this long is stale. */
  sourceStaleMinutes: 5,

  /** False alarms / completed reviews at or above `share`, with at least `minReviews`, marks a detector for tuning. */
  tuningCandidate: { share: 0.25, minReviews: 20 },

  /** Night breach rate minus day breach rate at or above `points`, with at least `minEvents` per shift. */
  nightSlaGap: { points: 8, minEvents: 10, dayStart: "06:00", dayEnd: "18:00" },

  /** Last 24 h at or above `ratio` × the daily mean of the previous `baselineDays`, and at least `min`. */
  anomaly: { ratio: 2, min: 3, baselineDays: 28 },

  /** Battery below `socPercent`, or (pole) runtime below `runtimeHours`, predicts an outage. */
  powerRisk: { socPercent: 30, runtimeHours: 10 },

  /** No indication for `quietDays` while deployed longer than `deployedDays` makes a pole a relocation candidate. */
  idlePole: { quietDays: 7, deployedDays: 7 },

  /** Zone risk score weights, 0–100 in total. To be validated with HSE. */
  riskWeights: { volume: 30, severity: 20, repeat: 15, trend: 10, coverage: 10, lingkungan: 15 },
  /**
   * The environment part: share of the last 7 days the zone's worst sensor spent past its limits,
   * a warning hour counting `warnWeight` of a danger hour. At `fullShare` (about a day of the week
   * in danger) the part is full.
   */
  riskEnv: { warnWeight: 0.4, fullShare: 0.15 },
  /** Confirmed findings in this many days feed the volume part of the score. */
  riskVolumeDays: 14,
  /** Coverage penalty per camera or source in the zone. */
  riskCoverage: { offline: 15, degraded: 8 },
  /** Week-over-week ratio bands for the trend part. */
  riskTrend: { up: 1.3, down: 0.7 },

  /** A review needs a written reason at least this long. */
  rationaleMinLength: 10,

  /** Thumbnails ride with the event; clips stay on the edge until requested. */
  thumbnailMaxKb: 40,
}

export type Rules = typeof rules
