import "@videojs/react/video/skin.css"
import { useEffect, useRef } from "react"
import { HlsVideo } from "@videojs/react/media/hls-video"
import { Video, VideoPlayer, VideoSkin } from "@videojs/react/video"

export type PlayerStatus = "loading" | "playing" | "error"

/** Waiting this long without playback progress counts as a dropped stream. */
const STALL_MS = 10_000

type CameraPlayerProps = {
  src: string
  /** MIME type. HLS types play through Video.js's HLS media; everything else through the native element. */
  type: string
  label: string
  muted?: boolean
  /** Full player controls. Grid tiles go without; the single-camera view has them. */
  controls?: boolean
  className?: string
  onStatusChange?: (status: PlayerStatus) => void
}

/**
 * Plays one stream URL and reports whether it is playing. It knows nothing about cameras,
 * so the stream protocol can change per client without touching the grid.
 * Unmounting it is its dispose(): Video.js tears the media down with the element.
 */
export function CameraPlayer({ src, type, label, muted = true, controls = false, className, onStatusChange }: CameraPlayerProps) {
  const stall = useRef<ReturnType<typeof setTimeout>>(undefined)
  const last = useRef<PlayerStatus>("loading")

  useEffect(() => () => clearTimeout(stall.current), [])

  const emit = (status: PlayerStatus) => {
    if (last.current === status) return
    last.current = status
    onStatusChange?.(status)
  }
  // `waiting` and `stalled` can clear on their own, so only a long wait without progress is an error.
  const watchStall = () => {
    stall.current ??= setTimeout(() => emit("error"), STALL_MS)
  }
  const props = {
    src,
    muted,
    autoPlay: true,
    playsInline: true,
    // The mock MP4s loop to stand in for a live stream.
    loop: type === "video/mp4",
    "aria-label": label,
    className: controls ? undefined : className,
    onLoadStart: watchStall,
    onWaiting: watchStall,
    onStalled: watchStall,
    onTimeUpdate: () => {
      clearTimeout(stall.current)
      stall.current = undefined
      emit("playing")
    },
    onError: () => {
      clearTimeout(stall.current)
      emit("error")
    },
  }
  const media = /mpegurl/i.test(type) ? <HlsVideo {...props} /> : <Video {...props} />

  return controls ? (
    <VideoPlayer>
      <VideoSkin className={className} style={{ width: "100%", aspectRatio: "16 / 9" }}>
        {media}
      </VideoSkin>
    </VideoPlayer>
  ) : (
    media
  )
}
