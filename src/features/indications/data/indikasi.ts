/**
 * AI indications and their review findings: the first two of the five workflow entities.
 *
 * An indication is what the edge detector raised; a finding is the human review outcome. They are
 * separate records with separate statuses, and nothing becomes Confirmed or Resolved without a
 * person and a written reason. Every indication carries its provenance: tier, device, uplink,
 * detection and arrival time, and the sync lag between them.
 *
 * PPE indications are the APD violations themselves (same id, same record in data/apd.ts), so the
 * APD page and the review workflow always agree. Their simple status follows the workflow:
 * Baru → Open, Acknowledged/Sedang direview → Acknowledged, anything past review → Closed.
 *
 * Each mock function stands in for one API call; the state checks and permission checks here are
 * the ones the workflow service must enforce server-side.
 */

import { severityMeta, type Severity } from "@/shared/config/events"
import { zoneKategori } from "@/shared/config/fungsi-kamera"
import { kategoriDef, pendingReview, type ClipState, type Kategori, type Outcome, type Tier, type Workflow } from "@/shared/config/indikasi"
import { can, rolesThatCan, workflowActionLabel, type WorkflowAction } from "@/shared/auth/roles"
import { rules } from "@/shared/config/rules"
import { onViolationStatus, ppeRecords, severityOf, violationTitle, type Violation, type ViolationStatus } from "@/features/ppe/data/apd"
import { auditTrail, record, type AuditEntry } from "@/shared/data/audit"
import { seedCases, type SiteStore } from "@/features/cases/data/kasus-seed"
import { camerasAt, master, perangkatById, shiftOf, siteById, zonaById, zonesOfSite, type Kamera } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { inPlace, placed, sitesIn } from "@/shared/data/scope"
import { currentUser, roleLabel, type Role } from "@/shared/auth/session"
import { ApiError } from "@/shared/data/settings"
import { tr } from "@/shared/lib/i18n"
import { cameraEmits, linkWindows, storyEvents } from "@/shared/data/skenario"
import { periodStart } from "@/shared/lib/periods"
import type { RuleEvent } from "@/shared/lib/rules"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type AiEvent = {
  id: string
  kategori: Kategori
  judul: string
  site: string
  zona: Option
  kamera: string
  tier: Tier
  /** The device that ran detection: an edge server, an Aegis pole or a Manpack. */
  perangkat: string
  /** The link the event crossed to reach the control room. */
  uplink: string
  detektor: string
  /** The plate read, for vehicle indications. */
  plat?: string
  severity: Severity
  /** Detector score, 0–1. Not accuracy. */
  confidence: number
  shift: string
  /** Detected at the edge, edge clock. */
  waktu: Date
  /** Available in the control room, HQ clock. */
  diterima: Date
  syncLagDetik: number
  workflow: Workflow
  ackAt?: Date
  ackBy?: string
  slaMenit: number
  /** The thumbnail rides with the event; on a degraded link it follows later. */
  thumbnail: "synced" | "queued"
  bukti?: string
  clip: ClipState
  findingId?: string
  caseIds: string[]
  actionIds: string[]
  simulasi: true
}

export type Finding = {
  id: string
  eventId: string
  outcome: Outcome
  rationale: string
  reviewer: string
  at: Date
  /** A revised review is a new finding that points at the one it replaces. Findings are never edited. */
  supersedes?: string
  simulasi: true
}

// ---- Generation ----

function pick<T>(rand: () => number, weighted: [T, number][]) {
  let r = rand() * weighted.reduce((sum, [, w]) => sum + w, 0)
  for (const [value, w] of weighted) if ((r -= w) < 0) return value
  return weighted[weighted.length - 1][0]
}

