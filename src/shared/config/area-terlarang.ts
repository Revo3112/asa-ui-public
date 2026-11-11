/**
 * Restricted areas on a camera's view: either the whole frame (a room nobody may enter) or one or
 * more polygons drawn on it (around a tank, a loading point, the edge of a forest). Each area can
 * apply at certain hours only.
 *
 * Points are percentages of the frame (0–100), so an area still fits when the resolution or the
 * sub-stream changes. ponytail: in production the edge (Axxon One) runs the zone; this is where it
 * is drawn and shown, and the shapes are pushed to or read from the VMS.
 */

import { tr } from "@/shared/lib/i18n"

export type Point = [number, number]
export type ZoneArea = { id: string; nama: string; points: Point[]; jam?: { mulai: string; selesai: string } }
export type AreaTerlarang = { mode: "seluruh" | "area"; areas: ZoneArea[] }

/** Only cameras running the restricted-zone use case get areas. */
export const usesRestricted = (fungsi?: string[]) => !!fungsi?.includes("zona-terlarang")

export const fullFrame: Point[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
]

export const newAreaId = () => `AR-${Math.random().toString(36).slice(2, 7)}`

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Whether the area applies at this time. No hours means always; 18:00–06:00 wraps past midnight. */
export function isAreaActive(a: ZoneArea, at = new Date()) {
  if (!a.jam) return true
  const now = at.getHours() * 60 + at.getMinutes()
  const [from, to] = [minutes(a.jam.mulai), minutes(a.jam.selesai)]
  return from <= to ? now >= from && now < to : now >= from || now < to
}

/**
 * Example areas for the demo cameras, from their zone: sealed rooms and tank farms are restricted
 * whole-frame, the rest get a shape over the part of the view that matters. The buffer forest only
 * at night.
 */
export function defaultArea(kameraId: string, zona: string, fungsi: string[]): AreaTerlarang | undefined {
  if (!usesRestricted(fungsi)) return undefined
  if (/terbatas|limbah/.test(zona)) return { mode: "seluruh", areas: [{ id: `${kameraId}-A1`, nama: tr("Seluruh area kamera", "Whole camera view"), points: fullFrame }] }
  // Roads and work areas: the lane vehicles use, where nobody should walk.
  const lane = /haul|loading|conveyor|crusher|bbm|stockpile|workshop|hr-/.test(zona)
  if (lane)
    return {
      mode: "area",
      areas: [
        {
          id: `${kameraId}-A1`,
          nama: tr("Jalur kendaraan", "Vehicle lane"),
          points: [
            [38, 42],
            [62, 42],
            [80, 100],
            [20, 100],
          ],
        },
      ],
    }
  return {
    mode: "area",
    areas: [
      {
        id: `${kameraId}-A1`,
        nama: /hutan/.test(zona) ? tr("Batas hutan", "Forest edge") : tr("Area terlarang", "Restricted area"),
        points: [
          [8, 48],
          [36, 44],
          [30, 96],
          [4, 96],
        ],
        ...(/hutan/.test(zona) ? { jam: { mulai: "18:00", selesai: "06:00" } } : {}),
      },
    ],
  }
}

/** Cameras running the object-change use case get reference areas: the stacks and racks to watch. */
export const usesAcuan = (fungsi?: string[]) => !!fungsi?.includes("perubahan-objek")

/**
 * Example reference areas for store cameras: two stacks and a rack. Checked outside the hours goods
 * are normally moved, so a scheduled pick-up doesn't raise an indication.
 */
export function defaultAcuan(kameraId: string, fungsi: string[]): AreaTerlarang | undefined {
  if (!usesAcuan(fungsi)) return undefined
  return {
    mode: "area",
    areas: [
      { id: `${kameraId}-R1`, nama: tr("Tumpukan palet A", "Pallet stack A"), points: [[52, 30], [74, 30], [74, 70], [52, 70]] },
      { id: `${kameraId}-R2`, nama: tr("Tumpukan palet B", "Pallet stack B"), points: [[76, 22], [96, 22], [96, 62], [76, 62]] },
      { id: `${kameraId}-R3`, nama: tr("Rak penyimpanan", "Storage rack"), points: [[6, 20], [30, 20], [30, 58], [6, 58]], jam: { mulai: "17:00", selesai: "07:00" } },
    ],
  }
}

/** Why a camera's reference areas can't be saved yet, if anything. */
export const acuanProblem = (area?: AreaTerlarang) =>
  !area?.areas.length ? tr("Tentukan area acuan: gambar minimal satu tumpukan atau rak, atau pilih seluruh gambar kamera.", "Set the reference area: draw at least one stack or rack, or pick the whole camera view.") : area.areas.some((a) => !a.nama.trim()) ? tr("Setiap area acuan perlu nama.", "Every reference area needs a name.") : undefined

/** Why a camera's areas can't be saved yet, if anything. */
export const areaProblem = (area?: AreaTerlarang) =>
  !area?.areas.length ? tr("Tentukan area terlarang: gambar minimal satu area, atau pilih seluruh gambar kamera.", "Set the restricted area: draw at least one, or pick the whole camera view.") : area.areas.some((a) => !a.nama.trim()) ? tr("Setiap area terlarang perlu nama.", "Every restricted area needs a name.") : undefined
