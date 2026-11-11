/**
 * Dummy ERT personnel and emergency equipment. Display only in v1: there is no add, edit or
 * "record inspection" yet. `?demo=` works as on Overview.
 */

import { crewRoles, equipmentTypes } from "@/features/ert/config/ert"
import { activeShifts, siteById, siteTimeZone, zonesOfSite } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond, seeded } from "@/shared/data/mock-api"
import { inPlace, placed, sitesIn } from "@/shared/data/scope"

const DAY = 86_400_000

export type Person = {
  id: string
  nama: string
  peran: (typeof crewRoles)[number]["id"]
  site: string
  shift: string
  /** Off-duty people stay listed so the shortfall is visible. */
  status: "siaga" | "izin" | "sakit"
  telepon: string
}

export type Inspection = { tanggal: Date; oleh: string; hasil: string }

export type Equipment = {
  id: string
  kode: string
  jenis: string
  site: string
  zona: Option
  lokasi: string
  terakhir: Date
  berikutnya: Date
  riwayat: Inspection[]
}

export type DueStatus = { kind: "ok" | "segera" | "lewat"; days: number }

/** Whole days since the epoch for the site's calendar date, so 23.59 and 00.01 are a day apart and 08.00 and 17.00 are not. */
const siteDay = (d: Date, site: string) => Date.parse(d.toLocaleDateString("en-CA", { timeZone: siteTimeZone(site) })) / DAY

/** Due status by calendar date in the item's site time zone. `days` is days until due, negative when overdue. */
export function dueStatus(item: Equipment, now: Date): DueStatus {
  const days = siteDay(item.berikutnya, item.site) - siteDay(now, item.site)
  const type = equipmentTypes.find((t) => t.id === item.jenis)
  return { kind: days < 0 ? "lewat" : days <= (type?.segeraHari ?? 30) ? "segera" : "ok", days }
}

const firstNames = [
  "Andi",
  "Budi",
  "Citra",
  "Dewi",
  "Eko",
  "Fajar",
  "Gita",
  "Hendra",
  "Indah",
  "Joko",
  "Kartika",
  "Lukman",
  "Maya",
  "Nanda",
  "Oki",
  "Putri",
  "Rizal",
  "Sinta",
  "Taufik",
  "Wulan",
  "Yudi",
  "Zahra",
  "Agus",
  "Bayu",
]
const lastNames = ["Saputra", "Wijaya", "Lestari", "Pratama", "Siregar", "Nugroho", "Hasibuan", "Purnama", "Sitompul", "Rahayu", "Kurniawan", "Simanjuntak"]
const inspectors = ["Rina Hartati", "Dimas Prakoso", "Yosef Manurung"]
const places: Record<string, string[]> = {
  apar: ["dekat pintu masuk", "koridor utara", "samping panel listrik", "area istirahat"],
  hydrant: ["halaman timur", "sisi gudang"],
  scba: ["lemari ERT"],
  p3k: ["pos keamanan", "ruang kontrol"],
}
// Roles for the eight people of a shift.
const squad = ["ketua", "pemadam", "pemadam", "pemadam", "p3k", "p3k", "evakuasi", "evakuasi"] as const

export function getPersonnel(f: Filters) {
  return respond(
    f,
    () =>
      sitesIn(f).flatMap((site) => {
        const rand = seeded(`ert-personel|${site}`)
        return activeShifts().flatMap((shift) =>
          squad.map((peran, i): Person => {
            const r = rand()
            return {
              id: `${site}-${shift.id}-${i}`,
              nama: `${firstNames[Math.floor(rand() * firstNames.length)]} ${lastNames[Math.floor(rand() * lastNames.length)]}`,
              peran,
              site,
              shift: shift.id,
              status: r < 0.12 ? "izin" : r < 0.2 ? "sakit" : "siaga",
              telepon: `0812${String(Math.floor(rand() * 1e8)).padStart(8, "0")}`,
            }
          }),
        )
      }),
    [] as Person[],
  )
}

export function getEquipment(f: Filters) {
  return respond(
    f,
    () => {
      const now = Date.now()
      const here = inPlace(f)
      return sitesIn(f)
        .flatMap((site) => {
          const rand = seeded(`ert-alat|${site}`)
          const kodeSite = siteById(site)?.kode ?? site
          return zonesOfSite(site).flatMap((zona) =>
            equipmentTypes.flatMap((type) => {
              // Every zone has APAR and a first-aid kit; hydrants and SCBA sit in some zones only.
              const count = type.id === "apar" ? 3 : type.id === "p3k" ? 1 : rand() < 0.6 ? 1 : 0
              return Array.from({ length: count }, (_, i): Equipment => {
                // Most are on schedule; about one in five is overdue, by up to a third of its cycle.
                const age = Math.round(rand() * type.intervalHari * 1.3)
                const terakhir = new Date(now - age * DAY)
                const riwayat = Array.from({ length: 3 }, (_, k) => ({
                  tanggal: new Date(terakhir.getTime() - k * type.intervalHari * DAY),
                  oleh: inspectors[Math.floor(rand() * inspectors.length)],
                  hasil: rand() < 0.8 ? "Baik" : type.id === "apar" ? "Tekanan rendah, sudah diisi ulang" : "Ada komponen diganti",
                }))
                const kode = `${type.label.split(" ")[0].toUpperCase()}-${kodeSite}-${zona.kode}-${String(i + 1).padStart(2, "0")}`
                const pool = places[type.id] ?? ["area kerja"]
                return {
                  id: kode,
                  kode,
                  jenis: type.id,
                  site,
                  zona: { id: zona.id, label: zona.nama },
                  lokasi: pool[Math.floor(rand() * pool.length)],
                  terakhir,
                  berikutnya: new Date(terakhir.getTime() + type.intervalHari * DAY),
                  riwayat,
                }
              })
            }),
          )
        })
        .filter((e) => here(e.site, e.zona.id))
        .map(placed(f))
    },
    [] as Equipment[],
  )
}