const outcomeOdds: Record<Kategori, [Outcome, number][]> = {
  apd: [
    ["confirmed", 0.5],
    ["no-violation", 0.22],
    ["false-alarm", 0.18],
    ["inconclusive", 0.1],
  ],
  // Noisy until the zones and permitted hours are tuned (permit holders and night shadows trip it):
  // the detector the tuning rule should flag.
  "zona-terlarang": [
    ["confirmed", 0.38],
    ["no-violation", 0.18],
    ["false-alarm", 0.36],
    ["inconclusive", 0.08],
  ],
  // Mostly registered people the camera saw badly (helmet, mask, side-on): reviewed as no violation, rarely a false alarm.
  "orang-tak-dikenal": [
    ["confirmed", 0.4],
    ["no-violation", 0.42],
    ["false-alarm", 0.08],
    ["inconclusive", 0.1],
  ],
  "kendaraan-tak-terdaftar": [
    ["confirmed", 0.58],
    ["no-violation", 0.28],
    ["false-alarm", 0.06],
    ["inconclusive", 0.08],
  ],
  "perubahan-objek": [
    ["confirmed", 0.48],
    ["no-violation", 0.36],
    ["false-alarm", 0.08],
    ["inconclusive", 0.08],
  ],
}

/** Review reasons that only make sense for one category, used instead of the generic ones. */
const kategoriRationales: Partial<Record<Kategori, Partial<Record<Outcome, string[]>>>> = {
  "orang-tak-dikenal": {
    "no-violation": [tr("Kontraktor baru, wajah belum didaftarkan. Sudah didaftarkan.", "New contractor, face not registered yet. Now registered."), tr("Karyawan terdaftar, wajah tertutup helm dan masker.", "Registered employee, face covered by helmet and mask.")],
    "false-alarm": [tr("Bukan wajah: pantulan di kaca pos.", "Not a face: a reflection in the gate-house glass.")],
  },
  "kendaraan-tak-terdaftar": {
    "no-violation": [tr("Kendaraan vendor dengan surat jalan, plat belum diinput.", "Vendor vehicle with a delivery note, plate not entered yet.")],
    "false-alarm": [tr("Plat kotor/tertutup lumpur, terbaca salah.", "Plate dirty/covered in mud, misread.")],
  },
  "perubahan-objek": {
    "no-violation": [tr("Barang dipindahkan sesuai jadwal pengambilan.", "Goods moved for a scheduled pick-up."), tr("Tata letak diubah resmi; acuan diperbarui.", "Layout changed officially; reference updated.")],
    "false-alarm": [tr("Perubahan cahaya dari pintu gudang yang dibuka.", "Light change from the store door being opened.")],
  },
}

const platPrefix: Record<string, string[]> = { berau: ["KT", "KT", "DA"], cilegon: ["A", "A", "B"], cikarang: ["B", "T", "F"], karawang: ["T", "B"], balikpapan: ["KT", "KT", "DA"] }
const letters = "ABCDEFGHJKLMNPRSTUVWXYZ"

/** An Indonesian plate (TNKB) in the style of the site's region, e.g. "KT 8123 RB". */
export function platFor(site: string, rand: () => number) {
  const pre = platPrefix[site] ?? ["B"]
  const l = () => letters[Math.floor(rand() * letters.length)]
  return `${pre[Math.floor(rand() * pre.length)]} ${1000 + Math.floor(rand() * 8999)} ${l()}${l()}${rand() < 0.4 ? l() : ""}`
}

/** Title and severity for the categories whose indications come in kinds (a blacklisted plate, a collapsed stack). */
/** `want` pins the severity, for a scenario event; the kind follows it. */
function variantFor(kategori: Kategori, site: string, zoneRisk: Severity, t: number, rand: () => number, want?: Severity): { judul: string; severity: Severity; plat?: string } | undefined {
  const r = rand()
  if (kategori === "orang-tak-dikenal") {
    const h = new Date(t).getHours()
    const night = h < 6 || h >= 20
    return { judul: night ? tr("Orang tak dikenal di luar jam kerja", "Unknown person outside working hours") : tr("Orang tak dikenal di gerbang", "Unknown person at the gate"), severity: want ?? (night || zoneRisk === "kritis" ? "tinggi" : r < 0.75 ? "sedang" : "rendah") }
  }
  if (kategori === "kendaraan-tak-terdaftar") {
    const plat = platFor(site, rand)
    return (want ? want === "tinggi" || want === "kritis" : r < 0.15)
      ? { judul: tr(`Plat daftar hitam ${plat}`, `Blacklisted plate ${plat}`), severity: want ?? "tinggi", plat }
      : { judul: tr(`Kendaraan tak terdaftar ${plat}`, `Unregistered vehicle ${plat}`), severity: want ?? (r < 0.7 ? "sedang" : "rendah"), plat }
  }
  if (kategori === "perubahan-objek") {
    const kinds: [string, Severity][] = [
      [tr("Tumpukan palet roboh", "Pallet stack collapsed"), "tinggi"],
      [tr("Tumpukan barang bergeser", "Stack of goods shifted"), "sedang"],
      [tr("Barang di rak hilang dari posisi", "Goods missing from the rack"), "sedang"],
      [tr("Susunan melebihi batas tinggi", "Stack above the height limit"), "sedang"],
      [tr("Barang menghalangi jalur", "Goods blocking the aisle"), "rendah"],
    ]
    const collapsed = want ? want === "tinggi" || want === "kritis" : r < 0.15
    const [judul, severity] = kinds[collapsed ? 0 : 1 + Math.floor(rand() * (kinds.length - 1))]!
    return { judul, severity: want ?? severity }
  }
  return undefined
}

