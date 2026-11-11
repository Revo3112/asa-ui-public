export type DemoCameraStream = { grid: string; detail?: string }

const lpr: DemoCameraStream = { grid: "/CCTV/lpr-grid.mp4", detail: "/CCTV/lpr-hd.mp4" }

/** Curated factory demo footage from public/CCTV, grouped by the area it depicts. */
export const pabrikCctvStreams: Record<string, readonly DemoCameraStream[]> = {
  produksi: [{ grid: "/CCTV/factory_footage.mp4" }, { grid: "/CCTV/construct.mp4" }, { grid: "/CCTV/id_group.mp4" }],
  // Stacked boxes and racks: what the object-change detector watches.
  gudang: [{ grid: "/CCTV/factory_footage.mp4" }, { grid: "/CCTV/id_store%202.mp4" }, { grid: "/CCTV/id_store.mp4" }],
  workshop: [{ grid: "/CCTV/id_chat.mp4" }, { grid: "/CCTV/Constructor.mp4" }, { grid: "/CCTV/dish.mp4" }],
  loading: [{ grid: "/CCTV/id_loading.mp4" }, { grid: "/CCTV/truck_load.mp4" }, { grid: "/CCTV/delivery.mp4", detail: "/CCTV/package_edit.mp4" }],
  utilitas: [{ grid: "/CCTV/asep2.mp4" }, { grid: "/CCTV/Asep1.mp4" }, { grid: "/CCTV/Constructor.mp4" }],
  // Gate: faces at the pedestrian gate, plates on the barrier lane, the crowd at shift change.
  gerbang: [{ grid: "/CCTV/id_group.mp4" }, lpr, { grid: "/CCTV/crowd.mp4" }],
  spbu: [{ grid: "/CCTV/car2.mp4" }, { grid: "/CCTV/car.mp4" }, { grid: "/CCTV/truck_load.mp4" }],
}

/** The mining profile, per zone. Only clips that pass for a mine or a processing plant. */
export const tambangCctvStreams: Record<string, readonly DemoCameraStream[]> = {
  "jalan-stockpile": [{ grid: "/CCTV/truck_load.mp4" }, { grid: "/CCTV/construct.mp4" }],
  "hr-03": [{ grid: "/CCTV/truck_load.mp4" }, { grid: "/CCTV/car.mp4" }],
  crusher: [{ grid: "/CCTV/Constructor.mp4" }, { grid: "/CCTV/asep2.mp4" }],
  conveyor: [{ grid: "/CCTV/Asep1.mp4" }, { grid: "/CCTV/Constructor.mp4" }],
  "akses-cpp": [{ grid: "/CCTV/id_chat.mp4" }, lpr],
  "zona-terbatas-tangki": [{ grid: "/CCTV/asep2.mp4" }, { grid: "/CCTV/Asep1.mp4" }],
  "loading-02": [{ grid: "/CCTV/id_loading.mp4" }, { grid: "/CCTV/truck_load.mp4" }],
  bbm: [{ grid: "/CCTV/car2.mp4" }, { grid: "/CCTV/truck_load.mp4" }, { grid: "/CCTV/car.mp4" }],
  "akses-kantor": [{ grid: "/CCTV/id_group.mp4" }, { grid: "/CCTV/crowd.mp4" }, { grid: "/CCTV/id_chat.mp4" }],
  "gudang-sparepart": [{ grid: "/CCTV/factory_footage.mp4" }, { grid: "/CCTV/id_store%202.mp4" }],
  "hutan-penyangga": [{ grid: "/CCTV/construct.mp4" }],
  "pit-timur": [{ grid: "/CCTV/construct.mp4" }],
  "patroli-peledakan": [{ grid: "/CCTV/id_chat.mp4" }],
}

/** The nth camera of a zone gets the nth clip of that zone, wrapping round. */
export function demoStream(map: Record<string, readonly DemoCameraStream[]>, zona: string, nth: number): { streamUrl: string; streamUrlHd: string } {
  const list = map[zona] ?? [{ grid: "/CCTV/factory_footage.mp4" }]
  const s = list[nth % list.length]!
  return { streamUrl: s.grid, streamUrlHd: s.detail ?? s.grid }
}

/** Only these source videos are copied into production builds. */
export const publicCctvStreams = [
  ...new Set([...Object.values(pabrikCctvStreams), ...Object.values(tambangCctvStreams)].flatMap((streams) => streams.flatMap(({ grid, detail }) => (detail ? [grid, detail] : [grid])))),
]
