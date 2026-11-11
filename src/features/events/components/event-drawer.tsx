import { useState } from "react"
import { Button, buttonVariants, Chip, Description, Drawer, Label, TextArea, TextField } from "@heroui/react"
import { ImageOff } from "lucide-react"
import { Link } from "react-router"

import { SensorChart } from "@/features/environment/components/sensor-chart"
import { SeverityChip } from "@/shared/components/severity-chip"
import { eventStatus, eventTypes, nextStep, type EventStatus } from "@/shared/config/events"
import { sensorTypes } from "@/shared/config/lingkungan"
import { shiftLabel, type Box } from "@/features/ppe/data/apd"
import { ageLabel, getSensorTrace, type HseEvent } from "@/features/events/data/events"
import { thresholdOf } from "@/features/environment/data/lingkungan"
import { canHandleEvents, useRole } from "@/shared/auth/session"
import { isModuleOn } from "@/shared/data/settings"
import { duration, useNow } from "@/shared/lib/time"
import { locale, tr } from "@/shared/lib/i18n"

const fullTime = (d: Date) => d.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })

/** The evidence frame, or a placeholder until the API sends one. */
export function Evidence({ src, alt, className }: { src?: string; alt: string; className: string }) {
  return src ? (
    <img src={src} alt={alt} className={`${className} object-cover`} />
  ) : (
    <div className={`${className} grid place-items-center bg-default text-muted`}>
      <ImageOff className="size-5" aria-label={tr("Belum ada gambar bukti", "No evidence image yet")} />
    </div>
  )
}

/** The evidence frame at 16:9 with the detected person's box and its label drawn on top. */
export function EvidenceViewer({ src, alt, box, label }: { src?: string; alt: string; box?: Box; label: string }) {
  return (
    <figure className="relative aspect-video overflow-hidden rounded-lg">
      <Evidence src={src} alt={alt} className="size-full" />
      {box && (
        <div className="absolute border-2 border-danger" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}>
          <span className="absolute top-0 left-0 bg-danger px-1.5 py-0.5 text-xs whitespace-nowrap text-danger-foreground">{label}</span>
        </div>
      )}
    </figure>
  )
}

/** What happened, shaped by the event type: the evidence frame for PPE, the sensor trace for environment. */
function EventContext({ event }: { event: HseEvent }) {
  if (event.tipe === "ppe") return <EvidenceViewer src={event.bukti} alt={`Bukti ${event.judul}, ${event.sumber}`} box={event.box} label={event.judul} />
  if (event.tipe === "lingkungan" && event.sensor) {
    const type = sensorTypes.find((t) => t.id === event.sensor!.type)!
    const t = event.waktu.getTime()
    return (
      <div className="flex flex-col gap-1">
        <SensorChart
          type={type}
          threshold={thresholdOf(type.id)}
          series={[{ id: event.sensor.id, label: event.sumber, color: type.color, points: getSensorTrace(event) }]}
          start={t - 15 * 60_000}
          end={t + 15 * 60_000}
          height={180}
        />
        <Description>{tr("Nilai sensor 15 menit sebelum dan sesudah kejadian.", "Sensor values 15 minutes before and after the event.")}</Description>
      </div>
    )
  }
  if (event.tipe === "kamera")
    return (
      <Link to={`/cctv?zona=${event.zona.id}`} className={buttonVariants({ variant: "secondary", className: "self-start" })}>
        {tr("Buka Monitor CCTV", "Open CCTV Monitor")}
      </Link>
    )
  return null
}

type EventDrawerProps = {
  /** Keep passing the last one after closing so the drawer has content while it slides out. */
  event?: HseEvent
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onUpdate: (ids: string[], status: EventStatus, catatan?: string) => Promise<void>
  /** Adds a link to the event on the Event & laporan page, for drawers opened elsewhere. */
  linkToEventPage?: boolean
}

/** One drawer for every event type, used by Overview, APD, CCTV and Event & laporan. */
export function EventDrawer({ event: e, isOpen, onOpenChange, onUpdate, linkToEventPage = false }: EventDrawerProps) {
  const canEdit = canHandleEvents(useRole())
  const now = useNow(60_000)
  // The note belongs to one event; opening another starts empty.
  const [note, setNote] = useState({ id: e?.id, text: "" })
  const catatan = note.id === e?.id ? note.text : ""
  const [isPending, setIsPending] = useState(false)
  const step = e && canEdit ? nextStep[e.status] : undefined

  const advance = async (target: HseEvent, status: EventStatus) => {
    setIsPending(true)
    try {
      await onUpdate([target.id], status, catatan.trim() || undefined)
      setNote({ id: target.id, text: "" })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          {e && (
            <>
              <Drawer.Header>
                <Drawer.Heading>{e.judul}</Drawer.Heading>
                <p className="text-sm text-muted">
                  {eventTypes[e.tipe]} · {e.id}
                </p>
              </Drawer.Header>
              <Drawer.Body className="flex flex-col gap-4">
                <EventContext event={e} />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted">Status</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" color={eventStatus[e.status].color}>
                      {eventStatus[e.status].label}
                    </Chip>
                    <span className="text-muted">{ageLabel(e, now, duration)}</span>
                  </dd>
                  <dt className="text-muted">Severity</dt>
                  <dd>
                    <SeverityChip severity={e.severity} />
                  </dd>
                  <dt className="text-muted">{tr("Sumber", "Source")}</dt>
                  <dd>{e.sumber}</dd>
                  <dt className="text-muted">{tr("Zona", "Zone")}</dt>
                  <dd>{e.zona.label}</dd>
                  <dt className="text-muted">Shift</dt>
                  <dd>{shiftLabel(e.shift)}</dd>
                  <dt className="text-muted">{tr("Waktu", "Time")}</dt>
                  <dd>{fullTime(e.waktu)}</dd>
                </dl>

                <section aria-labelledby="riwayat-status" className="flex flex-col gap-2">
                  <h3 id="riwayat-status" className="text-sm font-medium">
                    {tr("Riwayat status", "Status history")}
                  </h3>
                  <ol className="flex flex-col gap-2 border-l border-border pl-4 text-sm">
                    {e.riwayat.map((h, i) => (
                      <li key={i}>
                        <p>
                          {eventStatus[h.status].label} · {h.by}
                        </p>
                        <p className="text-muted">{fullTime(h.at)}</p>
                        {h.catatan && <p className="mt-1">“{h.catatan}”</p>}
                      </li>
                    ))}
                  </ol>
                </section>

                {step && (
                  <TextField value={catatan} onChange={(text) => setNote({ id: e.id, text })}>
                    <Label>{tr("Catatan", "Note")}</Label>
                    <TextArea rows={3} placeholder={tr("Tindakan yang diambil atau alasan penutupan", "Action taken or reason for closing")} />
                    <Description>{tr("Opsional. Disimpan di riwayat status.", "Optional. Saved in the status history.")}</Description>
                  </TextField>
                )}
              </Drawer.Body>
              <Drawer.Footer className="flex-wrap">
                <Button slot="close" variant="secondary">
                  {tr("Kembali", "Back")}
                </Button>
                {linkToEventPage && isModuleOn("events") && (
                  <Link to={`/event?id=${e.id}`} className={buttonVariants({ variant: "secondary" })}>
                    {tr("Buka di Event & laporan", "Open in Events & reports")}
                  </Link>
                )}
                {step && (
                  <Button isPending={isPending} onPress={() => advance(e, step.status)}>
                    {step.label}
                  </Button>
                )}
              </Drawer.Footer>
            </>
          )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}
