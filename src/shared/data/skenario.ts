/**
 * The demo storylines, per data profile, as times relative to when the page loaded. The live mock
 * generators read these so every page tells the same story: the satellite link that dropped
 * overnight and queued its events, the pole whose battery won't last the night, the pole left idle
 * after the front moved, the camera that went dark at the busiest loading point.
 *
 * ponytail: anchored at page load, like the camera statuses in data/cctv.ts. A real backend has no
 * storylines, only health events and telemetry.
 */

import type { Kategori } from "@/shared/config/indikasi"
import type { Severity } from "@/shared/config/events"
import { currentProfil, perangkatById, type Kamera, type Profil } from "@/shared/data/master"
import { tr } from "@/shared/lib/i18n"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type HealthKind = "camera-offline" | "camera-degraded" | "link-outage" | "link-degraded" | "edge-restart" | "power-low"

export const healthKindLabel: Record<HealthKind, string> = {
  get "camera-offline"() { return tr("Kamera offline", "Camera offline") },
  get "camera-degraded"() { return tr("Kamera menurun", "Camera degraded") },
  get "link-outage"() { return tr("Link putus", "Link outage") },
  get "link-degraded"() { return tr("Link menurun", "Link degraded") },
  get "edge-restart"() { return tr("Server edge restart", "Edge server restart") },
  get "power-low"() { return tr("Daya rendah", "Low power") },
}

/** Minutes ago it started; `minutes` is how long it lasted, absent while still going on. */
type HealthStory = { id: string; source: string; kind: HealthKind; startedAgo: number; minutes?: number; reason: string }

/** Live readings per device. Series are drawn around these values, ending at them. */
export type Telemetry = {
  uplinkMbps?: number
  downlinkMbps?: number
  latencyMs?: number
  queue?: number
  gpuLoad?: number
  channels?: number
  battery?: number
  solarW?: number
  runtimeHours?: number
  mast?: string
  computeLoad?: number
  gps?: string
}

/**
 * A hand-placed indication the scenarios point at. `ago` in minutes; the rest of its fields come
 * from the generator. It waits unacknowledged unless `reviewed`, which lets review run its course.
 */
type StoryEvent = { id: string; site: string; kamera: string; kategori: Kategori; severity: Severity; ago: number; reviewed?: true }

type Story = {
  health: HealthStory[]
  telemetry: Record<string, Telemetry>
  /** Devices that have seen nothing for this many days (the front moved away). */
  quietDays: Record<string, number>
  events: StoryEvent[]
}

