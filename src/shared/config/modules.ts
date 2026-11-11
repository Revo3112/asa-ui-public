/**
 * Every business module, registered once. The sidebar, routes, Overview cards, event type filter
 * and live streams all derive from this list; the Modul tab only flips `settings.modules[id]`.
 * Core (login, users, master data, Pengaturan) is not here because it can't be switched off.
 */

import { Ban, Boxes, Car, Cctv, ClipboardCheck, ListChecks, ClipboardList, Compass, FireExtinguisher, FolderOpen, Gauge, HardHat, LayoutDashboard, Lightbulb, RadioTower, ScanEye, ScanFace, Users, ShieldCheck, Sparkles, Thermometer, type LucideIcon } from "lucide-react"

import type { ModuleId } from "@/shared/config/defaults"
import type { EventType } from "@/shared/config/events"
import { allRoles, type Role } from "@/shared/auth/session"
import { getSettings } from "@/shared/data/settings"
import { tr } from "@/shared/lib/i18n"

export type ModuleDef = {
  id: ModuleId
  route: string
  menu: { label: string; icon: LucideIcon }
  roles: Role[]
  /** Overview cards this module contributes, by their label. */
  kpiCards: string[]
  eventTypes: EventType[]
  /** Live streams that are only subscribed while the module is on. */
  wsTopics: string[]
  /** What else goes away, for the confirm dialog. */
  alsoHides?: string
  /** A sentence added after the list of what goes away. */
  note?: string
}

const everyone: Role[] = allRoles

export const moduleDefs: ModuleDef[] = [
  {
    id: "overview",
    route: "/",
    menu: { get label() { return tr("Ringkasan", "Overview") }, icon: LayoutDashboard },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
    get note() { return tr("Halaman awal pindah ke modul aktif pertama.", "The home page moves to the first active module.") },
  },
  {
    id: "keputusan",
    route: "/keputusan",
    menu: { get label() { return tr("Pusat Keputusan", "Decision Center") }, icon: Gauge },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
    get note() { return tr("Kartu keputusan dan antrean prioritas tidak tampil lagi.", "Decision cards and the priority queue no longer show.") },
  },
  {
    id: "indikasi",
    route: "/indikasi",
    menu: { get label() { return tr("Indikasi AI", "AI Indications") }, icon: ScanEye },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
    get alsoHides() { return tr("tautan indikasi dari Pusat Keputusan, Kasus, dan Tindakan Korektif", "indication links from the Decision Center, Cases and Corrective Actions") },
  },
  {
    id: "kasus",
    route: "/kasus",
    menu: { get label() { return tr("Kasus", "Cases") }, icon: FolderOpen },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
    get alsoHides() { return tr("tombol Buka kasus di detail indikasi", "the Open case button in indication detail") },
  },
  {
    id: "tindakan",
    route: "/tindakan",
    menu: { get label() { return tr("Tindakan Korektif", "Corrective Actions") }, icon: ClipboardCheck },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
    get alsoHides() { return tr("tombol Buat tindakan di detail indikasi dan kasus", "the Create action button in indication and case detail") },
  },
  {
    id: "rekomendasi",
    route: "/rekomendasi",
    menu: { get label() { return tr("Rekomendasi", "Recommendations") }, icon: ListChecks },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
  },
  {
    id: "sumber",
    route: "/sumber",
    menu: { get label() { return tr("Kesehatan Perangkat", "Device Health") }, icon: RadioTower },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
  },
  {
    id: "analisis",
    route: "/analisis",
    menu: { get label() { return tr("Analisis Risiko", "Risk Analysis") }, icon: Lightbulb },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
    get alsoHides() { return tr("brief manajemen dan Tanya Asisten", "the management brief and Ask the assistant") },
  },
  {
    id: "kualitas",
    route: "/kualitas",
    menu: { get label() { return tr("Kualitas Deteksi", "Detection Quality") }, icon: ShieldCheck },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
  },
  {
    id: "asisten",
    route: "/asisten",
    menu: { label: "AI Assistant", icon: Sparkles },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
    get note() { return tr("Riwayat percakapan di browser pengguna tetap tersimpan.", "Conversation history in users' browsers is kept.") },
  },
  {
    id: "panduan",
    route: "/panduan",
    menu: { get label() { return tr("Panduan Demo", "Demo Guide") }, icon: Compass },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
    get note() { return tr("Matikan sebelum dashboard dipakai klien.", "Turn off before clients use the dashboard.") },
  },
  {
    id: "ppe",
    route: "/apd",
    menu: { get label() { return tr("Kepatuhan APD", "PPE Compliance") }, icon: HardHat },
    roles: everyone,
    kpiCards: ["Kepatuhan APD", "Pelanggaran hari ini"],
    eventTypes: ["ppe"],
    wsTopics: ["ppe.violation"],
  },
  // One page per AI use case, so each detection has its own menu entry. Same page, different category.
  {
    id: "zona-terlarang",
    route: "/pemantauan/zona-terlarang",
    menu: { get label() { return tr("Zona Terlarang", "Restricted Zone") }, icon: Ban },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
  },
  {
    id: "akses",
    route: "/pemantauan/akses",
    menu: { get label() { return tr("Akses & Identitas", "Access & Identity") }, icon: ScanFace },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
  },
  {
    id: "kepadatan",
    route: "/pemantauan/kepadatan",
    menu: { get label() { return tr("Kepadatan Area", "Area Occupancy") }, icon: Users },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
  },
  {
    id: "kendaraan",
    route: "/pemantauan/kendaraan",
    menu: { get label() { return tr("Kendaraan & Gerbang", "Vehicles & Gates") }, icon: Car },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
  },
  {
    id: "perubahan-objek",
    route: "/pemantauan/perubahan-objek",
    menu: { get label() { return tr("Perubahan Objek", "Object Change") }, icon: Boxes },
    roles: everyone,
    kpiCards: [],
    eventTypes: [],
    wsTopics: [],
  },
  {
    id: "cctv",
    route: "/cctv",
    menu: { get label() { return tr("Monitor CCTV", "CCTV Monitor") }, icon: Cctv },
    roles: everyone,
    kpiCards: ["Kamera online"],
    eventTypes: ["kamera"],
    wsTopics: ["camera.status"],
    get alsoHides() { return tr("highlight kamera pada event", "camera highlights on events") },
  },
  {
    id: "environment",
    route: "/lingkungan",
    menu: { get label() { return tr("Lingkungan", "Environment") }, icon: Thermometer },
    roles: everyone,
    kpiCards: ["Sensor abnormal"],
    eventTypes: ["lingkungan"],
    wsTopics: ["environment.reading", "environment.alarm"],
  },
  {
    id: "events",
    route: "/event",
    menu: { get label() { return tr("Event & laporan", "Events & reports") }, icon: ClipboardList },
    roles: everyone,
    kpiCards: ["Event open"],
    eventTypes: [],
    wsTopics: [],
    get alsoHides() { return tr("tautan dari notifikasi dan drawer ke halaman daftar event", "links from notifications and drawers to the event list") },
  },
  {
    id: "ert",
    route: "/ert",
    menu: { label: "ERT", icon: FireExtinguisher },
    roles: everyone,
    kpiCards: [],
    eventTypes: ["ert"],
    wsTopics: [],
  },
]