/** The detector score carries information: confirmed indications score higher than false alarms. */
const confidenceBand: Record<Outcome, [number, number]> = {
  confirmed: [0.72, 0.97],
  "no-violation": [0.55, 0.85],
  "false-alarm": [0.42, 0.72],
  inconclusive: [0.5, 0.72],
}

const rationales: Record<Outcome, string[]> = {
  confirmed: [
    tr("Terlihat jelas di thumbnail, sesuai kriteria pelanggaran SOP.", "Clearly visible in the thumbnail, matches the SOP violation criteria."),
    tr("Dicek ulang dengan klip; pelanggaran terkonfirmasi.", "Rechecked with the clip; violation confirmed."),
    tr("Pengawas area mengonfirmasi lewat radio.", "The area supervisor confirmed over radio."),
  ],
  "no-violation": [
    tr("Personel berwenang dengan izin kerja aktif.", "Authorised personnel with an active work permit."),
    tr("Orang berada di jalur pejalan kaki yang ditandai, bukan di zona alat.", "The person was on the marked walkway, not in the equipment zone."),
    tr("Kegiatan sesuai prosedur, tidak ada pelanggaran.", "Work done to procedure, no violation."),
  ],
  "false-alarm": [tr("Detektor terpicu pantulan cahaya/silau.", "The detector was triggered by a reflection/glare."), tr("Objek bukan orang (tiang, rambu, bayangan).", "The object is not a person (pole, sign, shadow)."), tr("Debu tebal mengaburkan gambar; bukan orang.", "Thick dust blurred the image; not a person.")],
  inconclusive: [tr("Gambar terlalu buram untuk dipastikan.", "The image is too blurry to tell."), tr("Sudut kamera tidak menunjukkan area kejadian.", "The camera angle doesn't show the event area."), tr("Klip belum tersedia, thumbnail tidak cukup.", "No clip yet, the thumbnail isn't enough.")],
}

/** Confirmed findings in these zones-and-categories drive the risk-based severity. */
function severityFor(kategori: Kategori, zoneRisk: Severity, rand: () => number): Severity {
  const r = rand()
  if (kategori === "zona-terlarang")
    return zoneRisk === "kritis" ? (r < 0.5 ? "kritis" : "tinggi") : zoneRisk === "tinggi" ? (r < 0.25 ? "kritis" : r < 0.85 ? "tinggi" : "sedang") : r < 0.6 ? "tinggi" : r < 0.85 ? "sedang" : "rendah"
  return r < 0.7 ? "sedang" : "rendah"
}

const zoneRate: Record<Severity, number> = { kritis: 2, tinggi: 1.2, sedang: 0.6, rendah: 0.25 }

export const tierOf = (k: Pick<Kamera, "perangkat">): Tier => {
  const jenis = k.perangkat ? perangkatById(k.perangkat)?.jenis : undefined
  return jenis === "aegis" ? "aegis" : jenis === "manpack" ? "manpack" : "site"
}

export function uplinkOf(k: Pick<Kamera, "perangkat">) {
  const device = k.perangkat ? perangkatById(k.perangkat) : undefined
  if (!device) return ""
  return device.jenis === "edge" ? (device.uplink ?? "") : device.id
}