const stories: Record<Profil, Story> = {
  tambang: {
    health: [
      {
        id: "HLT-001",
        source: "CAM-14",
        kind: "camera-offline",
        startedAgo: 25,
        get reason() { return tr("Tidak ada stream dari kamera. Daya ke tiang sedang diperiksa.", "No stream from the camera. Power to the pole is being checked.") },
      },
      {
        id: "HLT-002",
        source: "CAM-07",
        kind: "camera-offline",
        startedAgo: 125,
        get reason() { return tr("Tidak ada stream. Relokasi tiang tilt-down sudah dijadwalkan.", "No stream. Tilt-down pole relocation is scheduled.") },
      },
      {
        id: "HLT-003",
        source: "SAT-02",
        kind: "link-outage",
        startedAgo: 9 * 60 - 2,
        minutes: 126,
        get reason() { return tr("Terminal kehilangan koneksi. Event ditahan di antrean edge dan terkirim saat link pulih.", "The terminal lost connectivity. Events were held in the edge queue and sent when the link came back.") },
      },
      {
        id: "HLT-004",
        source: "SAT-02",
        kind: "link-degraded",
        startedAgo: 100,
        get reason() { return tr("Uplink di bawah 5 Mbps (cuaca/kepadatan). Event dikirim dulu, thumbnail menyusul.", "Uplink below 5 Mbps (weather/congestion). Events go first, thumbnails follow.") },
      },
      {
        id: "HLT-005",
        source: "CAM-11",
        kind: "camera-degraded",
        startedAgo: 7,
        get reason() { return tr("Frame rate rendah: 4 fps dari 15 fps yang dikonfigurasi.", "Low frame rate: 4 fps against 15 fps configured.") },
      },
      {
        id: "HLT-006",
        source: "POLE-02",
        kind: "power-low",
        startedAgo: 50,
        get reason() { return tr("Baterai 22% dengan produksi surya rendah (mendung). Diperkirakan habis sebelum fajar.", "Battery at 22% with low solar yield (overcast). Expected to run out before dawn.") },
      },
      {
        id: "HLT-007",
        source: "EDGE-01",
        kind: "edge-restart",
        startedAgo: 2 * DAY / MINUTE + 300,
        minutes: 14,
        get reason() { return tr("Restart terjadwal setelah pembaruan driver GPU.", "Scheduled restart after a GPU driver update.") },
      },
      {
        id: "HLT-008",
        source: "FO-01",
        kind: "link-outage",
        startedAgo: 4 * DAY / MINUTE + 610,
        minutes: 38,
        get reason() { return tr("Gangguan jaringan fiber dari ISP. Antrean edge terkirim penuh setelah pulih.", "A fibre outage at the ISP. The edge queue was delivered in full after recovery.") },
      },
    ],
    telemetry: {
      "FO-01": { uplinkMbps: 92, downlinkMbps: 310, latencyMs: 9, queue: 0 },
      "SAT-02": { uplinkMbps: 3.1, downlinkMbps: 61, latencyMs: 95, queue: 14 },
      "EDGE-01": { gpuLoad: 61, channels: 8 },
      "EDGE-02": { gpuLoad: 74, channels: 8 },
      "POLE-01": { uplinkMbps: 9.6, downlinkMbps: 88, latencyMs: 62, queue: 0, battery: 71, solarW: 410, runtimeHours: 26, get mast() { return tr("Terentang 3,5 m", "Extended 3.5 m") }, computeLoad: 48 },
      "POLE-02": { uplinkMbps: 7.9, downlinkMbps: 74, latencyMs: 70, queue: 2, battery: 22, solarW: 95, runtimeHours: 7, get mast() { return tr("Terentang 3,5 m", "Extended 3.5 m") }, computeLoad: 66 },
      "MANPACK-01": { uplinkMbps: 6.2, downlinkMbps: 40, latencyMs: 80, queue: 0, battery: 58, solarW: 22, runtimeHours: 5, gps: "2,1712, 117,4741" },
    },
    quietDays: { "POLE-01": 8 },
    events: [
      // The critical one nobody has acknowledged yet, at the loading point that keeps repeating.
      { id: "IND-BRU-K001", site: "berau", kamera: "CAM-06", kategori: "zona-terlarang", severity: "kritis", ago: 160 },
      { id: "IND-BRU-K002", site: "berau", kamera: "CAM-P02", kategori: "zona-terlarang", severity: "kritis", ago: 42 },
      { id: "IND-CLG-K001", site: "cilegon", kamera: "CAM-05", kategori: "zona-terlarang", severity: "tinggi", ago: 18 },
      // Today's gate, fuel and store indications, so each monitoring page has something new to review.
      { id: "IND-BRU-W001", site: "berau", kamera: "CAM-08", kategori: "orang-tak-dikenal", severity: "sedang", ago: 34 },
      { id: "IND-CLG-W001", site: "cilegon", kamera: "CAM-19", kategori: "orang-tak-dikenal", severity: "tinggi", ago: 75 },
      { id: "IND-BRU-V001", site: "berau", kamera: "CAM-12", kategori: "kendaraan-tak-terdaftar", severity: "tinggi", ago: 22 },
      { id: "IND-BRU-V002", site: "berau", kamera: "CAM-18", kategori: "kendaraan-tak-terdaftar", severity: "sedang", ago: 110 },
      { id: "IND-CLG-O001", site: "cilegon", kamera: "CAM-20", kategori: "perubahan-objek", severity: "tinggi", ago: 50 },
      { id: "IND-BRU-O001", site: "berau", kamera: "CAM-21", kategori: "perubahan-objek", severity: "sedang", ago: 140 },
      // Raised while SAT-02 was down: held in the edge queue and delivered when the link came back.
      ...(
        [
          ["CAM-02", "zona-terlarang", "tinggi", 532],
          ["CAM-06", "zona-terlarang", "kritis", 519],
          ["CAM-10", "zona-terlarang", "sedang", 505],
          ["CAM-04", "zona-terlarang", "tinggi", 488],
          ["CAM-06", "zona-terlarang", "tinggi", 470],
          ["CAM-P02", "zona-terlarang", "tinggi", 458],
          ["CAM-12", "zona-terlarang", "sedang", 441],
          ["CAM-02", "zona-terlarang", "sedang", 430],
          ["CAM-10", "zona-terlarang", "tinggi", 418],
        ] as const
      ).map(([kamera, kategori, severity, ago], i): StoryEvent => ({ id: `IND-BRU-Q${String(i + 1).padStart(3, "0")}`, site: "berau", kamera, kategori, severity, ago, reviewed: true })),
    ],
  },
  pabrik: {
    health: [
      { id: "HLT-001", source: "CAM-14", kind: "camera-offline", startedAgo: 25, get reason() { return tr("Tidak ada stream dari kamera. Kabel PoE sedang diperiksa.", "No stream from the camera. The PoE cable is being checked.") } },
      { id: "HLT-002", source: "CAM-07", kind: "camera-offline", startedAgo: 125, get reason() { return tr("Tidak ada stream. Kamera dijadwalkan diganti.", "No stream. The camera is scheduled for replacement.") } },
      { id: "HLT-003", source: "EDGE-BPN", kind: "edge-restart", startedAgo: 20 * 60, minutes: 11, get reason() { return tr("Restart setelah pembaruan sistem operasi.", "Restart after an operating system update.") } },
      { id: "HLT-004", source: "NET-KRW", kind: "link-outage", startedAgo: 3 * DAY / MINUTE + 200, minutes: 47, get reason() { return tr("Gangguan ISP di kawasan industri. Antrean edge terkirim setelah pulih.", "ISP outage in the industrial estate. The edge queue was delivered after recovery.") } },
    ],
    telemetry: {
      "NET-CKR": { uplinkMbps: 92, downlinkMbps: 310, latencyMs: 12, queue: 0 },
      "NET-KRW": { uplinkMbps: 64, downlinkMbps: 220, latencyMs: 15, queue: 0 },
      "NET-BPN": { uplinkMbps: 41, downlinkMbps: 150, latencyMs: 21, queue: 0 },
      "EDGE-CKR": { gpuLoad: 68, channels: 16 },
      "EDGE-KRW": { gpuLoad: 44, channels: 8 },
      "EDGE-BPN": { gpuLoad: 39, channels: 8 },
    },
    quietDays: {},
    events: [
      { id: "IND-CKR-K001", site: "cikarang", kamera: "CAM-10", kategori: "zona-terlarang", severity: "kritis", ago: 95 },
      // Gate (CAM-28/29, CAM-33), fuel station (CAM-31) and stores (CAM-04, CAM-18) today.
      { id: "IND-CKR-W001", site: "cikarang", kamera: "CAM-28", kategori: "orang-tak-dikenal", severity: "tinggi", ago: 28 },
      { id: "IND-KRW-W001", site: "karawang", kamera: "CAM-33", kategori: "orang-tak-dikenal", severity: "sedang", ago: 85 },
      { id: "IND-CKR-V001", site: "cikarang", kamera: "CAM-29", kategori: "kendaraan-tak-terdaftar", severity: "tinggi", ago: 40 },
      { id: "IND-CKR-V002", site: "cikarang", kamera: "CAM-31", kategori: "kendaraan-tak-terdaftar", severity: "sedang", ago: 130 },
      { id: "IND-CKR-O001", site: "cikarang", kamera: "CAM-04", kategori: "perubahan-objek", severity: "tinggi", ago: 15 },
      { id: "IND-KRW-O001", site: "karawang", kamera: "CAM-18", kategori: "perubahan-objek", severity: "sedang", ago: 65 },
    ],
  },
}

