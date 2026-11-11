import { buttonVariants } from "@heroui/react"
import { isRouteErrorResponse, Link, useRouteError } from "react-router"

import { cn } from "@/shared/lib/utils"
import { tr } from "@/shared/lib/i18n"

export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="font-display text-2xl">{notFound ? tr("Halaman tidak ditemukan", "Page not found") : tr("Terjadi kesalahan", "Something went wrong")}</h1>
        <p className="mt-2 text-sm text-muted">{notFound ? tr("Alamat ini tidak ada di aplikasi.", "This address doesn't exist in the app.") : tr("Muat ulang halaman. Kalau masih gagal, hubungi admin.", "Reload the page. If it still fails, contact an admin.")}</p>
        <Link to="/" className={cn(buttonVariants({ variant: "primary" }), "mt-6")}>
          {tr("Kembali ke dashboard", "Back to the dashboard")}
        </Link>
      </div>
    </main>
  )
}
