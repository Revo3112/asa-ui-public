import { useEffect, useRef, useState } from "react"
import { Alert, Button, Chip, Skeleton, ToggleButton, ToggleButtonGroup } from "@heroui/react"
import { ChevronLeft, ChevronRight, Maximize } from "lucide-react"
import { useSearchParams } from "react-router"

import { CameraDetail } from "@/features/cctv/components/camera-detail"
import { CameraTile } from "@/features/cctv/components/camera-tile"
import { FilterSelect, useFilters, useSetParams } from "@/shared/components/filter-bar"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import { severityMeta } from "@/shared/config/events"
import { CURSOR_IDLE_MS, DEFAULT_LAYOUT, HIGHLIGHT_MS, LAYOUTS, PRIORITIZE_ALERTS, ROTATE_MS, type Layout } from "@/features/cctv/config/cctv"
import { severityOf, subscribeViolations, violationTitle, type Violation } from "@/features/ppe/data/apd"
import { getCameras, subscribeCameraStatus, type CameraStatus } from "@/features/cctv/data/cctv"
import { OptionSelect } from "@/shared/components/workflow-forms"
import { fungsiDefs, fungsiLabel } from "@/shared/config/fungsi-kamera"
import { master } from "@/shared/data/master"
import { cn } from "@/shared/lib/utils"
import { tr } from "@/shared/lib/i18n"

// Literal class names so Tailwind generates them.
const columns: Record<Layout, string> = { 1: "", 4: "sm:grid-cols-2", 9: "sm:grid-cols-2 lg:grid-cols-3", 16: "sm:grid-cols-2 lg:grid-cols-4" }
const wall: Record<Layout, string> = { 1: "grid-cols-1 grid-rows-1", 4: "grid-cols-2 grid-rows-2", 9: "grid-cols-3 grid-rows-3", 16: "grid-cols-4 grid-rows-4" }

type Alerted = { violation: Violation; at: number }

/** Fullscreen for one element, so the sidebar and header drop away. Keeps the screen awake while it lasts. */
function useFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!ref.current && document.fullscreenElement === ref.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [ref])

  useEffect(() => {
    if (!isFullscreen || !("wakeLock" in navigator)) return
    let alive = true
    let lock: WakeLockSentinel | undefined
    // The browser drops the lock when the tab is hidden, so take it again on return.
    const request = () =>
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          if (alive) lock = sentinel
          else sentinel.release()
        },
        () => {},
      )
    const onVisible = () => document.visibilityState === "visible" && request()
    request()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      lock?.release()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [isFullscreen])

  const toggle = () => (isFullscreen ? document.exitFullscreen() : ref.current?.requestFullscreen())
  return { isFullscreen, toggle }
}

/** True after the mouse has been still for a while. */
function useIdle(enabled: boolean) {
  const [idle, setIdle] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const onMove = () => {
    if (!enabled) return
    setIdle(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setIdle(true), CURSOR_IDLE_MS)
  }
  return { idle: enabled && idle, onMove }
}

