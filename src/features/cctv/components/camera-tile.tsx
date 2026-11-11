import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Button, Chip } from "@heroui/react"
import { VideoOff, X } from "lucide-react"

import { CameraPlayer, type PlayerStatus } from "@/features/cctv/components/camera-player"
import { severityMeta } from "@/shared/config/events"
import { severityOf, violationTitle, type Violation } from "@/features/ppe/data/apd"
import type { Camera, CameraStatus } from "@/features/cctv/data/cctv"
import { cn } from "@/shared/lib/utils"
import { locale, tr } from "@/shared/lib/i18n"

const border = { kritis: "border-danger", tinggi: "border-danger", sedang: "border-warning", rendah: "border-accent" } as const
const clock = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })

/** First retry after 2 s, doubling up to a minute. */
const retryDelay = (failures: number) => Math.min(60_000, 2_000 * 2 ** failures)

/** True while the element is on screen or close to it, so off-screen tiles don't decode video. */
function useNearViewport(ref: React.RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "200px" })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return near
}

type CameraTileProps = {
  camera: Camera
  status?: CameraStatus
  alert?: Violation
  /** Fill the grid cell instead of keeping 16:9, for the fullscreen wall. */
  fill?: boolean
  style?: CSSProperties
  /** What the camera runs (its functions), shown small at the bottom while there is no alert. */
  tags?: string[]
  onOpen?: () => void
  onDismissAlert: () => void
}

export function CameraTile({ camera, status, alert, fill = false, style, tags, onOpen, onDismissAlert }: CameraTileProps) {
  const ref = useRef<HTMLDivElement>(null)
  const near = useNearViewport(ref)
  // `attempt` remounts the player for each reconnect; `failures` sets the backoff.
  const [player, setPlayer] = useState<{ status: PlayerStatus; attempt: number; failures: number }>({ status: "loading", attempt: 0, failures: 0 })
  // The server's offline flag wins, unless the operator asks to try the stream anyway.
  const [tryAnyway, setTryAnyway] = useState(false)
  const serverOffline = status?.online === false && !tryAnyway

  useEffect(() => {
    if (player.status !== "error") return
    const timer = setTimeout(() => setPlayer((p) => ({ status: "loading", attempt: p.attempt + 1, failures: p.failures + 1 })), retryDelay(player.failures))
    return () => clearTimeout(timer)
  }, [player.status, player.failures])

  const reconnect = () => {
    setTryAnyway(true)
    setPlayer((p) => ({ status: "loading", attempt: p.attempt + 1, failures: 0 }))
  }

  const severity = alert && severityOf(alert)
  const down = serverOffline || player.status === "error"

  return (
    <div ref={ref} style={style} className={cn("relative overflow-hidden rounded-lg bg-black", fill ? "h-full min-h-0" : "aspect-video")}>
      {near && !serverOffline && (
        <CameraPlayer
          key={player.attempt}
          src={camera.streamUrl}
          type={camera.streamType}
          label={`Siaran ${camera.label}`}
          className="size-full object-cover"
          onStatusChange={(next) => setPlayer((p) => ({ ...p, status: next, failures: next === "playing" ? 0 : p.failures }))}
        />
      )}

      {down && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-default p-3 text-center text-muted">
          <VideoOff className="size-6" aria-hidden />
          <p className="font-medium text-foreground">{serverOffline ? "Offline" : tr("Stream terputus", "Stream lost")}</p>
          <p className="text-xs">
            {serverOffline ? tr(`Terakhir online ${status && clock(status.since)}`, `Last online ${status && clock(status.since)}`) : tr("Menyambung ulang otomatis", "Reconnecting automatically")}
          </p>
          <Button size="sm" variant="secondary" className="relative z-10 mt-1" onPress={reconnect}>
            {tr("Coba sambung ulang", "Try reconnecting")}
          </Button>
        </div>
      )}

      {onOpen && <button type="button" className="absolute inset-0 cursor-pointer" aria-label={`Buka ${camera.label}`} onClick={onOpen} />}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-linear-to-b from-black/70 to-transparent px-3 py-2 text-sm text-white">
        <span className={cn("size-2 shrink-0 rounded-full", down ? "bg-danger" : "bg-success")} aria-hidden />
        <span className="truncate">{camera.label}</span>
        <span className="sr-only">{down ? tr("tidak tayang", "not playing") : "online"}</span>
      </div>

      {!alert && !down && !!tags?.length && (
        <ul className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-1">
          {tags.slice(0, 2).map((t) => (
            <li key={t} className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
              {t}
            </li>
          ))}
          {tags.length > 2 && <li className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">+{tags.length - 2}</li>}
        </ul>
      )}

      {alert && severity && (
        <>
          <div className={cn("pointer-events-none absolute inset-0 rounded-lg border-4 motion-safe:animate-pulse", border[severity])} aria-hidden />
          <div className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2">
            <Chip color={severityMeta[severity].color} variant="primary" className="min-w-0">
              <Chip.Label className="truncate">
                {violationTitle(alert)} · {clock(alert.waktu)}
              </Chip.Label>
            </Chip>
            <Button isIconOnly size="sm" variant="tertiary" className="ms-auto" aria-label={tr(`Tutup sorotan ${camera.id}`, `Dismiss highlight on ${camera.id}`)} onPress={onDismissAlert}>
              <X aria-hidden />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
