import { ImageOff } from "lucide-react"

import type { AiEvent } from "@/features/indications/data/indikasi"
import { kategoriDef } from "@/shared/config/indikasi"
import { master } from "@/shared/data/master"
import { tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"

const cameraOf = (event: AiEvent) => master().kamera.find((camera) => camera.id === event.kamera)

/** A stable box per indication, so the same thumbnail always marks the same spot. */
function boxOf(id: string) {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return { x: 18 + (hash % 44), y: 16 + ((hash >> 8) % 34), w: 16 + ((hash >> 16) % 10), h: 30 + ((hash >> 4) % 18) }
}

/** The frame that rode with an indication; the edge API returns the real thumbnail URL. */
export function Thumbnail({ e, className, label = true }: { e: AiEvent; className?: string; label?: boolean }) {
  const camera = cameraOf(e)
  const box = boxOf(e.id)
  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-lg bg-default", className)}>
      {camera && e.thumbnail === "synced" ? (
        <video src={`${camera.streamUrl}#t=${1 + (box.x % 4)}`} preload="metadata" muted playsInline aria-label={tr(`Thumbnail ${e.judul}, ${e.kamera}`, `Thumbnail ${e.judul}, ${e.kamera}`)} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-center text-xs text-muted">
          <span className="flex flex-col items-center gap-1">
            <ImageOff className="size-5" aria-hidden />
            {tr("Thumbnail di antrean edge", "Thumbnail queued on the edge")}
          </span>
        </div>
      )}
      {e.thumbnail === "synced" && (
        <div className="absolute border-2 border-danger" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }} aria-hidden>
          {label && <span className="absolute -top-px left-0 -translate-y-full bg-danger px-1 py-px text-[10px] whitespace-nowrap text-danger-foreground">{kategoriDef(e.kategori).label}</span>}
        </div>
      )}
    </div>
  )
}
