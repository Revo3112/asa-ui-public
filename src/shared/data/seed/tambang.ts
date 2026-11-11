/**
 * Master data for the mining profile: the Berau mine on Starlink backhaul, and the Cilegon
 * processing plant and terminal on fibre. An edge analytics server per site runs the fixed cameras;
 * Aegis Intelligence Poles stand where there is no power or signal (the pit front, the buffer forest
 * beside the plant) and a Manpack is on blasting patrol. Sites are labelled by location only. Camera numbers follow the demo scenarios: CAM-07
 * (fuel area) and CAM-14 (Loading Point 02) are the two offline ones in data/cctv.ts.
 */

import { demoStream, tambangCctvStreams } from "@/shared/config/cctv-demo-media"
import { sensorTypes } from "@/shared/config/lingkungan"
import type { Kamera, Master, Pengguna, Perangkat, SensorMaster, Site, Zona } from "@/shared/data/master"
import { workflowUsers } from "@/shared/data/seed/pabrik"

const DAY = 86_400_000

export function seedTambang(): Master {
  const zona: Zona[] = [
    { id: "jalan-stockpile", kode: "JAS", nama: "Jalan Angkut Stockpile", risiko: "tinggi", aktif: true },
    { id: "hr-03", kode: "HR3", nama: "Haul Road 03", risiko: "tinggi", aktif: true },
    { id: "crusher", kode: "CRS", nama: "Area Crusher", risiko: "tinggi", kapasitas: 12, aktif: true },
    { id: "conveyor", kode: "CNV", nama: "Conveyor & Walkway", risiko: "tinggi", kapasitas: 10, aktif: true },
    { id: "akses-cpp", kode: "CPP", nama: "Akses CPP", risiko: "sedang", kapasitas: 20, aktif: true },
    { id: "zona-terbatas-tangki", kode: "ZTT", nama: "Zona Terbatas Tangki", risiko: "kritis", aktif: true },
    { id: "loading-02", kode: "LP2", nama: "Loading Point 02", risiko: "tinggi", kapasitas: 12, aktif: true },
    { id: "bbm", kode: "BBM", nama: "Area Pengisian BBM", risiko: "tinggi", aktif: true },
    { id: "akses-kantor", kode: "KTR", nama: "Akses Kantor", risiko: "rendah", kapasitas: 40, aktif: true },
    { id: "hutan-penyangga", kode: "HTP", nama: "Hutan Penyangga", risiko: "tinggi", aktif: true },
    { id: "pit-timur", kode: "PFT", nama: "Pit Front Timur", risiko: "kritis", aktif: true },
    { id: "patroli-peledakan", kode: "PPL", nama: "Patroli Peledakan (mobile)", risiko: "tinggi", aktif: true },
    { id: "gudang-sparepart", kode: "GSP", nama: "Gudang Suku Cadang", risiko: "sedang", kapasitas: 15, aktif: true },
  ]

  const site: Site[] = [
    {
      id: "cilegon",
      kode: "CLG",
      nama: "Site Cilegon",
      alamat: "Kawasan Industri, Cilegon, Banten",
      zonaWaktu: "Asia/Jakarta",
      zona: ["jalan-stockpile", "crusher", "conveyor", "zona-terbatas-tangki", "bbm", "hutan-penyangga", "akses-kantor", "gudang-sparepart"],
      koordinat: [-6.0045, 106.0115],
      aktif: true,
    },
    {
      id: "berau",
      kode: "BRU",
      nama: "Site Berau",
      alamat: "Berau, Kalimantan Timur",
      zonaWaktu: "Asia/Makassar",
      zona: ["hr-03", "akses-cpp", "loading-02", "akses-kantor", "pit-timur", "patroli-peledakan", "bbm", "gudang-sparepart"],
      koordinat: [2.1675, 117.4655],
      aktif: true,
    },
  ]

  const now = Date.now()
  const today6 = new Date(now)
  today6.setHours(6, 0, 0, 0)
  const perangkat: Perangkat[] = [
    { id: "FO-01", nama: "Uplink fiber Cilegon", jenis: "uplink", site: "cilegon", media: "fiber", aktif: true },
    { id: "SAT-02", nama: "Terminal Starlink Berau", jenis: "uplink", site: "berau", media: "satelit", aktif: true },
    { id: "EDGE-01", nama: "Server analitik Cilegon", jenis: "edge", site: "cilegon", uplink: "FO-01", aktif: true },
    { id: "EDGE-02", nama: "Server analitik Berau", jenis: "edge", site: "berau", uplink: "SAT-02", aktif: true },
    // Poles and the Manpack carry their own satellite terminal, so each is its own uplink.
    {
      id: "POLE-01",
      nama: "Aegis Intelligence Pole 01",
      jenis: "aegis",
      site: "cilegon",
      zona: "hutan-penyangga",
      media: "satelit",
      dipasang: new Date(now - 18 * DAY).toISOString(),
      aktif: true,
    },
    {
      id: "POLE-02",
      nama: "Aegis Intelligence Pole 02",
      jenis: "aegis",
      site: "berau",
      zona: "pit-timur",
      media: "satelit",
      dipasang: new Date(now - 5 * DAY).toISOString(),
      aktif: true,
    },
    {
      id: "MANPACK-01",
      nama: "Manpack Surveillance 01",
      jenis: "manpack",
      site: "berau",
      zona: "patroli-peledakan",
      media: "satelit",
      dipasang: (today6.getTime() > now ? new Date(today6.getTime() - DAY) : today6).toISOString(),
      aktif: true,
    },
  ]

  const edgeOf = (s: string) => (s === "cilegon" ? "EDGE-01" : "EDGE-02")
  const fixed: [string, string, string][] = [
    ["cilegon", "jalan-stockpile", "Tiang tilt-down"],
    ["berau", "hr-03", "Tiang tetap"],
    ["cilegon", "crusher", "Tiang tetap"],
    ["berau", "akses-cpp", "Tiang tetap"],
    ["cilegon", "zona-terbatas-tangki", "Tiang tilt-down"],
    ["berau", "loading-02", "Tiang tilt-down"],
    ["cilegon", "bbm", "Tiang tetap"],
    ["berau", "akses-kantor", "Tiang tetap"],
    ["cilegon", "conveyor", "Tiang tetap"],
    ["berau", "hr-03", "Tiang tilt-down"],
    ["cilegon", "conveyor", "Tiang tilt-down"],
    ["berau", "akses-cpp", "Tiang tetap"],
    ["cilegon", "zona-terbatas-tangki", "Tiang tilt-down"],
    ["berau", "loading-02", "Tiang tetap"],
    ["cilegon", "crusher", "Tiang tilt-down"],
    ["berau", "akses-kantor", "Tiang tetap"],
    // Added for the gate, fuel-queue and store use cases, numbered after the first sixteen.
    ["cilegon", "bbm", "Tiang tetap"],
    ["berau", "bbm", "Tiang tetap"],
    ["cilegon", "akses-kantor", "Tiang tetap"],
    ["cilegon", "gudang-sparepart", "Dinding"],
    ["berau", "gudang-sparepart", "Dinding"],
  ]
  const count: Record<string, number> = {}
  const nameOf = (z: string) => `${zona.find((x) => x.id === z)!.nama} ${(count[z] = (count[z] ?? 0) + 1)}`
  const nth: Record<string, number> = {}
  const streamOf = (z: string) => demoStream(tambangCctvStreams, z, (nth[z] = (nth[z] ?? -1) + 1))
  const kamera: Kamera[] = [
    ...fixed.map(([s, z, mount], i): Kamera => ({
      id: `CAM-${String(i + 1).padStart(2, "0")}`,
      nama: nameOf(z),
      site: s,
      zona: z,
      ...streamOf(z),
      streamType: "video/mp4",
      tipe: i === 15 ? "CCTV PTZ" : "CCTV tetap",
      mount,
      perangkat: edgeOf(s),
      aktif: true,
    })),
    {
      id: "CAM-P01",
      nama: "Aegis Hutan Penyangga",
      site: "cilegon",
      zona: "hutan-penyangga",
      ...streamOf("hutan-penyangga"),
      streamType: "video/mp4",
      tipe: "PTZ + thermal",
      mount: "Aegis Intelligence Pole 3,5 m",
      perangkat: "POLE-01",
      aktif: true,
    },
    {
      id: "CAM-P02",
      nama: "Aegis Pit Timur",
      site: "berau",
      zona: "pit-timur",
      ...streamOf("pit-timur"),
      streamType: "video/mp4",
      tipe: "PTZ + IR",
      mount: "Aegis Intelligence Pole 3,5 m",
      perangkat: "POLE-02",
      aktif: true,
    },
    {
      id: "CAM-M01",
      nama: "Body cam patroli",
      site: "berau",
      zona: "patroli-peledakan",
      ...streamOf("patroli-peledakan"),
      streamType: "video/mp4",
      tipe: "Body camera",
      mount: "Manpack Surveillance",
      perangkat: "MANPACK-01",
      aktif: true,
    },
  ]

  const placement: Record<string, Record<string, string[]>> = {
    cilegon: { debu: ["jalan-stockpile", "crusher"], bising: ["crusher", "conveyor"], suhu: ["conveyor", "bbm"], co: ["bbm"] },
    berau: { debu: ["hr-03", "loading-02"], bising: ["akses-cpp"], suhu: ["akses-cpp"] },
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

  // Twelve-hour rosters, as at most mines.
  const shift = [
    { id: "siang", nama: "Siang", mulai: "06:00", selesai: "18:00", aktif: true },
    { id: "malam", nama: "Malam", mulai: "18:00", selesai: "06:00", aktif: true },
  ]

  const all = site.map((s) => s.id)
  const pengguna: Pengguna[] = [
    { id: "u-ayu", nama: "Ayu Lestari", email: "ayu@example.com", role: "super-admin", site: [], aktif: true },
    { id: "u-bagus", nama: "Bagus Santoso", email: "bagus@example.com", role: "admin-site", site: ["cilegon"], aktif: true },
    { id: "u-sari", nama: "Sari Wulandari", email: "sari@example.com", role: "admin-site", site: ["berau"], aktif: true },
    { id: "u-rina", nama: "Rina Hartati", email: "rina@example.com", role: "hse-officer", site: all, aktif: true },
    { id: "u-dimas", nama: "Dimas Prakoso", email: "dimas@example.com", role: "hse-officer", site: ["berau"], aktif: true },
    { id: "u-yosef", nama: "Yosef Manurung", email: "yosef@example.com", role: "viewer", site: ["cilegon"], aktif: true },
    { id: "u-hendra", nama: "Hendra Gunawan", email: "hendra@example.com", role: "viewer", site: ["berau"], aktif: false },
    ...workflowUsers(all),
  ]

  return { zona, site, kamera, sensor, shift, pengguna, perangkat }
}
