/**
 * Camera status from the mock server. The cameras themselves are master data; the streams are
 * short looping MP4s in public/mock/cctv, reused across cameras. `?demo=` works as on Overview.
 */

import { topicOn } from "@/shared/config/modules"
import { master, zoneName, type Kamera } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"
import { inPlace, placed, sitesIn } from "@/shared/data/scope"
import { healthEvents, type HealthEvent } from "@/shared/data/skenario"

export type Camera = Option & {
  site: string
  zona: Option
  /** Low-resolution sub-stream for grid tiles. */
  streamUrl: string
  /** High-resolution stream for the single-camera view. Falls back to `streamUrl`. */
  streamUrlHd?: string
  /** MIME type, e.g. `application/x-mpegURL` for HLS or `video/mp4`. */
  streamType: string
}

/** From the server. `since` is when the camera entered this state, so an offline camera's `since` is its last time online. */
export type CameraStatus = { online: boolean; since: Date }

const MINUTE = 60_000

export const toCamera = (k: Kamera): Camera => ({
  id: k.id,
  label: `${k.id} · ${k.nama}`,
  site: k.site,
  zona: { id: k.zona, label: zoneName(k.zona) },
  streamUrl: k.streamUrl,
  streamUrlHd: k.streamUrlHd || undefined,
  streamType: k.streamType,
})

/** Changes since the page loaded. Before any, a camera follows the demo story in data/skenario.ts. */
const statuses = new Map<string, CameraStatus>()
const upSince = new Date(Date.now() - 600 * MINUTE)

function fromStory(id: string): CameraStatus | undefined {
  const h = healthEvents().find((e) => e.source === id && e.kind === "camera-offline" && !e.restoredAt)
  return h && { online: false, since: h.startedAt }
}

export const cameraStatusOf = (id: string) => statuses.get(id) ?? fromStory(id) ?? { online: true, since: upSince }
const statusOf = cameraStatusOf

/** Camera outages that began or ended while the page was open, as health events. */
const liveHealth: HealthEvent[] = []
let liveHealthNo = 1
export const liveCameraHealth = () => liveHealth

const activeCameras = () => master().kamera.filter((k) => k.aktif)

/** Active cameras the server currently reports offline. The unified event list turns each into an open event. */
export const offlineCameras = () =>
  activeCameras().flatMap((k) => {
    const status = statusOf(k.id)
    return status.online ? [] : [{ camera: toCamera(k), since: status.since }]
  })

export type CameraList = { cameras: Camera[]; status: Record<string, CameraStatus> }

export function getCameras(f: Filters) {
  return respond(
    f,
    (): CameraList => {
      const here = inPlace(f)
      const cameras = activeCameras()
        .filter((k) => here(k.site, k.zona))
        .map((k) => placed(f)(toCamera(k)))
      return { cameras, status: Object.fromEntries(cameras.map((c) => [c.id, statusOf(c.id)])) }
    },
    { cameras: [], status: {} },
  )
}

/**
 * Pushes a camera status change every 40 seconds and returns an unsubscribe function.
 * ponytail: timer stand-in for the WebSocket. It brings an offline camera back, or
 * takes one down while fewer than three are offline.
 */
export function subscribeCameraStatus(f: Filters, onChange: (id: string, status: CameraStatus) => void) {
  if (f.demo || !topicOn("camera.status")) return () => {}
  const timer = setInterval(() => {
    const sites = sitesIn(f)
    const pool = activeCameras().filter((k) => sites.includes(k.site))
    const camera = pool[Math.floor(Math.random() * pool.length)]
    if (!camera) return
    const current = statusOf(camera.id)
    if (current.online && offlineCameras().length >= 3) return
    const next = { online: !current.online, since: new Date() }
    statuses.set(camera.id, next)
    if (!next.online)
      liveHealth.unshift({
        id: `HLT-L${String(liveHealthNo++).padStart(3, "0")}`,
        source: camera.id,
        kind: "camera-offline",
        startedAt: next.since,
        reason: "Stream berhenti terdeteksi oleh server.",
      })
    else {
      const open = liveHealth.find((h) => h.source === camera.id && !h.restoredAt)
      if (open) open.restoredAt = next.since
    }
    onChange(camera.id, next)
  }, 40_000)
  return () => clearInterval(timer)
}
