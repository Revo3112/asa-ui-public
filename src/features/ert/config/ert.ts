import { tr } from "@/shared/lib/i18n"
/**
 * Emergency equipment types. The table, filter and due-date status read from here.
 * `intervalHari` is the inspection cycle; within `segeraHari` of the due date an item shows as due soon.
 * The threshold is per type because a monthly SCBA check and a yearly hydrant test can't share one.
 */
export type EquipmentType = { id: string; label: string; intervalHari: number; segeraHari: number }

export const equipmentTypes: EquipmentType[] = [
  { id: "apar", get label() { return tr("APAR", "Extinguisher") }, intervalHari: 180, segeraHari: 30 },
  { id: "hydrant", label: "Hydrant", intervalHari: 365, segeraHari: 30 },
  { id: "scba", label: "SCBA", intervalHari: 30, segeraHari: 7 },
  { id: "p3k", get label() { return tr("Kotak P3K", "First-aid kit") }, intervalHari: 90, segeraHari: 14 },
]

/** Squad roles, in the order cards are shown. */
export const crewRoles = [
  { id: "ketua", get label() { return tr("Ketua regu", "Squad leader") } },
  { id: "pemadam", get label() { return tr("Pemadam", "Firefighter") } },
  { id: "p3k", get label() { return tr("P3K", "First aid") } },
  { id: "evakuasi", get label() { return tr("Evakuasi", "Evacuation") } },
] as const

/** Fewest people on standby per shift before the shift header warns. Same for every site in v1. */
export const MIN_PERSONEL = 6

/** Due dates are compared as calendar dates in the site's time zone, not by the hour. */
export const SITE_TIME_ZONE = "Asia/Jakarta"