function CctvWall() {
  const { filters, key } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const layout = (LAYOUTS.find((n) => String(n) === params.get("layout")) ?? DEFAULT_LAYOUT) as Layout

  const query = useWidgetData(() => getCameras(filters), key)
  const [liveStatus, setLiveStatus] = useState<Record<string, CameraStatus>>({})
  const [alerts, setAlerts] = useState<Record<string, Alerted>>({})
  const [page, setPage] = useState(0)
  // `?kamera=` (from the map's "Watch live") opens that camera straight away.
  const [openId, setOpenId] = useState<string | null>(params.get("kamera"))
  const [isOpen, setIsOpen] = useState(!!params.get("kamera"))
  // Only the cameras that run this analytics model, e.g. every camera doing PPE.
  const fungsi = params.get("fungsi") ?? "all"
  const fungsiOf = new Map(master().kamera.map((k) => [k.id, k.fungsi ?? []]))

  const wallRef = useRef<HTMLDivElement>(null)
  const { isFullscreen, toggle } = useFullscreen(wallRef)
  const { idle, onMove } = useIdle(isFullscreen)

  /** Clears a tile's highlight. With `violationId`, only if that event is still the one shown. */
  const dismiss = (cameraId: string, violationId?: string) =>
    setAlerts((a) => {
      if (!a[cameraId] || (violationId && a[cameraId].violation.id !== violationId)) return a
      return Object.fromEntries(Object.entries(a).filter(([id]) => id !== cameraId))
    })

  // The parent remounts this on a filter change, so both streams start fresh.
  useEffect(() => {
    const offStatus = subscribeCameraStatus(filters, (id, status) => setLiveStatus((s) => ({ ...s, [id]: status })))
    const offEvents = subscribeViolations(filters, (violation) => {
      setAlerts((a) => ({ ...a, [violation.kamera]: { violation, at: Date.now() } }))
      setTimeout(() => dismiss(violation.kamera, violation.id), HIGHLIGHT_MS)
    })
    return () => {
      offStatus()
      offEvents()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remounted by the parent
  }, [])

  const cameras = (query.data?.cameras ?? []).filter((c) => fungsi === "all" || fungsiOf.get(c.id)?.includes(fungsi))
  const status = { ...query.data?.status, ...liveStatus }
  const online = cameras.filter((c) => status[c.id]?.online !== false).length
  const ordered = PRIORITIZE_ALERTS ? [...cameras].sort((a, b) => (alerts[b.id]?.at ?? 0) - (alerts[a.id]?.at ?? 0)) : cameras
  const pages = Math.max(1, Math.ceil(ordered.length / layout))
  const current = Math.min(page, pages - 1)
  const onPage = ordered.slice(current * layout, (current + 1) * layout)
  const latest = Object.values(alerts).sort((a, b) => b.at - a.at)

  useEffect(() => {
    if (!isFullscreen || pages < 2) return
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), ROTATE_MS)
    return () => clearInterval(timer)
  }, [isFullscreen, pages])

  return (
    <div className="flex flex-col gap-4">
      <div role="toolbar" aria-label={tr("Pengaturan tampilan kamera", "Camera view settings")} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium" id="layout-label">
            Layout
          </span>
          <ToggleButtonGroup
            aria-labelledby="layout-label"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[String(layout)]}
            onSelectionChange={(keys) => {
              const next = String([...keys][0])
              setParams({ layout: next === String(DEFAULT_LAYOUT) ? null : next })
              setPage(0)
            }}
          >
            {LAYOUTS.map((n, i) => (
              <ToggleButton key={n} id={String(n)} aria-label={tr(`${n} kamera per halaman`, `${n} cameras per page`)}>
                {i > 0 && <ToggleButtonGroup.Separator />}
                {n}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
        <div className="w-full min-w-48 sm:w-56">
          <FilterSelect field="zona" />
        </div>
        <div className="w-full min-w-48 sm:w-56">
          <OptionSelect
            label={tr("Fungsi", "Function")}
            value={fungsi}
            options={[{ id: "all", label: tr("Semua fungsi", "All functions") }, ...fungsiDefs.filter((f) => f.status === "aktif").map((f) => ({ id: f.id, label: f.label }))]}
            onChange={(v) => {
              setParams({ fungsi: v === "all" ? null : v })
              setPage(0)
            }}
          />
        </div>
        <Chip size="lg" color={online < cameras.length ? "warning" : "success"} className="mb-1">
          {query.data ? `${online}/${cameras.length} online` : tr("Memuat status…", "Loading status…")}
        </Chip>
        <div className="ms-auto flex items-center gap-2">
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <Button isIconOnly size="sm" variant="tertiary" aria-label={tr("Halaman sebelumnya", "Previous page")} isDisabled={current === 0} onPress={() => setPage(current - 1)}>
                <ChevronLeft aria-hidden />
              </Button>
              <span className="text-sm tabular-nums">
                Halaman {current + 1}/{pages}
              </span>
              <Button isIconOnly size="sm" variant="tertiary" aria-label={tr("Halaman berikutnya", "Next page")} isDisabled={current === pages - 1} onPress={() => setPage(current + 1)}>
                <ChevronRight aria-hidden />
              </Button>
            </div>
          )}
          <Button variant="secondary" onPress={toggle}>
            <Maximize aria-hidden />
            {tr("Layar penuh", "Full screen")}
          </Button>
        </div>
      </div>

      {/* Announces new events to screen readers; the tiles show them visually. */}
      <p className="sr-only" aria-live="polite">
        {latest[0] && `${violationTitle(latest[0].violation)} di ${latest[0].violation.kamera}`}
      </p>

      <div
        ref={wallRef}
        onMouseMove={onMove}
        className={cn(isFullscreen && "relative flex h-screen flex-col bg-black p-2", idle && "cursor-none **:cursor-none")}
      >
        <WidgetBody
          query={query}
          skeleton={
            <div className={cn("grid grid-cols-1 gap-2", columns[layout])}>
              {Array.from({ length: layout }, (_, i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          }
          isEmpty={() => cameras.length === 0}
          empty={fungsi === "all" ? tr("Tidak ada kamera di zona ini.", "No cameras in this zone.") : tr("Tidak ada kamera dengan fungsi ini di zona ini.", "No camera runs this function in this zone.")}
        >
          {() => (
            <ul className={cn("grid gap-2", isFullscreen ? cn("min-h-0 flex-1", wall[layout]) : cn("grid-cols-1", columns[layout]))}>
              {/* DOM order stays by camera id and CSS `order` does the sorting: moving a <video> in the DOM pauses it. */}
              {[...onPage]
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((camera) => (
                  <li key={camera.id} style={{ order: onPage.indexOf(camera) }} className="min-h-0 min-w-0">
                    <CameraTile
                      camera={camera}
                      status={status[camera.id]}
                      alert={alerts[camera.id]?.violation}
                      tags={(fungsiOf.get(camera.id) ?? []).map(fungsiLabel)}
                      fill={isFullscreen}
                      onOpen={
                        isFullscreen
                          ? undefined
                          : () => {
                              setOpenId(camera.id)
                              setIsOpen(true)
                            }
                      }
                      onDismissAlert={() => dismiss(camera.id)}
                    />
                  </li>
                ))}
            </ul>
          )}
        </WidgetBody>

        {isFullscreen && (
          <>
            {pages > 1 && (
              <p className="absolute top-4 right-4 rounded-md bg-black/60 px-2 py-1 text-xs text-white tabular-nums">
                Halaman {current + 1}/{pages}
              </p>
            )}
            <div className="absolute right-4 bottom-4 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2">
              {latest.slice(0, 3).map(({ violation }) => (
                <Alert key={violation.id} status={severityMeta[severityOf(violation)].color}>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{violationTitle(violation)}</Alert.Title>
                    <Alert.Description>
                      {violation.kamera} · {violation.zona.label}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ))}
            </div>
          </>
        )}
      </div>

      <CameraDetail
        camera={cameras.find((c) => c.id === openId)}
        status={openId ? status[openId] : undefined}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </div>
  )
}

export function CctvPage() {
  const { key } = useFilters()
  return <CctvWall key={key} />
}
