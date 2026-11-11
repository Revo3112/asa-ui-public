/**
 * The seeded cases and actions of a site. Built by data/indikasi.ts the first time it lists a
 * site's indications, so an indication shows "Kasus terbuka" whichever page loads first; the
 * registers and the workflow live in data/kasus.ts.
 */

import type { Severity } from "@/shared/config/events"
import { kategoriDef, type ActionStatus, type CaseStatus, type Kategori } from "@/shared/config/indikasi"
import type { AiEvent, Finding } from "@/features/indications/data/indikasi"
import { master, siteById, zonaById, type Pengguna } from "@/shared/data/master"
import type { Option } from "@/shared/data/filters"
import { seeded } from "@/shared/data/mock-api"
import { healthEvents } from "@/shared/data/skenario"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type Kasus = {
  id: string
  site: string
  zona: Option
  judul: string
  jenis: string
  prioritas: Severity
  status: CaseStatus
  ownerId: string
  dibuka: Date
  ringkasan: string
  eventIds: string[]
  findingIds: string[]
  actionIds: string[]
  rationaleTutup?: string
  ditutup?: Date
  simulasi: true
}

export type Tindakan = {
  id: string
  judul: string
  site: string
  zona: Option
  caseId?: string
  eventId?: string
  /** A camera or device this action repairs, for maintenance actions with no indication behind them. */
  sumber?: string
  ownerId: string
  dibuat: Date
  tenggat: Date
  status: ActionStatus
  catatanAwal?: string
  catatanSelesai?: string
  buktiRef?: string
  verifierId?: string
  diverifikasi?: Date
  alasanBatal?: string
  simulasi: true
}

const jenisOf: Record<Kategori, string> = {
  apd: "Kepatuhan APD",
  "zona-terlarang": "Tinjauan zona terlarang",
  "orang-tak-dikenal": "Tinjauan akses orang",
  "kendaraan-tak-terdaftar": "Tinjauan akses kendaraan",
  "perubahan-objek": "Tinjauan penataan barang",
}

const actionTitles: Record<Kategori, string[]> = {
  apd: ["Sosialisasi ulang kewajiban APD di area", "Sediakan stok APD di pos masuk", "Pemeriksaan APD harian oleh pengawas"],
  "zona-terlarang": ["Periksa integritas barikade dan rambu akses", "Tinjau izin akses zona terbatas", "Briefing keselamatan untuk kontraktor"],
  "orang-tak-dikenal": ["Perketat pemeriksaan kartu di pos gerbang", "Daftarkan ulang wajah kontraktor baru", "Tinjau prosedur pendampingan tamu"],
  "kendaraan-tak-terdaftar": ["Lengkapi daftar kendaraan vendor", "Briefing petugas gerbang soal daftar hitam", "Pasang palang otomatis di jalur masuk"],
  "perubahan-objek": ["Tata ulang tumpukan sesuai batas tinggi", "Periksa kondisi palet dan rak", "Tandai ulang lokasi penyimpanan di lantai"],
}

const completionNotes = ["Selesai; foto bukti terlampir.", "Sudah dilaksanakan bersama pengawas shift.", "Dikerjakan dan dicek ulang di lapangan."]

// ---- People ----

const usersWith = (role: Pengguna["role"], site: string) => master().pengguna.filter((u) => u.aktif && u.role === role && (u.role === "super-admin" || u.site.includes(site)))
export const userName = (id: string) => master().pengguna.find((u) => u.id === id)?.nama ?? id

function ownersFor(site: string) {
  const supervisors = usersWith("area-supervisor", site)
  const officers = usersWith("hse-officer", site)
  return { action: [...supervisors, ...officers.slice(0, 1)], hse: usersWith("hse-manager", site)[0] ?? officers[0], itot: usersWith("it-ot", site)[0] }
}

// ---- Seed ----

export type SiteStore = { cases: Kasus[]; actions: Tindakan[] }

function pick<T>(rand: () => number, weighted: [T, number][]) {
  let r = rand() * weighted.reduce((sum, [, w]) => sum + w, 0)
  for (const [value, w] of weighted) if ((r -= w) < 0) return value
  return weighted[weighted.length - 1][0]
}

function caseStatusForAge(days: number, rand: () => number): CaseStatus {
  if (days > 10)
    return pick(rand, [
      ["closed", 0.55],
      ["pending-verification", 0.15],
      ["action-required", 0.3],
    ])
  if (days > 3)
    return pick(rand, [
      ["closed", 0.2],
      ["action-required", 0.4],
      ["investigating", 0.15],
      ["pending-verification", 0.25],
    ])
  return pick(rand, [
    ["open", 0.4],
    ["investigating", 0.35],
    ["action-required", 0.25],
  ])
}

/**
 * Opens cases for most Kritis confirmed findings and a few Tinggi ones from the last 30 days, with
 * their actions, plus maintenance actions for the sources that are down. Links the indications to
 * them as it goes.
 */