export const moduleDef = (id: ModuleId) => moduleDefs.find((m) => m.id === id)!

const active = () => moduleDefs.filter((m) => getSettings().modules[m.id])

export const kpiOn = (label: string) => active().some((m) => m.kpiCards.includes(label))
export const eventTypeOn = (type: EventType) => active().some((m) => m.eventTypes.includes(type))
export const topicOn = (topic: string) => active().some((m) => m.wsTopics.includes(topic))

/** Where a signed-in user lands: Ringkasan, or the first active module when it is off. Null when none is on. */
export const homePath = (role: Role) => active().find((m) => m.roles.includes(role))?.route ?? null

/** One sentence on what switching the module off hides, from the registry. */
export function impactOf(m: ModuleDef) {
  const and = tr(" dan ", " and ")
  const parts = [m.id === "overview" ? tr("halaman Ringkasan", "the Overview page") : tr(`menu ${m.menu.label}`, `the ${m.menu.label} menu`)]
  if (m.kpiCards.length) parts.push(tr(`kartu ${m.kpiCards.map((k) => `“${k}”`).join(and)} di Ringkasan`, `the ${m.kpiCards.map((k) => `“${k}”`).join(and)} cards on Overview`))
  if (m.eventTypes.length) parts.push(tr("tipe event-nya di filter dan notifikasi", "its event types in filters and notifications"))
  if (m.alsoHides) parts.push(m.alsoHides)
  const list = parts.length < 3 ? parts.join(and) : `${parts.slice(0, -1).join(", ")},${and}${parts.at(-1)}`
  return [tr(`Menonaktifkan ${m.menu.label} akan menyembunyikan ${list}.`, `Turning off ${m.menu.label} hides ${list}.`), m.note, tr("Data dan komponennya tidak dihapus.", "Its data and components are not deleted.")].filter(Boolean).join(" ")
}
