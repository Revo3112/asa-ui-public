import { lazy, Suspense, type ComponentType } from "react"
import { Skeleton } from "@heroui/react"
import { createBrowserRouter } from "react-router"

import { allItems, rolesFor, type NavItem } from "@/app/config/nav"
import { AuthLayout } from "@/features/auth/layouts/auth-layout"
import { DashboardLayout } from "@/app/layouts/dashboard-layout"
import { KameraAdminPage, PenggunaAdminPage, SensorAdminPage, ShiftAdminPage, SiteAdminPage, ZonaAdminPage } from "@/features/admin/pages/admin"
import { LoginPage } from "@/features/auth/pages/login"
import { PlaceholderPage } from "@/app/pages/placeholder"
import { RouteError } from "@/app/pages/route-error"
import { NotFoundPage, RequireModule, RequireRole } from "@/app/pages/status"

/** A page loaded on its first visit, so the first screen doesn't download every page's charts. */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  const Lazy = lazy<ComponentType>(() => load().then((m) => ({ default: m[name] as ComponentType })))
  return () => (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <Lazy />
    </Suspense>
  )
}

const AnalisisPage = page(() => import("@/features/analysis/pages/analisis"), "AnalisisPage")
const ApdPage = page(() => import("@/features/ppe/pages/apd"), "ApdPage")
const AsistenPage = page(() => import("@/features/assistant/pages/asisten"), "AsistenPage")
const CctvPage = page(() => import("@/features/cctv/pages/cctv"), "CctvPage")
const DashboardPage = page(() => import("@/features/overview/pages/dashboard"), "DashboardPage")
const ErtPage = page(() => import("@/features/ert/pages/ert"), "ErtPage")
const EventPage = page(() => import("@/features/events/pages/event"), "EventPage")
const IndikasiPage = page(() => import("@/features/indications/pages/indikasi"), "IndikasiPage")
const KasusPage = page(() => import("@/features/cases/pages/kasus"), "KasusPage")
const KeputusanPage = page(() => import("@/features/decisions/pages/keputusan"), "KeputusanPage")
const KualitasPage = page(() => import("@/features/quality/pages/kualitas"), "KualitasPage")
const LingkunganPage = page(() => import("@/features/environment/pages/lingkungan"), "LingkunganPage")
const SettingsPage = page(() => import("@/features/settings/pages/settings"), "SettingsPage")
const SumberPage = page(() => import("@/features/devices/pages/sumber"), "SumberPage")
const TindakanPage = page(() => import("@/features/actions/pages/tindakan"), "TindakanPage")
const PanduanPage = page(() => import("@/features/guide/pages/panduan"), "PanduanPage")
const RekomendasiPage = page(() => import("@/features/recommendations/pages/rekomendasi"), "RekomendasiPage")
const ZonaTerlarangPage = page(() => import("@/features/detection/pages/use-case"), "ZonaTerlarangPage")
const AksesPage = page(() => import("@/features/access/pages/akses"), "AksesPage")
const KepadatanPage = page(() => import("@/features/occupancy/pages/kepadatan"), "KepadatanPage")
const KendaraanPage = page(() => import("@/features/vehicles/pages/kendaraan"), "KendaraanPage")
const PerubahanObjekPage = page(() => import("@/features/detection/pages/perubahan-objek"), "PerubahanObjekPage")

// Every sidebar entry gets a route; swap PlaceholderPage for the real page as each one is built.
const builtPages: Record<string, () => React.JSX.Element> = {
  "/": DashboardPage,
  "/apd": ApdPage,
  "/pemantauan/zona-terlarang": ZonaTerlarangPage,
  "/pemantauan/akses": AksesPage,
  "/pemantauan/kepadatan": KepadatanPage,
  "/pemantauan/kendaraan": KendaraanPage,
  "/pemantauan/perubahan-objek": PerubahanObjekPage,
  "/cctv": CctvPage,
  "/lingkungan": LingkunganPage,
  "/event": EventPage,
  "/ert": ErtPage,
  "/keputusan": KeputusanPage,
  "/indikasi": IndikasiPage,
  "/kasus": KasusPage,
  "/tindakan": TindakanPage,
  "/rekomendasi": RekomendasiPage,
  "/sumber": SumberPage,
  "/analisis": AnalisisPage,
  "/kualitas": KualitasPage,
  "/asisten": AsistenPage,
  "/panduan": PanduanPage,
  "/admin/zona": ZonaAdminPage,
  "/admin/site": SiteAdminPage,
  "/admin/kamera": KameraAdminPage,
  "/admin/sensor": SensorAdminPage,
  "/admin/shift": ShiftAdminPage,
  "/admin/pengguna": PenggunaAdminPage,
  "/admin/pengaturan": SettingsPage,
}

/**
 * The page, behind a 403 when it is limited to some roles. Every page gets a route whether its
 * module is on or not, so switching a module in Pengaturan needs no new router; the guard decides.
 */
function routeOf(item: NavItem) {
  const Page = builtPages[item.to] ?? PlaceholderPage
  const roles = rolesFor(item.to)
  return {
    path: item.to,
    Component: () => (
      <RequireModule item={item}>
        {roles ? (
          <RequireRole roles={roles}>
            <Page />
          </RequireRole>
        ) : (
          <Page />
        )}
      </RequireModule>
    ),
  }
}

export const router = createBrowserRouter([
  {
    ErrorBoundary: RouteError,
    children: [
      { path: "/login", Component: AuthLayout, children: [{ index: true, Component: LoginPage }] },
      {
        // Loaded on first visit, so the catalog and its syntax highlighter stay out of the dashboard bundle.
        path: "/storybook/:slug?",
        lazy: async () => ({ Component: (await import("@/features/storybook/layouts/storybook-layout")).StorybookLayout }),
        HydrateFallback: () => null,
      },
      {
        Component: DashboardLayout,
        children: [...allItems.map(routeOf), { path: "*", Component: NotFoundPage }],
      },
    ],
  },
])