const reviewerNames = (site: string) => {
  const reviewers = master().pengguna.filter((u) => u.aktif && u.role !== "super-admin" && can(u.role, "review") && u.site.includes(site))
  return reviewers.length ? reviewers.map((u) => u.nama) : ["Operator Control Room"]
}

/** Sync lag in seconds: a few seconds normally, until the link is back during an outage, slower while degraded. */
function syncLag(uplink: string, tier: Tier, t: number, rand: () => number) {
  const outage = linkWindows(uplink, "link-outage").find((w) => t >= w.from && t < w.to)
  if (outage) return { lag: Math.round((outage.to - t) / 1000 + 5 + rand() * 35), queued: false }
  const degraded = linkWindows(uplink, "link-degraded").find((w) => t >= w.from && t < w.to)
  if (degraded) return { lag: Math.round(20 + rand() * 70), queued: Date.now() - t < 30 * MINUTE && rand() < 0.6 }
  return { lag: Math.round((tier === "site" ? 2 : 4) + rand() * (tier === "site" ? 12 : 20)), queued: false }
}

function workflowForAge(ageMin: number, rand: () => number): Workflow | "done" {
  const odds: [Workflow | "done", number][] =
    ageMin < 30
      ? [
          ["new", 0.55],
          ["acknowledged", 0.25],
          ["in-review", 0.1],
          ["done", 0.1],
        ]
      : ageMin < 240
        ? [
            ["new", 0.15],
            ["acknowledged", 0.2],
            ["in-review", 0.15],
            ["done", 0.5],
          ]
        : ageMin < 1440
          ? [
              ["new", 0.02],
              ["acknowledged", 0.05],
              ["in-review", 0.08],
              ["done", 0.85],
            ]
          : ageMin < 7 * 1440
            ? [
                ["acknowledged", 0.005],
                ["in-review", 0.02],
                ["done", 0.975],
              ]
            : [["done", 1]]
  return pick(rand, odds)
}

const findings = new Map<string, Finding>()

type Base = { id: string; kategori: Kategori; judul: string; site: string; zona: string; kamera: Kamera; severity: Severity; t: number; plat?: string }

/**
 * Fills in everything else: provenance, sync lag, how far review got, and the finding when it is
 * done. `forced` pins the workflow for a scenario event.
 */
function complete(b: Base, rand: () => number, opts: { forced?: Workflow | "done"; outcome?: Outcome } = {}): AiEvent {
  const now = Date.now()
  const tier = tierOf(b.kamera)
  const uplink = uplinkOf(b.kamera)
  const { lag, queued } = syncLag(uplink, tier, b.t, rand)
  const waktu = new Date(b.t)
  const shift = shiftOf(waktu, b.site)
  const sla = rules.ackSlaMinutes[b.severity]
  const outcome = opts.outcome ?? pick(rand, outcomeOdds[b.kategori])
  const [lo, hi] = confidenceBand[outcome]
  const e: AiEvent = {
    id: b.id,
    kategori: b.kategori,
    judul: b.judul,
    site: b.site,
    zona: { id: b.zona, label: zonaById(b.zona)?.nama ?? b.zona },
    kamera: b.kamera.id,
    tier,
    perangkat: b.kamera.perangkat ?? "",
    uplink,
    detektor: kategoriDef(b.kategori).detektor,
    ...(b.plat ? { plat: b.plat } : {}),
    severity: b.severity,
    confidence: Math.round((lo + rand() * (hi - lo)) * 100) / 100,
    shift,
    waktu,
    diterima: new Date(b.t + lag * 1000),
    syncLagDetik: lag,
    workflow: "new",
    slaMenit: sla,
    thumbnail: queued ? "queued" : "synced",
    clip: "on-edge",
    caseIds: [],
    actionIds: [],
    simulasi: true,
  }
  const state = opts.forced ?? workflowForAge((now - b.t) / MINUTE, rand)
  if (state === "new") return e
  // Night shifts acknowledge slower: the gap the night-SLA rule looks for.
  const night = /malam/.test(shift) ? 1.25 : 1
  const ackMin = sla * (0.15 + rand()) * night
  const names = reviewerNames(b.site)
  e.ackAt = new Date(Math.min(now - MINUTE, b.t + lag * 1000 + ackMin * MINUTE))
  e.ackBy = names[Math.floor(rand() * names.length)]
  if (state !== "done") {
    e.workflow = state
    return e
  }
  const at = new Date(Math.min(now - MINUTE, e.ackAt.getTime() + (5 + rand() * 115) * MINUTE))
  const reasons = kategoriRationales[b.kategori]?.[outcome] ?? rationales[outcome]
  const f: Finding = {
    id: `TMN-${b.id}`,
    eventId: b.id,
    outcome,
    rationale: reasons[Math.floor(rand() * reasons.length)],
    reviewer: e.ackBy,
    at,
    simulasi: true,
  }
  findings.set(f.id, f)
  e.findingId = f.id
  e.workflow = outcome === "confirmed" ? "review-completed" : "resolved"
  if (b.severity !== "rendah" && rand() < 0.12) e.clip = "available"
  return e
}

