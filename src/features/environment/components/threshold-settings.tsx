import { useState } from "react"
import { Alert, Button, Description, Drawer, FieldError, Label, ListBox, NumberField, Radio, RadioGroup, Select } from "@heroui/react"

import { SensorChart, type ChartSeries } from "@/features/environment/components/sensor-chart"
import { sensorTypes, type Direction, type Threshold } from "@/shared/config/lingkungan"
import { tr } from "@/shared/lib/i18n"

type ThresholdSettingsProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  thresholds: Record<string, Threshold>
  /** Recent readings per type, for the preview. */
  preview: (typeId: string) => ChartSeries[]
  window: { start: number; end: number }
  canEdit: boolean
  onSave: (typeId: string, threshold: Threshold) => Promise<void>
}

/** Warning and danger limits per sensor type, with the draft drawn on recent data before saving. */
export function ThresholdSettings({ isOpen, onOpenChange, thresholds, preview, window, canEdit, onSave }: ThresholdSettingsProps) {
  const [typeId, setTypeId] = useState(sensorTypes[0].id)
  // The draft belongs to one type; switching type starts from that type's saved values.
  const [draft, setDraft] = useState<{ typeId: string; value: Threshold } | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const type = sensorTypes.find((t) => t.id === typeId)!
  const value = draft?.typeId === typeId ? draft.value : thresholds[typeId]
  const edit = (patch: Partial<Threshold>) => {
    setDraft({ typeId, value: { ...value, ...patch } })
    setSaved(null)
  }
  const ordered = value.arah === "atas" ? value.bahaya > value.waspada : value.bahaya < value.waspada
  const changed = JSON.stringify(value) !== JSON.stringify(thresholds[typeId])

  const save = async () => {
    setIsPending(true)
    try {
      await onSave(typeId, value)
      setDraft(null)
      setSaved(type.label)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading>{tr("Pengaturan threshold", "Threshold settings")}</Drawer.Heading>
            <p className="text-sm text-muted">{tr("Berlaku untuk semua sensor sejenis.", "Applies to every sensor of this type.")}</p>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-4">
            {!canEdit && (
              <Alert>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{tr("Hanya bisa dilihat", "View only")}</Alert.Title>
                  <Alert.Description>{tr("Threshold hanya dapat diubah oleh Super Admin dan Admin Site.", "Thresholds can only be changed by Super Admin and Site Admin.")}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            <Select
              value={typeId}
              onChange={(next) => {
                if (!next) return
                setTypeId(String(next))
                setSaved(null)
              }}
            >
              <Label>{tr("Jenis sensor", "Sensor type")}</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {sensorTypes.map((t) => (
                    <ListBox.Item key={t.id} id={t.id} textValue={t.label}>
                      {t.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <RadioGroup value={value.arah} onChange={(arah) => edit({ arah: arah as Direction })} isReadOnly={!canEdit} orientation="horizontal">
              <Label>{tr("Berbahaya jika nilai", "Dangerous when the value is")}</Label>
              {(
                [
                  ["atas", tr("Terlalu tinggi", "Too high")],
                  ["bawah", tr("Terlalu rendah", "Too low")],
                ] as const
              ).map(([id, label]) => (
                <Radio key={id} value={id}>
                  <Radio.Content>
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    {label}
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>

            <div className="grid grid-cols-2 gap-3">
              {(["waspada", "bahaya"] as const).map((level) => (
                <NumberField
                  key={level}
                  value={value[level]}
                  onChange={(n) => Number.isFinite(n) && edit({ [level]: n })}
                  isReadOnly={!canEdit}
                  isInvalid={!ordered}
                  step={type.decimals ? 0.1 : 1}
                  formatOptions={{ maximumFractionDigits: type.decimals }}
                >
                  <Label>
                    Batas {level} ({type.unit})
                  </Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                  {level === "bahaya" && <FieldError>{tr(`Batas bahaya harus ${value.arah === "atas" ? "lebih tinggi" : "lebih rendah"} dari batas waspada.`, `The danger limit must be ${value.arah === "atas" ? "higher" : "lower"} than the warning limit.`)}</FieldError>}
                </NumberField>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{tr("Pratinjau pada data 15 menit terakhir", "Preview on the last 15 minutes of data")}</p>
              <SensorChart type={type} threshold={value} series={preview(typeId)} start={window.start} end={window.end} height={180} />
              <Description>{tr("Pita kuning: waspada. Pita merah: bahaya.", "Yellow band: warning. Red band: danger.")}</Description>
            </div>
            {saved && (
              <p role="status" className="text-sm text-success">
                Threshold {saved} tersimpan.
              </p>
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <Button slot="close" variant="secondary">
              {tr("Tutup", "Close")}
            </Button>
            {canEdit && (
              <Button isPending={isPending} isDisabled={!ordered || !changed} onPress={save}>
                {tr("Simpan", "Save")}
              </Button>
            )}
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}
