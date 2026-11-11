/**
 * Settings a Super Admin changes from Administrasi → Pengaturan: app name, images, the two brand
 * colors, which modules run, and which demo data profile is loaded. These are the values the app falls back to when the API fails,
 * and what "Pulihkan ke bawaan" restores.
 */

import type { Profil } from "@/shared/data/master"

export type ModuleId = "overview" | "ppe" | "cctv" | "ert" | "environment" | "events" | "keputusan" | "indikasi" | "kasus" | "tindakan" | "rekomendasi" | "zona-terlarang" | "akses" | "kepadatan" | "kendaraan" | "perubahan-objek" | "sumber" | "analisis" | "kualitas" | "asisten" | "panduan"

export type AssetRef = {
  /** Mock: a data URL. Real backend: the file's URL. */
  url: string
  mime: string
  /** Bytes. */
  size: number
  width?: number
  height?: number
}

export type Settings = {
  version: 1
  brand: {
    appName: string
    logo: AssetRef | null
    favicon: AssetRef | null
    appIcon: AssetRef | null
  }
  theme: {
    /** #RRGGBB */
    primary: string
    /** #RRGGBB */
    accent: string
  }
  modules: Record<ModuleId, boolean>
  /** The demo data set: a factory or a mine. Goes away once the data comes from a real API. */
  data: { profil: Profil }
  /** ISO 8601 */
  updatedAt: string
  updatedBy: string
}

export const defaultSettings: Settings = {
  version: 1,
  brand: {
    appName: "HSE Monitoring Dashboard",
    logo: { url: "/logo-asa.webp", mime: "image/webp", size: 0, width: 400, height: 400 },
    favicon: null,
    appIcon: null,
  },
  // Harbor blue and amber from the PT Asa Kreasi Interasia palette.
  theme: { primary: "#205478", accent: "#F1AA2F" },
  modules: {
    overview: true,
    ppe: true,
    "zona-terlarang": true,
    akses: true,
    kepadatan: true,
    kendaraan: true,
    "perubahan-objek": true,
    cctv: true,
    ert: true,
    environment: true,
    events: true,
    keputusan: true,
    indikasi: true,
    kasus: true,
    tindakan: true,
    rekomendasi: true,
    sumber: true,
    analisis: true,
    kualitas: true,
    asisten: true,
    panduan: true,
  },
  data: { profil: "pabrik" },
  updatedAt: "2026-10-29T00:00:00.000Z",
  updatedBy: "Bawaan",
}

/**
 * A second client set up the other way round, to show branding and modules change without
 * touching a component. The name is a placeholder and there is no logo, so the app name stands in.
 */
const contohKlien: Settings = {
  ...defaultSettings,
  brand: { appName: "[Nama klien] K3", logo: null, favicon: null, appIcon: null },
  theme: { primary: "#2F6B3F", accent: "#C2571A" },
  modules: {
    overview: true,
    ppe: true,
    "zona-terlarang": false,
    akses: false,
    kepadatan: false,
    kendaraan: false,
    "perubahan-objek": false,
    cctv: false,
    ert: false,
    environment: true,
    events: true,
    keputusan: false,
    indikasi: false,
    kasus: false,
    tindakan: false,
    rekomendasi: false,
    sumber: false,
    analisis: false,
    kualitas: false,
    asisten: false,
    panduan: false,
  },
  updatedBy: "Preset klien contoh",
}

/**
 * A mine: the mining data profile (the Berau mine on Starlink with Aegis poles and a Manpack, the
 * Cilegon processing site on fibre). Live CCTV is on for the demo; on a Starlink site a real build
 * opens the low-resolution sub-stream on demand only, and evidence stays a thumbnail plus a clip.
 */
const pertambangan: Settings = {
  ...defaultSettings,
  // Ringkasan opens on the map of both sites.
  modules: {
    overview: true,
    ppe: true,
    "zona-terlarang": true,
    akses: true,
    kepadatan: true,
    kendaraan: true,
    "perubahan-objek": true,
    cctv: true,
    ert: true,
    environment: true,
    events: true,
    keputusan: true,
    indikasi: true,
    kasus: true,
    tindakan: true,
    rekomendasi: true,
    sumber: true,
    analisis: true,
    kualitas: true,
    asisten: true,
    panduan: true,
  },
  data: { profil: "tambang" },
  updatedBy: "Preset pertambangan",
}

export const presets = [
  { id: "bawaan", label: "Bawaan", settings: defaultSettings },
  { id: "klien-contoh", label: "Klien contoh", settings: contohKlien },
  { id: "pertambangan", label: "Pertambangan", settings: pertambangan },
] as const