const generated = new Map<string, AiEvent[]>()

/** Non-PPE indications of a site: 60 days, from the cameras that were watching at the time. */
function generatedOf(site: string) {
  let rows = generated.get(site)
  if (rows) return rows
  const rand = seeded(`indikasi|${site}`)
  const kode = siteById(site)?.kode ?? site
  const now = Date.now()
  const zones = zonesOfSite(site).filter((z) => camerasAt(site, z.id).length)
  rows = []
  let no = 0
  for (let d = 59; d >= 0; d--) {
    const day = new Date(now)
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - d)
    for (const z of zones) {
      const risiko = z.risiko ?? "sedang"
      const n = Math.floor(zoneRate[risiko] * (0.5 + rand()) + rand())
      for (let i = 0; i < n; i++) {
        const t = day.getTime() + rand() * DAY
        const cams = camerasAt(site, z.id).filter((k) => cameraEmits(k, t))
        if (t > now || !cams.length) continue
        const kamera = cams[Math.floor(rand() * cams.length)]
        const kategori = pick(rand, zoneKategori(z.id, risiko))
        const v = variantFor(kategori, site, risiko, t, rand)
        const e = complete(
          { id: `IND-${kode}-${String(++no).padStart(4, "0")}`, kategori, judul: v?.judul ?? kategoriDef(kategori).label, site, zona: z.id, kamera, severity: v?.severity ?? severityFor(kategori, risiko, rand), t, plat: v?.plat },
          rand,
        )
        if (e.diterima.getTime() <= now) rows.push(e)
      }
    }
  }
  for (const s of storyEvents().filter((x) => x.site === site)) {
    const kamera = master().kamera.find((k) => k.id === s.kamera)
    if (!kamera) continue
    const v = variantFor(s.kategori, site, zonaById(kamera.zona)?.risiko ?? "sedang", s.at, seeded(`${s.id}|v`), s.severity)
    rows.push(complete({ id: s.id, kategori: s.kategori, judul: v?.judul ?? kategoriDef(s.kategori).label, site, zona: kamera.zona, kamera, severity: s.severity, t: s.at, plat: v?.plat }, seeded(s.id), { forced: s.reviewed ? undefined : "new" }))
  }
  rows.sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
  generated.set(site, rows)
  return rows
}

// ---- PPE: the APD violations, wrapped ----

const wrapped = new Map<string, AiEvent>()

const statusFor = (w: Workflow): ViolationStatus => (w === "new" ? "open" : pendingReview.includes(w) ? "acknowledged" : "closed")

function wrap(v: Violation): AiEvent {
  let e = wrapped.get(v.id)
  if (e) return e
  const rand = seeded(`ppe|${v.id}`)
  const kamera = master().kamera.find((k) => k.id === v.kamera) ?? ({ id: v.kamera } as Kamera)
  const forced: Workflow | "done" = v.status === "open" ? "new" : v.status === "acknowledged" ? (rand() < 0.6 ? "acknowledged" : "in-review") : "done"
  e = complete({ id: v.id, kategori: "apd", judul: violationTitle(v), site: v.site, zona: v.zona.id, kamera, severity: severityOf(v), t: v.waktu.getTime() }, rand, { forced })
  e.bukti = v.bukti
  wrapped.set(v.id, e)
  return e
}

