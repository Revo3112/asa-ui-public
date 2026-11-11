import { useEffect, useRef, type ReactNode } from "react"
import { Button, buttonVariants, toast } from "@heroui/react"
import { Link, Navigate, useLocation, useNavigate } from "react-router"

import { homePath } from "@/shared/config/modules"
import { isItemOn, type NavItem } from "@/app/config/nav"
import { useRole, type Role } from "@/shared/auth/session"
import { useSettings } from "@/shared/data/settings"
import { tr } from "@/shared/lib/i18n"

function StatusPage({ code, title, children, action }: { code?: string; title: string; children: ReactNode; action?: ReactNode }) {
  "use no memo"
  const navigate = useNavigate()
  const { key } = useLocation()
  const role = useRole()
  useSettings()
  const home = homePath(role)
  return (
    <div className="grid min-h-[60dvh] place-items-center text-center">
      <div className="max-w-md">
        {code && <p className="text-sm font-medium text-muted">{code}</p>}
        <h2 className="mt-1 font-display text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-muted">{children}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {/* A link opened in a new tab has nothing to go back to. */}
          {key !== "default" && (
            <Button variant="secondary" onPress={() => navigate(-1)}>
              {tr("Kembali", "Back")}
            </Button>
          )}
          {action ??
            (home && (
              <Link to={home} className={buttonVariants({ variant: "primary" })}>
                {tr("Ke halaman awal", "Go to home")}
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <StatusPage code="404" title={tr("Halaman tidak ditemukan", "Page not found")}>
      {tr("Alamat ini tidak ada di aplikasi, atau modulnya tidak aktif.", "This address doesn't exist in the app, or its module is off.")}
    </StatusPage>
  )
}

export function ForbiddenPage() {
  return (
    <StatusPage code="403" title={tr("Anda tidak punya akses ke halaman ini", "You don't have access to this page")}>
      {tr("Role Anda tidak termasuk yang diizinkan membuka halaman ini. Minta admin mengubah role Anda bila perlu.", "Your role isn't allowed to open this page. Ask an admin to change your role if needed.")}
    </StatusPage>
  )
}

/** Shown when every business module is off. */
export function NoModulesPage() {
  const isSuperAdmin = useRole() === "super-admin"
  return (
    <StatusPage
      title={tr("Belum ada modul aktif", "No module is active")}
      action={
        isSuperAdmin && (
          <Link to="/admin/pengaturan" className={buttonVariants({ variant: "primary" })}>
            {tr("Buka Pengaturan modul", "Open module settings")}
          </Link>
        )
      }
    >
      {isSuperAdmin
        ? tr("Semua modul sedang dinonaktifkan. Aktifkan modul yang dipakai di tab Modul pada halaman Pengaturan.", "Every module is turned off. Turn on the ones you use in the Modules tab in Settings.")
        : tr("Semua modul sedang dinonaktifkan. Hubungi Super Admin untuk mengaktifkannya.", "Every module is turned off. Ask a Super Admin to turn them on.")}
    </StatusPage>
  )
}

/** Shows the page only to the given roles, and the 403 page to everyone else. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  return roles.includes(useRole()) ? children : <ForbiddenPage />
}

/**
 * Shows the page while its module is on. A direct visit to a switched-off module gets the 404;
 * if the module goes off while the page is open, the user is taken to the start page with a toast.
 */
export function RequireModule({ item, children }: { item: NavItem; children: ReactNode }) {
  "use no memo"
  useSettings()
  const role = useRole()
  const navigate = useNavigate()
  const on = isItemOn(item)
  const wasOn = useRef(on)
  useEffect(() => {
    if (wasOn.current && !on) {
      toast.warning(tr(`Modul ${item.label} baru saja dinonaktifkan.`, `The ${item.label} module was just turned off.`), { description: tr("Anda dialihkan ke halaman awal.", "You've been taken to the home page.") })
      navigate(homePath(role) ?? "/", { replace: true })
    }
    wasOn.current = on
  }, [on, item.label, navigate, role])
  if (on) return children
  // Ringkasan off: "/" is still the start address, so it forwards to the first active module.
  if (item.to === "/") {
    const home = homePath(role)
    return home ? <Navigate to={home} replace /> : <NoModulesPage />
  }
  return <NotFoundPage />
}
