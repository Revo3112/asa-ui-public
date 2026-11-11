import { useEffect, useState } from "react"
import { Chip, ListBox, Skeleton } from "@heroui/react"

import { EventDrawer, Evidence } from "@/features/events/components/event-drawer"
import { useFilters } from "@/shared/components/filter-bar"
import { useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { SeverityChip } from "@/shared/components/severity-chip"
import type { EventStatus } from "@/shared/config/events"
import { getLatestEvents, subscribeEvents, updateEvents, type HseEvent } from "@/features/events/data/events"
import { ago, useNow } from "@/shared/lib/time"
import { tr } from "@/shared/lib/i18n"

const FEED_SIZE = 10

/** Latest events, live. Mount it with the filters as `key` so a filter change starts a fresh stream. */
export function EventFeed({ className }: { className?: string }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getLatestEvents(filters, FEED_SIZE), key)
  const [live, setLive] = useState<HseEvent[]>([])
  const [changed, setChanged] = useState<Record<string, HseEvent>>({})
  // Kept after closing so the drawer still has content while it slides out.
  const [openId, setOpenId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const now = useNow(30_000)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the parent remounts this on a filter change
  useEffect(() => subscribeEvents(filters, (event) => setLive((list) => [event, ...list])), [])

  const events = query.data && [...live, ...query.data].slice(0, FEED_SIZE).map((e) => changed[e.id] ?? e)

  const update = async (ids: string[], status: EventStatus, catatan?: string) => {
    const updated = await updateEvents(filters, ids, status, catatan)
    setChanged((c) => ({ ...c, ...Object.fromEntries(updated.map((e) => [e.id, e])) }))
  }

  return (
    <Widget
      title={tr("Event terbaru", "Latest events")}
      description={tr(`${FEED_SIZE} event terakhir, diperbarui langsung`, `Last ${FEED_SIZE} events, updated live`)}
      className={className}
      action={
        <Chip size="sm" color="success">
          {tr("Langsung", "Live")}
        </Chip>
      }
    >
      <WidgetBody
        query={{ ...query, data: events }}
        skeleton={
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        }
        isEmpty={(list) => list.length === 0}
        empty={tr("Belum ada event untuk filter ini.", "No events for these filters yet.")}
      >
        {(list) => (
          <ListBox
            aria-label={tr("Event terbaru", "Latest events")}
            aria-live="polite"
            onAction={(id) => {
              setOpenId(String(id))
              setIsOpen(true)
            }}
          >
            {list.map((event) => (
              <ListBox.Item key={event.id} id={event.id} textValue={`${event.judul}, ${event.zona.label}`}>
                <div className="flex w-full min-w-0 items-center gap-3">
                  <Evidence src={event.bukti} alt={`Bukti ${event.judul}, ${event.sumber}`} className="size-12 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{event.judul}</p>
                    <p className="text-sm text-muted">
                      {event.zona.label} · {event.sumber} · {ago(event.waktu, now)}
                    </p>
                  </div>
                  <SeverityChip severity={event.severity} />
                </div>
              </ListBox.Item>
            ))}
          </ListBox>
        )}
      </WidgetBody>

      <EventDrawer event={events?.find((e) => e.id === openId)} isOpen={isOpen} onOpenChange={setIsOpen} onUpdate={update} linkToEventPage />
    </Widget>
  )
}