/** Keeps the APD violation's simple status in step with the workflow. */
function syncViolation(e: AiEvent) {
  if (e.kategori !== "apd") return
  const v = ppeRecords(e.site).find((x) => x.id === e.id)
  if (v) v.status = statusFor(e.workflow)
}

// ---- Reading ----

const caseSeeds = new Map<string, SiteStore>()

/** Every indication of a site, newest first. The first call also seeds the site's cases, which link indications. */
export function indicationsOf(site: string) {
  const list = [...generatedOf(site), ...ppeRecords(site).map(wrap)].sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
  if (!caseSeeds.has(site)) {
    const seed = seedCases(site, list, findingOf)
    caseSeeds.set(site, seed)
    for (const e of list) if (e.caseIds.length) syncViolation(e)
  }
  return list
}

/** The site's cases and actions, for data/kasus.ts. */
export function caseSeedOf(site: string) {
  if (!caseSeeds.has(site)) indicationsOf(site)
  return caseSeeds.get(site)!
}

export type IndikasiFilters = Filters & { workflow?: string }

const keeps = (f: IndikasiFilters) => {
  const here = inPlace(f)
  return (e: AiEvent) =>
    here(e.site, e.zona.id) &&
    (f.shift === "all" || e.shift === f.shift) &&
    (f.severity === "all" || e.severity === f.severity) &&
    (!f.kategori || f.kategori === "all" || e.kategori === f.kategori) &&
    (!f.workflow || f.workflow === "all" || e.workflow === f.workflow)
}

/** Indications detected in the period that match the filters, newest first, as stored (not copies). */
export function indicationsIn(f: IndikasiFilters, { from }: { from?: number } = {}) {
  const start = from ?? periodStart(f.periode, Date.now())
  const keep = keeps(f)
  return sitesIn(f)
    .flatMap(indicationsOf)
    .filter((e) => e.waktu.getTime() >= start && keep(e))
    .sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
}

export const getIndications = (f: IndikasiFilters) => respond(f, () => indicationsIn(f).map(placed(f)), [] as AiEvent[])

export const findStoredIndication = (id: string) => findStored(id)

function findStored(id: string) {
  for (const s of master().site) {
    const e = indicationsOf(s.id).find((x) => x.id === id)
    if (e) return e
  }
  return undefined
}

/** Looks an indication up on any site, whatever the filters. */
export function findIndication(f: Pick<Filters, "site">, id: string) {
  const e = findStored(id)
  return e && placed(f)(e)
}

export const findingOf = (e: Pick<AiEvent, "findingId">) => (e.findingId ? findings.get(e.findingId) : undefined)
export const findingById = (id: string) => findings.get(id)

/** Convert an indication and its review outcome into the shared rules-engine shape. */
export function toRule(e: AiEvent): RuleEvent {
  const finding = findingOf(e)
  return {
    id: e.id,
    site: e.site,
    zona: e.zona.id,
    kategori: e.kategori,
    detektor: e.detektor,
    severity: e.severity,
    workflow: e.workflow,
    t: e.waktu.getTime(),
    ackAt: e.ackAt?.getTime(),
    shift: e.shift,
    outcome: finding?.outcome,
    reviewedAt: finding?.at.getTime(),
  }
}

/** The findings of these indications, current ones only (a superseded finding is not counted twice). */
export const findingsFor = (events: AiEvent[]) => events.flatMap((e) => (e.findingId ? [findings.get(e.findingId)!] : []))

/** Kritis first, then the oldest still waiting. */
export const byPriority = (a: AiEvent, b: AiEvent) => severityMeta[a.severity].rank - severityMeta[b.severity].rank || a.waktu.getTime() - b.waktu.getTime()

// ---- Audit ----

const fmtLag = (s: number) => (s < 120 ? tr(`${s} detik`, `${s} s`) : tr(`${Math.round(s / 60)} menit`, `${Math.round(s / 60)} min`))

