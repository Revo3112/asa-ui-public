import { useState } from "react"
import { Button, Chip, Modal, Skeleton } from "@heroui/react"

import { CameraPlayer } from "@/features/cctv/components/camera-player"
import { useFilters } from "@/shared/components/filter-bar"
import { EventDrawer } from "@/features/events/components/event-drawer"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import { eventStatus } from "@/shared/config/events"
import { findViolation, getCameraViolations, violationTitle, type Violation, type ViolationStatus } from "@/features/ppe/data/apd"
import { toEvent, updateEvents } from "@/features/events/data/events"
import type { Camera, CameraStatus } from "@/features/cctv/data/cctv"
import { locale, tr } from "@/shared/lib/i18n"

const time = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** Recent violations from this camera, each opening the same drawer as the APD page. */
function CameraViolations({ camera }: { camera: Camera }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getCameraViolations(filters, camera.id), `${key}|${camera.id}`)
  const [changed, setChanged] = useState<Record<string, Violation>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const rows = query.data?.map((v) => changed[v.id] ?? v)
  const selected = rows?.find((v) => v.id === openId)

  const update = async (ids: string[], status: ViolationStatus, catatan?: string) => {
    await updateEvents(filters, ids, status, catatan)
    const updated = ids.flatMap((id) => {
      const v = findViolation(filters, id)
      return v ? [v] : []
    })
    setChanged((c) => ({ ...c, ...Object.fromEntries(updated.map((v) => [v.id, v])) }))
  }

  return (
    <>
      <WidgetBody
        query={{ ...query, data: rows }}
        skeleton={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        }
        isEmpty={(list) => list.length === 0}
        empty={tr("Belum ada pelanggaran dari kamera ini.", "No violations from this camera yet.")}
      >
        {(list) => (
          <ul className="flex flex-col divide-y divide-border">
            {list.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{violationTitle(v)}</p>
                  <p className="text-xs text-muted">{time(v.waktu)}</p>
                </div>
                <Chip size="sm" color={eventStatus[v.status].color}>
                  {eventStatus[v.status].label}
                </Chip>
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={tr(`Lihat bukti ${v.id}`, `View evidence ${v.id}`)}
                  onPress={() => {
                    setOpenId(v.id)
                    setIsOpen(true)
                  }}
                >
                  {tr("Lihat bukti", "View evidence")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </WidgetBody>
      <EventDrawer event={selected && toEvent(selected)} isOpen={isOpen} onOpenChange={setIsOpen} onUpdate={update} linkToEventPage />
    </>
  )
}

type CameraDetailProps = {
  /** Keep passing the last one after closing so the modal has content while it fades out. */
  camera?: Camera
  status?: CameraStatus
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

/** One camera, large: the HD stream with full controls and the camera's recent violations. */
export function CameraDetail({ camera, status, isOpen, onOpenChange }: CameraDetailProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="cover">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          {camera && (
            <>
              <Modal.Header>
                <Modal.Heading>{camera.label}</Modal.Heading>
                <p className="text-sm text-muted">
                  {camera.zona.label} · {status?.online === false ? tr("Offline menurut server", "Offline according to the server") : "Online"}
                </p>
              </Modal.Header>
              <Modal.Body className="grid content-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <CameraPlayer
                  src={camera.streamUrlHd ?? camera.streamUrl}
                  type={camera.streamType}
                  label={tr(`Siaran ${camera.label}, resolusi tinggi`, `${camera.label} stream, high resolution`)}
                  controls
                  className="self-start overflow-hidden rounded-lg"
                />
                <section aria-labelledby="camera-violations" className="flex min-w-0 flex-col gap-2">
                  <h3 id="camera-violations" className="font-medium">
                    {tr("Pelanggaran terbaru", "Latest violations")}
                  </h3>
                  <CameraViolations camera={camera} />
                </section>
              </Modal.Body>
            </>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
