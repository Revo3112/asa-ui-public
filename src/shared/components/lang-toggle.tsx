import { ToggleButton, ToggleButtonGroup } from "@heroui/react"

import { setLang, tr, useLang, type Lang } from "@/shared/lib/i18n"

/** ID | EN switch for the interface language. */
export function LangToggle({ className }: { className?: string }) {
  const lang = useLang()
  return (
    <ToggleButtonGroup
      aria-label={tr("Bahasa antarmuka", "Interface language")}
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[lang]}
      onSelectionChange={(keys) => setLang([...keys][0] as Lang)}
      className={className}
    >
      <ToggleButton id="id" aria-label="Bahasa Indonesia">
        ID
      </ToggleButton>
      <ToggleButton id="en" aria-label="English">
        <ToggleButtonGroup.Separator />
        EN
      </ToggleButton>
    </ToggleButtonGroup>
  )
}