function derived(e: AiEvent): AuditEntry[] {
  const list: AuditEntry[] = [
    { at: e.waktu, aktor: tr("Sistem", "System"), aksi: tr(`Terdeteksi oleh ${e.detektor} di ${e.perangkat || e.kamera}`, `Detected by ${e.detektor} on ${e.perangkat || e.kamera}`) },
    { at: e.diterima, aktor: tr("Sistem", "System"), aksi: tr(`Diterima di control room lewat ${e.uplink || "jaringan site"}, jeda ${fmtLag(e.syncLagDetik)}`, `Received in the control room over ${e.uplink || "the site network"}, lag ${fmtLag(e.syncLagDetik)}`) },
  ]
  if (e.ackAt) list.push({ at: e.ackAt, aktor: e.ackBy ?? "—", aksi: "Acknowledge", dari: "new", ke: "acknowledged" })
  const f = findingOf(e)
  if (f) list.push({ at: f.at, aktor: f.reviewer, aksi: tr("Review selesai", "Review completed"), ke: f.outcome, catatan: f.rationale })
  return list
}

export const auditOfIndication = (e: AiEvent) => auditTrail(e.id, () => derived(e))

// ---- Workflow (mock API) ----

const delay = () => new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 300))

/** The signed-in user, if their role may do this; otherwise the error the API would answer with. */
export function authorize(action: WorkflowAction, ownerId?: string) {
  const user = currentUser()
  if (!user) throw new ApiError(401, tr("Sesi sudah berakhir.", "The session has ended."))
  if (!can(user.role, action, ownerId ? { userId: user.id, ownerId } : undefined)) {
    const who = rolesThatCan(action)
      .filter((r: Role) => r !== "super-admin")
      .map((r) => roleLabel[r])
      .join(", ")
    throw new ApiError(403, tr(`${workflowActionLabel[action]} hanya bisa dilakukan oleh ${who}.`, `${workflowActionLabel[action]} can only be done by ${who}.`))
  }
  return user
}

function stored(id: string) {
  const e = findStored(id)
  if (!e) throw new ApiError(404, tr(`Indikasi ${id} tidak ditemukan.`, `Indication ${id} not found.`))
  return e
}

/**
 * Moves the workflow and appends to the audit trail. `trail` is the history taken before the
 * caller changed anything, so a derived entry isn't recorded twice.
 */
function move(e: AiEvent, trail: AuditEntry[], to: Workflow, aktor: string, aksi: string, catatan?: string) {
  const dari = e.workflow
  e.workflow = to
  syncViolation(e)
  record("indikasi", e.id, () => trail, { at: new Date(), aktor, aksi, dari, ke: to, catatan })
}

/** New → Acknowledged. Acknowledged means taken up for review, not that it is valid. */
export async function acknowledge(ids: string[]) {
  const user = authorize("acknowledge")
  await delay()
  return ids.map((id) => {
    const e = stored(id)
    if (e.workflow !== "new") throw new ApiError(409, tr(`${id} sudah di-acknowledge.`, `${id} is already acknowledged.`))
    const trail = auditOfIndication(e)
    e.ackAt = new Date()
    e.ackBy = user.nama
    move(e, trail, "acknowledged", user.nama, "Acknowledge")
    return e
  })
}

/** Takes the indication into review; acknowledges it first when nobody has. */
export async function startReview(id: string) {
  const user = authorize("review")
  await delay()
  const e = stored(id)
  if (!["new", "acknowledged"].includes(e.workflow)) throw new ApiError(409, tr(`${id} tidak menunggu review.`, `${id} is not waiting for review.`))
  const trail = auditOfIndication(e)
  if (!e.ackAt) {
    e.ackAt = new Date()
    e.ackBy = user.nama
  }
  move(e, trail, "in-review", user.nama, tr("Mulai review", "Review started"))
  return e
}

/**
 * Saves the review outcome as a new finding. Confirmed → Review selesai (a case may follow, never
 * automatically); any other outcome → Selesai. A second review supersedes the first.
 */
