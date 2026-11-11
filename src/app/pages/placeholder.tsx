import { EmptyState } from "@heroui/react"
import { tr } from "@/shared/lib/i18n"

export function PlaceholderPage() {
  return (
    <EmptyState>
      <p className="font-medium text-foreground">{tr("Halaman ini belum dibuat", "This page isn't built yet")}</p>
      <p className="mt-1">{tr("Menu dan rutenya sudah siap. Kontennya menyusul.", "Its menu and route are ready. The content comes later.")}</p>
    </EmptyState>
  )
}
