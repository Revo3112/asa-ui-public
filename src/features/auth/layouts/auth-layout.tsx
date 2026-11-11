import { Outlet } from "react-router"

import { LangToggle } from "@/shared/components/lang-toggle"

export function AuthLayout() {
  return (
    <main className="auth relative grid min-h-dvh place-items-center px-4 py-10">
      <LangToggle className="absolute top-4 right-4" />
      <Outlet />
    </main>
  )
}
