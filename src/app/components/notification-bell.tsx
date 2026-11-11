import { useEffect, useRef, useState } from "react"
import { Badge, Button, Popover, ScrollShadow, toast } from "@heroui/react"
import { Bell } from "lucide-react"
import { useNavigate } from "react-router"

import { EventDrawer } from "@/features/events/components/event-drawer"
import { SeverityChip } from "@/shared/components/severity-chip"
import { notifications } from "@/shared/config/app"
import { isUrgent, type EventStatus } from "@/shared/config/events"
import { getLatestEvents, subscribeEvents, updateEvents, type HseEvent } from "@/features/events/data/events"
import { defaultFilters } from "@/shared/data/filters"
import { activeSite } from "@/shared/auth/session"
import { isModuleOn } from "@/shared/data/settings"
import { ago, useNow } from "@/shared/lib/time"
import { tr } from "@/shared/lib/i18n"

type Item = { event: HseEvent; read: boolean }

/** The event page, filtered to the event's site and type, with its drawer open. */
const linkTo = (e: HseEvent) => `/event?${new URLSearchParams({ site: e.site, tipe: e.tipe, id: e.id })}`

/**
 * The header bell: recent events for the header's site, newest first, with an unread count.
 * Kritis and Tinggi events also raise a toast, at most one per `toastGapMs`, so a burst doesn't stack.
 * Mount it with the header site as `key`. With Event & laporan switched off, an item opens its
 * detail drawer here instead of the list page.
 * ponytail: read state lives in memory and resets on reload; store it per user once there is an API.
 */
export function NotificationBell() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [isOpen, setIsOpen] = useState(false)
  // Kept after closing so the drawer still has content while it slides out.
  const [detail, setDetail] = useState<HseEvent | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const lastToast = useRef(0)
  const now = useNow(30_000)
  const unread = items.filter((i) => !i.read).length

  useEffect(() => {
    const f = { ...defaultFilters, site: activeSite() }
    let alive = true
    // Open events from today start unread: nobody has handled them yet.
    getLatestEvents(f, 8).then(
      (events) => alive && setItems((list) => [...list, ...events.map((event) => ({ event, read: event.status !== "open" }))]),
      () => {},
    )
    const off = subscribeEvents(f, (event) => {
      setItems((list) => [{ event, read: false }, ...list].slice(0, notifications.bellSize))
      if (!isUrgent(event.severity) || Date.now() - lastToast.current < notifications.toastGapMs) return
      lastToast.current = Date.now()
      const id = toast.danger(event.judul, {
        description: `${event.zona.label} · ${event.sumber}`,
        actionProps: {
          children: tr("Lihat", "View"),
          onPress: () => {
            toast.close(id)
            open(event)
          },
        },
      })
    })
    return () => {
      alive = false
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remounted by its key when the header site changes
  }, [])

  const open = (event: HseEvent) => {
    setItems((list) => list.map((i) => (i.event.id === event.id ? { ...i, read: true } : i)))
    setIsOpen(false)
    if (isModuleOn("events")) return navigate(linkTo(event))
    setDetail(event)
    setDetailOpen(true)
  }

  const update = async (ids: string[], status: EventStatus, catatan?: string) => {
    const [updated] = await updateEvents({ site: activeSite() }, ids, status, catatan)
    if (!updated) return
    setDetail(updated)
    setItems((list) => list.map((i) => (i.event.id === updated.id ? { ...i, event: updated } : i)))
  }

  return (
    <>
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Badge.Anchor>
          <Button isIconOnly variant="ghost" className="max-lg:size-11 max-lg:[--button-bg:var(--default)]" aria-label={unread ? tr(`Notifikasi, ${unread} belum dibaca`, `Notifications, ${unread} unread`) : tr("Notifikasi", "Notifications")}>
            <Bell aria-hidden />
          </Button>
          {unread > 0 && (
            <Badge color="danger" size="sm" aria-hidden>
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Badge.Anchor>
        <Popover.Content placement="bottom end" className="w-[min(24rem,calc(100vw-2rem))]">
          <Popover.Dialog className="flex flex-col gap-2 p-0">
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <Popover.Heading className="text-sm font-medium">{tr("Notifikasi", "Notifications")}</Popover.Heading>
              <Button size="sm" variant="ghost" isDisabled={!unread} onPress={() => setItems((list) => list.map((i) => ({ ...i, read: true })))}>
                {tr("Tandai semua dibaca", "Mark all as read")}
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">{tr("Belum ada event hari ini.", "No events today yet.")}</p>
            ) : (
              <ScrollShadow className="max-h-96 px-2 pb-2">
                <ul className="flex flex-col">
                  {items.map(({ event, read }) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => open(event)}
                        className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-default focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <span className={read ? "mt-1.5 size-2 shrink-0" : "mt-1.5 size-2 shrink-0 rounded-full bg-accent"} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={read ? "block truncate text-sm" : "block truncate text-sm font-medium"}>
                            {!read && <span className="sr-only">{tr("Belum dibaca:", "Unread:")} </span>}
                            {event.judul}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {event.zona.label} · {ago(event.waktu, now)}
                          </span>
                        </span>
                        <SeverityChip severity={event.severity} />
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollShadow>
            )}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      <EventDrawer event={detail ?? undefined} isOpen={detailOpen} onOpenChange={setDetailOpen} onUpdate={update} />
    </>
  )
}
