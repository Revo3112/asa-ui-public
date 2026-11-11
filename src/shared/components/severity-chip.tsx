import { Chip } from "@heroui/react"

import { severityMeta, type Severity } from "@/shared/config/events"

/** The severity label as a chip. Kritis is solid so it stands apart from Tinggi, which shares its color. */
export function SeverityChip({ severity, size = "sm", className }: { severity: Severity; size?: "sm" | "md" | "lg"; className?: string }) {
  const meta = severityMeta[severity]
  return (
    <Chip size={size} color={meta.color} variant={meta.variant} className={className}>
      {meta.label}
    </Chip>
  )
}
