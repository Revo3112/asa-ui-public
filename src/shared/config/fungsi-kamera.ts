/**
 * What a camera is used for: the analytics models the edge runs on its stream. One camera can run
 * several, e.g. PPE and restricted-zone entry on the same view. The active ones are the detection
 * categories of the review workflow; the planned ones are models that are not connected yet, listed
 * so a camera can be registered for them now and picked up once the model is live.
 *
 * ponytail: the edge reads this list to decide which models to run per stream. In the mock it is
 * stored and shown only; indications are still generated per zone.
 */

import type { Severity } from "@/shared/config/events"
import { kategoriDefs, type Kategori } from "@/shared/config/indikasi"
import { tr } from "@/shared/lib/i18n"

export type FungsiKamera = Kategori | "hitung-orang" | "antrian-kendaraan" | "jatuh" | "asap-api"

export type FungsiDef = { id: FungsiKamera; label: string; status: "aktif" | "rencana" }

export const fungsiDefs: FungsiDef[] = [
  ...kategoriDefs.map((k): FungsiDef => ({ id: k.id, get label() { return k.label }, status: "aktif" })),
  // Counting and queues give numbers, not indications: they show on their pages and alarm past a limit.
  { id: "hitung-orang", get label() { return tr("Hitung & pergerakan orang", "People counting & movement") }, status: "aktif" },
  { id: "antrian-kendaraan", get label() { return tr("Antrian kendaraan", "Vehicle queue") }, status: "aktif" },
  { id: "jatuh", get label() { return tr("Deteksi orang jatuh", "Fall detection") }, status: "rencana" },
  { id: "asap-api", get label() { return tr("Deteksi asap & api", "Smoke & fire detection") }, status: "rencana" },
]

export const fungsiLabel = (id: string) => fungsiDefs.find((f) => f.id === id)?.label ?? id

/** The option text in the camera form: planned models say so, so nobody expects indications from them yet. */
export const fungsiOptionLabel = (f: FungsiDef) => (f.status === "rencana" ? tr(`${f.label} (model menyusul)`, `${f.label} (model coming)`) : f.label)

/** Gates and site entrances: faces are checked here. */
export const isAccessZone = (zona: string) => /akses|gerbang/.test(zona)
/** Where plates are read: gates, loading points and fuel. */
export const isVehicleZone = (zona: string) => /gerbang|bbm|spbu|loading|akses-cpp/.test(zona)
/** Stores where stacks and racks are watched against a reference image. */
export const isStorageZone = (zona: string) => /gudang/.test(zona)
/** Fuel bays, where the queue is measured. */
export const isQueueZone = (zona: string) => /bbm|spbu/.test(zona)
/** Where people are counted: everywhere people work, not roads, tanks, forest or patrol. */
export const isCountingZone = (zona: string) => !/hutan|patroli|tangki|stockpile|hr-|pit-|bbm|spbu/.test(zona)

/**
 * Which zone-based categories a zone produces, with their odds. Restricted-zone entries everywhere,
 * unknown faces at gates, unregistered plates where vehicles pass, object changes in stores. The
 * demo generator draws from this, and new demo cameras get the same categories as their default functions.
 */
export function zoneKategori(zona: string, risiko: Severity): [Kategori, number][] {
  // A sealed tank farm or waste store only ever has entries.
  if (risiko === "kritis" && /terbatas|limbah/.test(zona)) return [["zona-terlarang", 1]]
  const list: [Kategori, number][] = [["zona-terlarang", 1]]
  if (isAccessZone(zona)) list.push(["orang-tak-dikenal", 1.2])
  if (isVehicleZone(zona)) list.push(["kendaraan-tak-terdaftar", 0.9])
  if (isStorageZone(zona)) list.push(["perubahan-objek", 1])
  return list
}

/** PPE runs on every demo camera; the zone categories and the counters follow the zone. */
export const defaultFungsi = (zona: string, risiko: Severity = "sedang"): FungsiKamera[] => [
  "apd",
  ...zoneKategori(zona, risiko).map(([k]) => k),
  ...(isCountingZone(zona) ? (["hitung-orang"] as const) : []),
  ...(isQueueZone(zona) ? (["antrian-kendaraan"] as const) : []),
]