export function seedCases(site: string, events: AiEvent[], findingOf: (e: AiEvent) => Finding | undefined): SiteStore {
  const store: SiteStore = { cases: [], actions: [] }
  const rand = seeded(`kasus|${site}`)
  const kode = siteById(site)?.kode ?? site
  const now = Date.now()
  const people = ownersFor(site)
  let caseNo = 0
  let actionNo = 0
  const nextAction = () => `TND-${kode}-${String(++actionNo).padStart(3, "0")}`

  // Confirmed findings from the last 30 days that a person would open a case for, oldest first.
  const candidates = events
    .filter((e) => {
      const f = findingOf(e)
      if (!f || f.outcome !== "confirmed" || now - e.waktu.getTime() > 30 * DAY) return false
      const r = rand()
      return e.severity === "kritis" ? r < 0.5 : e.severity === "tinggi" && e.kategori !== "apd" ? r < 0.1 : false
    })
    .reverse()

  for (const e of candidates) {
    const f = findingOf(e)!
    // A second confirmed finding at the same zone and category within a day joins the open case.
    const joined = store.cases.find((c) => c.zona.id === e.zona.id && c.jenis === jenisOf[e.kategori] && c.eventIds.length < 3 && e.waktu.getTime() - c.dibuka.getTime() < DAY)
    if (joined) {
      joined.eventIds.push(e.id)
      joined.findingIds.push(f.id)
      link(e, joined.id, joined.status === "closed")
      continue
    }
    const dibuka = new Date(Math.min(now - MINUTE, f.at.getTime() + (10 + rand() * 80) * MINUTE))
    const status = caseStatusForAge((now - dibuka.getTime()) / DAY, rand)
    const id = `KSS-${kode}-${String(++caseNo).padStart(3, "0")}`
    const kasus: Kasus = {
      id,
      site,
      zona: e.zona,
      judul: `${kategoriDef(e.kategori).label} · ${e.zona.label}`,
      jenis: jenisOf[e.kategori],
      prioritas: e.severity,
      status,
      ownerId: people.hse?.id ?? "",
      dibuka,
      ringkasan: `Dibuka dari temuan terkonfirmasi ${f.id} di ${e.zona.label}.`,
      eventIds: [e.id],
      findingIds: [f.id],
      actionIds: [],
      simulasi: true,
    }
    link(e, id, status === "closed")
    store.cases.push(kasus)

    const actionCount = status === "open" ? 0 : status === "investigating" ? (rand() < 0.5 ? 1 : 0) : 1 + (rand() < 0.4 ? 1 : 0)
    const titles = actionTitles[e.kategori]
    for (let i = 0; i < actionCount; i++) {
      const dibuat = new Date(Math.min(now - MINUTE, dibuka.getTime() + (30 + rand() * 300) * MINUTE))
      // Most get a few days; some of the older ones have slipped past theirs.
      const tenggat = new Date(dibuat.getTime() + (1 + Math.floor(rand() * 5)) * DAY)
      const owner = people.action[Math.floor(rand() * people.action.length)]
      const aStatus: ActionStatus =
        status === "closed"
          ? rand() < 0.9
            ? "verified"
            : "cancelled"
          : status === "pending-verification"
            ? "pending-verification"
            : status === "action-required"
              ? rand() < 0.5
                ? "assigned"
                : "in-progress"
              : "assigned"
      const a: Tindakan = {
        id: nextAction(),
        judul: titles[(i + Math.floor(rand() * titles.length)) % titles.length],
        site,
        zona: e.zona,
        caseId: id,
        eventId: e.id,
        ownerId: owner?.id ?? "",
        dibuat,
        tenggat,
        status: aStatus,
        catatanAwal: "Tindak lanjut dari kasus.",
        simulasi: true,
      }
      if (aStatus === "pending-verification" || aStatus === "verified") {
        a.catatanSelesai = completionNotes[Math.floor(rand() * completionNotes.length)]
        a.buktiRef = `BUKTI-${a.id}`
      }
      if (aStatus === "verified") {
        a.verifierId = people.hse?.id
        a.diverifikasi = new Date(Math.min(now - MINUTE, tenggat.getTime() - rand() * DAY))
      }
      if (aStatus === "cancelled") a.alasanBatal = "Digabung dengan tindakan lain di kasus yang sama."
      store.actions.push(a)
      kasus.actionIds.push(a.id)
      e.actionIds.push(a.id)
    }
    if (status === "closed") {
      kasus.ditutup = new Date(Math.max(...store.actions.filter((a) => a.caseId === id).map((a) => (a.diverifikasi ?? a.dibuat).getTime()), dibuka.getTime() + DAY))
      kasus.rationaleTutup = "Semua tindakan terverifikasi; briefing area sudah dilakukan."
    }
  }

  // Maintenance for the sources that are down right now, owned by IT/OT.
  for (const h of healthEvents().filter((x) => !x.restoredAt && ["camera-offline", "power-low"].includes(x.kind))) {
    const kamera = master().kamera.find((k) => k.id === h.source)
    const device = master().perangkat.find((p) => p.id === h.source)
    const at = kamera?.site ?? device?.site
    if (at !== site || !people.itot) continue
    const zona = kamera?.zona ?? device?.zona ?? ""
    store.actions.push({
      id: nextAction(),
      judul: h.kind === "power-low" ? `Isi ulang atau tukar baterai ${h.source}` : `Periksa daya dan stream ${h.source}`,
      site,
      zona: { id: zona, label: zonaById(zona)?.nama ?? zona },
      sumber: h.source,
      ownerId: people.itot.id,
      dibuat: new Date(h.startedAt.getTime() + 10 * MINUTE),
      tenggat: new Date(h.startedAt.getTime() + (h.kind === "power-low" ? 8 : 24) * HOUR),
      status: h.kind === "power-low" ? "in-progress" : "assigned",
      catatanAwal: h.reason,
      simulasi: true,
    })
  }
  store.cases.sort((a, b) => b.dibuka.getTime() - a.dibuka.getTime())
  store.actions.sort((a, b) => b.dibuat.getTime() - a.dibuat.getTime())
  return store
}


function link(e: AiEvent, caseId: string, closed: boolean) {
  e.caseIds.push(caseId)
  e.workflow = closed ? "resolved" : "case-open"
}
