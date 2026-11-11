/**
 * Master data for the factory profile: three industrial sites on fibre, one edge analytics server
 * per site, PPE and environment sensors indoors. The template's original demo data.
 */

import { sensorTypes } from "@/shared/config/lingkungan"
import { demoStream, pabrikCctvStreams } from "@/shared/config/cctv-demo-media"
import type { Kamera, Master, Pengguna, Perangkat, SensorMaster, Site, Zona } from "@/shared/data/master"

export function seedPabrik(): Master {
  const zona: Zona[] = [
    { id: "produksi", kode: "PRD", nama: "Produksi", risiko: "sedang", kapasitas: 60, aktif: true },
    { id: "gudang", kode: "GDG", nama: "Gudang", risiko: "sedang", kapasitas: 25, aktif: true },
    { id: "workshop", kode: "WSP", nama: "Workshop", risiko: "tinggi", kapasitas: 18, aktif: true },
    { id: "loading", kode: "LDK", nama: "Loading Dock", risiko: "tinggi", kapasitas: 15, aktif: true },
    { id: "utilitas", kode: "UTL", nama: "Utilitas", risiko: "sedang", kapasitas: 10, aktif: true },
    { id: "limbah", kode: "TPS", nama: "TPS Limbah B3", risiko: "tinggi", aktif: true },
    { id: "kantor", kode: "KTR", nama: "Kantor", risiko: "rendah", aktif: false },
    { id: "gerbang", kode: "GRB", nama: "Pos Gerbang", risiko: "sedang", kapasitas: 30, aktif: true },
    { id: "spbu", kode: "SPB", nama: "SPBU Internal", risiko: "tinggi", aktif: true },
  ]

  const site: Site[] = [
    {
      id: "cikarang",
      kode: "CKR",
      nama: "Site Cikarang",
      alamat: "Jl. Industri Utama Blok C2, Cikarang Utara, Bekasi",
      zonaWaktu: "Asia/Jakarta",
      zona: ["produksi", "gudang", "workshop", "loading", "utilitas", "gerbang", "spbu"],
      koordinat: [-6.2925, 107.1535],
      aktif: true,
    },
    {
      id: "karawang",
      kode: "KRW",
      nama: "Site Karawang",
      alamat: "Jl. Kawasan Industri Timur Kav. 8, Karawang",
      zonaWaktu: "Asia/Jakarta",
      zona: ["produksi", "gudang", "loading", "gerbang"],
      koordinat: [-6.3615, 107.3335],
      aktif: true,
    },
    {
      id: "balikpapan",
      kode: "BPN",
      nama: "Site Balikpapan",
      alamat: "Jl. Pelabuhan Kariangau No. 21, Balikpapan Barat",
      zonaWaktu: "Asia/Makassar",
      zona: ["gudang", "workshop", "utilitas", "gerbang"],
      koordinat: [-1.1525, 116.7845],
      aktif: true,
    },
  ]

  // One edge analytics server and one fibre uplink per site.
  const perangkat: Perangkat[] = site.flatMap((s): Perangkat[] => [
    { id: `EDGE-${s.kode}`, nama: `Server analitik ${s.nama.replace("Site ", "")}`, jenis: "edge", site: s.id, uplink: `NET-${s.kode}`, aktif: true },
    { id: `NET-${s.kode}`, nama: `Uplink fiber ${s.nama.replace("Site ", "")}`, jenis: "uplink", site: s.id, media: "fiber", aktif: true },
  ])

  // The gate and the fuel station came later, so their cameras are numbered after the first ones.
  const later = ["gerbang", "spbu"]
  let camNo = 0
  const perZone: Record<string, number> = {}
  const camerasOf = (zones: (s: Site) => string[]) =>
    site.flatMap((s) =>
      zones(s).flatMap((z) =>
        Array.from({ length: s.id === "cikarang" && z !== "spbu" ? 3 : 2 }, (_, i): Kamera => {
          const id = `CAM-${String(++camNo).padStart(2, "0")}`
          // Counted per site, so every gate gets a face camera first and a plate camera second.
          const nth = (perZone[`${s.id}|${z}`] = (perZone[`${s.id}|${z}`] ?? -1) + 1)
          return {
            id,
            nama: `${zona.find((x) => x.id === z)!.nama} ${i + 1}`,
            site: s.id,
            zona: z,
            // A detail encode is used where it exists; other cameras reuse the grid source.
            ...demoStream(pabrikCctvStreams, z, nth),
            streamType: "video/mp4",
            tipe: "CCTV tetap",
            perangkat: `EDGE-${s.kode}`,
            // One retired camera, to show the inactive state.
            aktif: id !== "CAM-21",
          }
        }),
      ),
    )
  const kamera: Kamera[] = [...camerasOf((s) => s.zona.filter((z) => !later.includes(z))), ...camerasOf((s) => s.zona.filter((z) => later.includes(z)))]

  const placement: Record<string, Record<string, string[]>> = {
    cikarang: {
      suhu: ["produksi", "gudang", "workshop", "loading", "utilitas"],
      bising: ["produksi", "workshop", "loading"],
      debu: ["gudang", "workshop", "loading"],
      co: ["produksi", "utilitas"],
      oksigen: ["workshop", "utilitas"],
    },
    karawang: { suhu: ["produksi", "gudang", "loading"], bising: ["produksi"], debu: ["gudang", "loading"] },
    balikpapan: { suhu: ["gudang", "workshop", "utilitas"], co: ["utilitas"], oksigen: ["workshop"] },
  }

  const sensor: SensorMaster[] = site.flatMap((s) =>
    sensorTypes.flatMap((type) =>
      (placement[s.id][type.id] ?? []).map((z) => ({
        id: `${type.id}-${s.id}-${z}`,
        nama: `${type.label} ${zona.find((x) => x.id === z)!.nama}`,
        jenis: type.id,
        site: s.id,
        zona: z,
        aktif: true,
      })),
    ),
  )

  const shift = [
    { id: "pagi", nama: "Pagi", mulai: "06:00", selesai: "14:00", aktif: true },
    { id: "siang", nama: "Siang", mulai: "14:00", selesai: "22:00", aktif: true },
    { id: "malam", nama: "Malam", mulai: "22:00", selesai: "06:00", aktif: true },
  ]

  const all = site.map((s) => s.id)
  const pengguna: Pengguna[] = [
    { id: "u-ayu", nama: "Ayu Lestari", email: "ayu@example.com", role: "super-admin", site: [], aktif: true },
    { id: "u-bagus", nama: "Bagus Santoso", email: "bagus@example.com", role: "admin-site", site: ["cikarang"], aktif: true },
    { id: "u-sari", nama: "Sari Wulandari", email: "sari@example.com", role: "admin-site", site: ["karawang", "balikpapan"], aktif: true },
    { id: "u-rina", nama: "Rina Hartati", email: "rina@example.com", role: "hse-officer", site: ["cikarang", "karawang"], aktif: true },
    { id: "u-dimas", nama: "Dimas Prakoso", email: "dimas@example.com", role: "hse-officer", site: ["balikpapan"], aktif: true },
    { id: "u-yosef", nama: "Yosef Manurung", email: "yosef@example.com", role: "viewer", site: ["cikarang"], aktif: true },
    { id: "u-hendra", nama: "Hendra Gunawan", email: "hendra@example.com", role: "viewer", site: ["karawang"], aktif: false },
    ...workflowUsers(all),
  ]

  return { zona, site, kamera, sensor, shift, pengguna, perangkat }
}

/** The operational roles of the review workflow, the same people in both profiles. */
export const workflowUsers = (sites: string[]): Pengguna[] => [
  { id: "u-lukman", nama: "Lukman Hakim", email: "lukman@example.com", role: "site-manager", site: sites, aktif: true },
  { id: "u-maya", nama: "Maya Putri", email: "maya@example.com", role: "hse-manager", site: sites, aktif: true },
  { id: "u-oki", nama: "Oki Pratama", email: "oki@example.com", role: "control-room", site: sites, aktif: true },
  { id: "u-taufik", nama: "Taufik Hidayat", email: "taufik@example.com", role: "area-supervisor", site: sites, aktif: true },
  { id: "u-rizal", nama: "Rizal Siregar", email: "rizal@example.com", role: "area-supervisor", site: sites, aktif: true },
  { id: "u-wulan", nama: "Wulan Rahayu", email: "wulan@example.com", role: "it-ot", site: sites, aktif: true },
]