export async function submitReview(id: string, outcome: Outcome, rationale: string) {
  const user = authorize("review")
  await delay()
  const e = stored(id)
  if (e.workflow === "case-open") throw new ApiError(409, tr("Indikasi ini sudah masuk kasus. Revisi lewat kasusnya.", "This indication is already in a case. Revise it through the case."))
  const text = rationale.trim()
  if (text.length < rules.rationaleMinLength) throw new ApiError(422, tr(`Alasan minimal ${rules.rationaleMinLength} karakter.`, `The reason needs at least ${rules.rationaleMinLength} characters.`))
  const trail = auditOfIndication(e)
  const previous = findingOf(e)
  const f: Finding = {
    id: previous ? `${previous.id.replace(/-r\d+$/, "")}-r${Date.now().toString(36)}` : `TMN-${e.id}`,
    eventId: e.id,
    outcome,
    rationale: text,
    reviewer: user.nama,
    at: new Date(),
    supersedes: previous?.id,
    simulasi: true,
  }
  findings.set(f.id, f)
  e.findingId = f.id
  if (!e.ackAt) {
    e.ackAt = f.at
    e.ackBy = user.nama
  }
  move(e, trail, outcome === "confirmed" ? "review-completed" : "resolved", user.nama, previous ? tr("Review direvisi", "Review revised") : tr("Review selesai", "Review completed"), text)
  record("temuan", f.id, () => [], { at: f.at, aktor: user.nama, aksi: previous ? tr(`Menggantikan ${previous.id}`, `Replaces ${previous.id}`) : tr("Dibuat", "Created"), ke: outcome, catatan: text })
  return { event: e, finding: f }
}

/** Asks the edge for the clip. The thumbnail is already here; the clip only crosses the link on request. */
export async function requestClip(id: string, onReady?: (e: AiEvent) => void) {
  const user = authorize("clip.request")
  await delay()
  const e = stored(id)
  if (e.clip !== "on-edge") return e
  e.clip = "requested"
  record("indikasi", e.id, () => derived(e), { at: new Date(), aktor: user.nama, aksi: tr("Minta klip dari edge", "Clip requested from the edge") })
  // ponytail: the edge exports and uploads in a few seconds; slower on a degraded link.
  const slow = linkWindows(e.uplink, "link-degraded").some((w) => Date.now() >= w.from && Date.now() < w.to)
  setTimeout(
    () => {
      e.clip = "available"
      onReady?.(e)
    },
    slow ? 15_000 : 5_000,
  )
  return e
}

/** For data/kasus.ts: the indication now sits in a case, or its case closed. */
export function linkToCase(id: string, caseId: string, aktor: string) {
  const e = stored(id)
  if (!e.caseIds.includes(caseId)) e.caseIds.push(caseId)
  if (e.workflow !== "case-open") move(e, auditOfIndication(e), "case-open", aktor, tr(`Masuk kasus ${caseId}`, `Added to case ${caseId}`))
}

export function closedWithCase(id: string, caseId: string, aktor: string) {
  const e = stored(id)
  if (e.workflow === "case-open") move(e, auditOfIndication(e), "resolved", aktor, tr(`Kasus ${caseId} ditutup`, `Case ${caseId} closed`))
}

export function linkToAction(id: string, actionId: string) {
  const e = findStored(id)
  if (e && !e.actionIds.includes(actionId)) e.actionIds.push(actionId)
}

// The simple flow on the APD and Event pages moves the same records.
onViolationStatus((v, status, catatan) => {
  const e = wrap(v)
  const user = currentUser()
  const name = user?.nama ?? tr("Sistem", "System")
  const trail = auditOfIndication(e)
  if (status === "acknowledged" && e.workflow === "new") {
    e.ackAt = new Date()
    e.ackBy = name
    move(e, trail, "acknowledged", name, tr("Acknowledge (alur sederhana)", "Acknowledge (simple flow)"))
  }
  if (status === "closed" && pendingReview.includes(e.workflow)) {
    // Closing in the simple flow is a reviewer's call that it was a real violation; it is recorded as one.
    const text = catatan?.trim() || tr("Ditutup dari alur Acknowledge → Close.", "Closed from the Acknowledge → Close flow.")
    const f: Finding = { id: `TMN-${e.id}`, eventId: e.id, outcome: "confirmed", rationale: text, reviewer: name, at: new Date(), simulasi: true }
    findings.set(f.id, f)
    e.findingId = f.id
    if (!e.ackAt) {
      e.ackAt = f.at
      e.ackBy = name
    }
    move(e, trail, "review-completed", name, tr("Ditutup (alur sederhana)", "Closed (simple flow)"), text)
  }
})

