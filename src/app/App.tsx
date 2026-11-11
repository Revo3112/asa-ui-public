import { I18nProvider, Toast } from "@heroui/react"
import { RouterProvider } from "react-router/dom"

import { router } from "@/app/router"
import { locale, useLang } from "@/shared/lib/i18n"

export default function App() {
  // A new language remounts everything below, so every label and date re-renders in it.
  const lang = useLang()

  return (
    <I18nProvider locale={locale()} key={lang}>
      <RouterProvider router={router} />
      <Toast.Provider placement="top" />
    </I18nProvider>
  )
}
