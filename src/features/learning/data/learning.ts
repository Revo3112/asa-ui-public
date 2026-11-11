/**
 * Learning (V2 preview): how reviewed findings become training data for the edge models.
 *
 * ponytail: nothing trains here. Label counts are real (every completed review of the last 30 days
 * is a labelled sample); model versions, training dates and the continuous-learning switches are
 * mock state kept for the session. The model test returns made-up boxes. A real build sends the
 * reviewed clips to the training pipeline, and a new model only reaches the edge after validation
 * and sign-off.
 */

import { kategoriDefs, type Kategori } from "@/shared/config/indikasi"
import { findingOf, indicationsIn } from "@/features/indications/data/indikasi"
import type { Filters } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"

export type LabelCounts = { confirmed: number; noViolation: number; falseAlarm: number; inconclusive: number }

export type ModelRow = {
  kategori: Kategori
  label: string
  version: string
  trainedAt: Date
  /** Labelled samples gathered since that training. */
  labels: LabelCounts
  /** Usable samples: inconclusive reviews are not used for training. */
  usable: number
  /** Retraining is suggested once this many usable samples are waiting. */
  threshold: number
}

const DAY = 86_400_000

// Mock model registry: version and when it was last trained, per detector.
const registry: Record<Kategori, { version: string; daysAgo: number }> = {
  apd: { version: "ppe-v2.4", daysAgo: 21 },
  "zona-terlarang": { version: "intrusion-v3.0", daysAgo: 12 },
  "orang-tak-dikenal": { version: "face-v1.2", daysAgo: 9 },
  "kendaraan-tak-terdaftar": { version: "lpr-id-v2.1", daysAgo: 30 },
  "perubahan-objek": { version: "scene-diff-v1.0", daysAgo: 6 },
}

/** Continuous learning per detector, for this session. Off by default: a person turns it on. */
const continuous = new Map<Kategori, boolean>()
export const isContinuous = (k: Kategori) => continuous.get(k) ?? false
export const setContinuous = (k: Kategori, on: boolean) => continuous.set(k, on)

export function modelRows(f: Filters): ModelRow[] {
  const events = indicationsIn({ ...f, periode: "30d", kategori: "all", severity: "all" })
  return kategoriDefs.map((k) => {
    const labels: LabelCounts = { confirmed: 0, noViolation: 0, falseAlarm: 0, inconclusive: 0 }
    for (const e of events) {
      if (e.kategori !== k.id) continue
      const outcome = findingOf(e)?.outcome
      if (outcome === "confirmed") labels.confirmed++
      else if (outcome === "no-violation") labels.noViolation++
      else if (outcome === "false-alarm") labels.falseAlarm++
      else if (outcome === "inconclusive") labels.inconclusive++
    }
    const r = registry[k.id]
    return {
      kategori: k.id,
      label: k.label,
      version: r.version,
      trainedAt: new Date(Date.now() - r.daysAgo * DAY),
      labels,
      usable: labels.confirmed + labels.noViolation + labels.falseAlarm,
      threshold: 50,
    }
  })
}

export const getModelRows = (f: Filters) => respond(f, () => modelRows(f), [] as ModelRow[])

export type TestBox = { x: number; y: number; w: number; h: number; label: string; score: number }

/** A made-up detection result for an uploaded file, the same for the same file and model. */
export function mockDetect(file: { name: string; size: number }, kategori: Kategori, label: string): Promise<TestBox[]> {
  let h = kategori.length
  for (const c of `${file.name}|${file.size}|${kategori}`) h = (h * 33 + c.charCodeAt(0)) >>> 0
  const n = h % 4
  const boxes = Array.from({ length: n }, (_, i) => {
    const s = (h >> (i * 5)) >>> 0
    return { x: 8 + (s % 60), y: 10 + ((s >> 3) % 45), w: 12 + ((s >> 6) % 18), h: 22 + ((s >> 9) % 28), label, score: 0.55 + ((s >> 12) % 44) / 100 }
  })
  return new Promise((resolve) => setTimeout(() => resolve(boxes), 1200))
}
