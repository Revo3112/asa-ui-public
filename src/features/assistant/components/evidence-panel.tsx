import { useState } from "react"
import { Button, buttonVariants, Spinner } from "@heroui/react"
import { ChevronLeft, ChevronRight, CloudDownload, Play, X } from "lucide-react"
import { Link } from "react-router"

import { CameraPlayer } from "@/features/cctv/components/camera-player"
import { Thumbnail } from "@/features/indications/components/evidence-thumbnail"
import { SeverityChip } from "@/shared/components/severity-chip"
import { WorkflowChip } from "@/shared/components/status-chip"
import { clipStateLabel, kategoriDef, tierLabel } from "@/shared/config/indikasi"
import type { AiEvent } from "@/features/indications/data/indikasi"
import { findIndication, requestClip } from "@/features/indications/data/indikasi"
import { master } from "@/shared/data/master"
import { locale, tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"
import { runWorkflow, useWorkflowVersion } from "@/shared/lib/workflow-ui"

const cameraOf = (e: AiEvent) => master().kamera.find((k) => k.id === e.kamera)
const time = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** Evidence cards under a reply: one per cited indication. Opening one shows it in the viewer. */
export function EvidenceStrip({ ids, activeId, onOpen, site, caption = true }: { ids: string[]; activeId?: string; onOpen: (id: string) => void; site: string; caption?: boolean }) {
  "use no memo"
  const events = ids.flatMap((id) => findIndication({ site }, id) ?? [])
  if (!events.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      {caption && <p className="text-xs text-muted">{tr("Bukti", "Evidence")}</p>}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {events.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onOpen(e.id)}
              aria-pressed={activeId === e.id}
              className={cn("group flex w-full flex-col gap-1 rounded-xl border border-border p-1.5 text-left hover:bg-default focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none", activeId === e.id && "border-accent bg-default")}
            >
              <span className="relative block">
                <Thumbnail e={e} label={false} />
                <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100" aria-hidden>
                  <span className="grid size-8 place-items-center rounded-full bg-black/60 text-white">
                    <Play className="size-4 fill-current" />
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-1.5 px-0.5">
                <SeverityChip severity={e.severity} />
                <span className="truncate text-xs font-medium">{e.id}</span>
              </span>
              <span className="line-clamp-1 px-0.5 text-xs text-muted">
                {e.zona.label} · {time(e.waktu)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

type PanelProps = {
  id: string
  /** The evidence of the same reply, for previous/next. */
  ids: string[]
  site: string
  onNavigate: (id: string) => void
  onClose: () => void
  className?: string
}

/**
 * The evidence viewer beside the conversation: the thumbnail, the clip once it is on the server,
 * and where the event came from. It never leaves the assistant page; "Buka di Indikasi AI" is the
 * explicit way out to review it.
 */
export function EvidencePanel({ id, ids, site, onNavigate, onClose, className }: PanelProps) {
  // Reads the indication store during render (its clip state changes in place), which the React Compiler would cache.
  "use no memo"
  useWorkflowVersion()
  const [, setTick] = useState(0)
  const e = findIndication({ site }, id)
  const at = ids.indexOf(id)
  const cam = e && cameraOf(e)

  return (
    <section className={cn("flex min-h-0 flex-col rounded-2xl bg-surface", className)} aria-label={tr("Penampil bukti", "Evidence viewer")}>
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <span className="me-auto text-sm font-medium">{tr("Bukti", "Evidence")}</span>
        {ids.length > 1 && (
          <>
            <Button isIconOnly size="sm" variant="tertiary" aria-label={tr("Bukti sebelumnya", "Previous evidence")} isDisabled={at <= 0} onPress={() => onNavigate(ids[at - 1])}>
              <ChevronLeft aria-hidden />
            </Button>
            <span className="text-xs text-muted tabular-nums">
              {at + 1}/{ids.length}
            </span>
            <Button isIconOnly size="sm" variant="tertiary" aria-label={tr("Bukti berikutnya", "Next evidence")} isDisabled={at >= ids.length - 1} onPress={() => onNavigate(ids[at + 1])}>
              <ChevronRight aria-hidden />
            </Button>
          </>
        )}
        <Button isIconOnly size="sm" variant="tertiary" aria-label={tr("Tutup penampil bukti", "Close evidence viewer")} onPress={onClose}>
          <X aria-hidden />
        </Button>
      </header>

      {!e ? (
        <p className="p-4 text-sm text-muted">{tr(`Indikasi ${id} tidak ditemukan.`, `Indication ${id} not found.`)}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-medium">{e.judul}</h3>
            <p className="text-xs text-muted">
              {e.id} · {e.zona.label}
            </p>
          </div>

          {e.clip === "available" && cam ? (
            <div className="flex flex-col gap-1">
              <CameraPlayer key={e.id} src={cam.streamUrlHd || cam.streamUrl} type={cam.streamType || "video/mp4"} label={tr(`Klip ${e.id}`, `Clip ${e.id}`)} controls className="overflow-hidden rounded-lg" />
              <p className="text-xs text-muted">{tr("Klip dari edge, beberapa detik sebelum dan sesudah deteksi.", "Clip from the edge, a few seconds either side of the detection.")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Thumbnail e={e} />
              <p className="text-xs text-muted">
                {tr("Klip", "Clip")}: {clipStateLabel[e.clip]}. {e.uplink && tr("Klip hanya menyeberang link saat diminta, supaya bandwidth tidak habis.", "Clips only cross the link on request, to save bandwidth.")}
              </p>
              {e.clip === "on-edge" ? (
                <Button size="sm" variant="secondary" className="self-start" onPress={() => runWorkflow(() => requestClip(e.id, () => setTick((n) => n + 1)), tr("Klip diminta. Diputar di sini begitu terunggah.", "Clip requested. It plays here once uploaded.")).then(() => setTick((n) => n + 1))}>
                  <CloudDownload aria-hidden />
                  {tr("Minta klip dari edge", "Request clip from edge")}
                </Button>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted" role="status">
                  <Spinner size="sm" />
                  {tr("Edge sedang mengunggah klip…", "The edge is uploading the clip…")}
                </p>
              )}
            </div>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted">Severity</dt>
            <dd>
              <SeverityChip severity={e.severity} />
            </dd>
            <dt className="text-muted">{tr("Review", "Review")}</dt>
            <dd>
              <WorkflowChip value={e.workflow} />
            </dd>
            <dt className="text-muted">{tr("Kategori", "Category")}</dt>
            <dd>{kategoriDef(e.kategori).label}</dd>
            <dt className="text-muted">{tr("Kamera", "Camera")}</dt>
            <dd>{cam ? `${cam.nama} (${cam.id})` : e.kamera}</dd>
            <dt className="text-muted">{tr("Sumber", "Source")}</dt>
            <dd>
              {tierLabel[e.tier]}
              {e.perangkat && ` · ${e.perangkat}`}
            </dd>
            <dt className="text-muted">{tr("Terdeteksi", "Detected")}</dt>
            <dd>{time(e.waktu)}</dd>
            <dt className="text-muted">{tr("Skor detektor", "Detector score")}</dt>
            <dd>
              {e.confidence.toLocaleString(locale(), { minimumFractionDigits: 2 })} <span className="text-muted">{tr("(bukan akurasi)", "(not accuracy)")}</span>
            </dd>
          </dl>

          <Link to={`/indikasi?${new URLSearchParams({ site: e.site, id: e.id, periode: "30d", status: "semua" })}`} className={buttonVariants({ size: "sm", variant: "secondary", className: "self-start" })}>
            {tr("Buka di Indikasi AI untuk review", "Open in AI Indications to review")}
          </Link>
        </div>
      )}
    </section>
  )
}