const anchor = Date.now()

export const story = () => stories[currentProfil()]

export type HealthEvent = { id: string; source: string; kind: HealthKind; startedAt: Date; restoredAt?: Date; reason: string }

/** Every health event of the active profile, newest first. */
export const healthEvents = (): HealthEvent[] =>
  story()
    .health.map((h) => ({
      id: h.id,
      source: h.source,
      kind: h.kind,
      startedAt: new Date(anchor - h.startedAgo * MINUTE),
      restoredAt: h.minutes === undefined ? undefined : new Date(anchor - (h.startedAgo - h.minutes) * MINUTE),
      reason: h.reason,
    }))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

/** The link outages and degradations of one uplink, as [from, to) in epoch ms. */
export function linkWindows(link: string, kind: "link-outage" | "link-degraded") {
  return healthEvents()
    .filter((h) => h.source === link && h.kind === kind)
    .map((h) => ({ from: h.startedAt.getTime(), to: h.restoredAt?.getTime() ?? Infinity }))
}

export const telemetryOf = (device: string): Telemetry => story().telemetry[device] ?? {}

/** When the device last saw anything, for devices the story keeps quiet. */
export const quietSince = (device: string) => {
  const days = story().quietDays[device]
  return days === undefined ? undefined : anchor - days * DAY
}

export const storyEvents = () => story().events.map((e) => ({ ...e, at: anchor - e.ago * MINUTE }))

/**
 * Whether a camera could have raised an indication at `t`: its device was deployed, the story
 * doesn't keep it quiet, and it wasn't offline. The APD and indication generators both use this,
 * so an idle pole is idle everywhere.
 */
export function cameraEmits(k: Pick<Kamera, "id" | "perangkat">, t: number) {
  const device = k.perangkat ? perangkatById(k.perangkat) : undefined
  if (device?.dipasang && t < Date.parse(device.dipasang)) return false
  const quiet = device && quietSince(device.id)
  if (quiet !== undefined && t >= quiet) return false
  const dark = healthEvents().find((h) => h.source === k.id && h.kind === "camera-offline" && !h.restoredAt)
  return !dark || t < dark.startedAt.getTime()
}
