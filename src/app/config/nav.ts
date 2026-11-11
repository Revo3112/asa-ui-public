import { Building2, Cctv, Clock, Library, Map, Radio, Settings2, Users, type LucideIcon } from "lucide-react"

import type { ModuleId } from "@/shared/config/defaults"
import { moduleDef } from "@/shared/config/modules"
import type { Role } from "@/shared/auth/session"
import { getSettings } from "@/shared/data/settings"
import { tr } from "@/shared/lib/i18n"

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  /** Shown while any of these modules is on. Core items have none. */
  modules?: ModuleId[]
  /** Limits the item to these roles; its route answers 403 for everyone else. */
  roles?: Role[]
}
/**
 * `roles` limits the whole group the same way. A group with a label folds open and shut in the
 * sidebar; `startClosed` sets how it first appears, before the user opens or closes it.
 */
export type NavGroup = { id: string; label?: string; startClosed?: boolean; roles?: Role[]; items: NavItem[] }

const fromModule = (id: ModuleId): NavItem => {
  const m = moduleDef(id)
  // A getter, so the label follows the interface language.
  return {
    to: m.route,
    get label() {
      return m.menu.label
    },
    icon: m.menu.icon,
    modules: [id],
    roles: m.roles,
  }
}

/** Every page, on or off. Routes are made from this list; the sidebar shows what `navFor` lets through. */
export const allGroups: NavGroup[] = [
  { id: "utama", items: [fromModule("overview"), fromModule("keputusan")] },
  { id: "tindak-lanjut", get label() { return tr("Tindak lanjut", "Follow-up") }, items: [fromModule("rekomendasi"), fromModule("indikasi"), fromModule("kasus"), fromModule("tindakan")] },
  { id: "analisis", get label() { return tr("Analisis", "Analysis") }, items: [fromModule("asisten"), fromModule("analisis"), fromModule("kualitas")] },
  // Monitoring is what the data says about safety; Devices is the hardware that produces it.
  { id: "pemantauan", get label() { return tr("Pemantauan", "Monitoring") }, items: [fromModule("ppe"), fromModule("zona-terlarang"), fromModule("akses"), fromModule("kepadatan"), fromModule("kendaraan"), fromModule("perubahan-objek"), fromModule("environment")] },
  { id: "perangkat", get label() { return tr("Perangkat", "Devices") }, items: [fromModule("cctv"), fromModule("sumber")] },
  { id: "respons", get label() { return tr("Respons", "Response") }, items: [fromModule("events"), fromModule("ert")] },
  { id: "demo", label: "Demo", items: [fromModule("panduan")] },
  {
    id: "administrasi",
    get label() { return tr("Administrasi", "Administration") },
    // Setup pages, rarely opened, so the group starts shut.
    startClosed: true,
    roles: ["super-admin", "admin-site"],
    // In the order master data is built: a zone first, then the site that has it, then what sits there.
    items: [
      { to: "/admin/zona", get label() { return tr("Zona", "Zones") }, icon: Map },
      { to: "/admin/site", get label() { return tr("Site", "Sites") }, icon: Building2 },
      // PPE detection runs on camera footage too, so cameras stay managed while either module is on.
      { to: "/admin/kamera", get label() { return tr("Kamera", "Cameras") }, icon: Cctv, modules: ["cctv", "ppe"] },
      { to: "/admin/sensor", get label() { return tr("Sensor", "Sensors") }, icon: Radio, modules: ["environment"] },
      { to: "/admin/shift", get label() { return tr("Shift", "Shifts") }, icon: Clock },
      { to: "/admin/pengguna", get label() { return tr("Pengguna", "Users") }, icon: Users },
      { to: "/admin/pengaturan", get label() { return tr("Pengaturan", "Settings") }, icon: Settings2, roles: ["super-admin"] },
    ],
  },
]

export const footerNav: NavItem[] = [{ to: "/storybook", get label() { return tr("Katalog komponen", "Component catalog") }, icon: Library }]

export const allItems = allGroups.flatMap((group) => group.items)

/** Whether the item's module is on. Role is checked separately. */
export const isItemOn = (item: NavItem) => !item.modules || item.modules.some((id) => getSettings().modules[id])

const allowed = (role: Role) => (x: { roles?: Role[] }) => !x.roles || x.roles.includes(role)

/** The groups this role sees in the sidebar, with switched-off modules left out. */
export const navFor = (role: Role) =>
  allGroups
    .filter(allowed(role))
    .map((g) => ({ ...g, items: g.items.filter((i) => isItemOn(i) && allowed(role)(i)) }))
    .filter((g) => g.items.length)

/** The roles a route is limited to, from its group and the item itself. */
export function rolesFor(to: string) {
  const group = allGroups.find((g) => g.items.some((i) => i.to === to))
  const item = allItems.find((i) => i.to === to)
  return item?.roles ?? group?.roles
}

export const groupOf = (item: NavItem) => allGroups.find((g) => g.items.includes(item))
